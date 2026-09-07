import type { SandboxOptions, SessionPlan } from '../types';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { getAgent } from '../agents/agent-registry';
import { ensureDocker } from '../docker/ensure-docker';
import { ensureImage } from '../docker/ensure-image';
import { ensureProxyImage } from '../docker/ensure-proxy-image';
import { ensureSessionNetwork } from '../docker/ensure-session-network';
import { ensureSessionVolumes } from '../docker/ensure-session-volumes';
import { pruneVolumes } from '../docker/prune-volumes';
import {
  printProxyAudit,
  readProxyHosts,
  removeSessionNetwork,
} from '../docker/remove-session-network';
import { runContainer } from '../docker/run-container';
import { detectEnvironment } from '../environments/detect-environment';
import { ensureWorktree } from '../git/ensure-worktree';
import { previewWorktree } from '../git/preview-worktree';
import { resolveRepository } from '../git/resolve-repository';
import { resolveWorktreePlan } from '../git/resolve-worktree-plan';
import { buildProxyEnv } from '../network/build-proxy-env';
import { usesProxy } from '../network/network-mode';
import { resolveEgressHosts } from '../network/resolve-egress-hosts';
import { sessionNetworkNames } from '../network/session-network-names';
import { resolveSkillsDirectory } from '../skills/resolve-skills-directory';
import { detail, step, success, warn } from '../utils/logger';
import { buildContainerName } from './build-container-name';
import { buildSessionEnv } from './build-session-env';
import { buildSessionVolumes } from './build-session-volumes';
import { ensureNoActiveContainer } from './ensure-no-active-container';
import { ensureWorktreeSourceIsClean } from './ensure-worktree-source-is-clean';
import { printSessionPlan } from './print-session-plan';
import { printSessionSummary } from './print-session-summary';

/**
 * Runs one sandboxed agent session end to end: validate, prepare the worktree,
 * start Docker, hand over the terminal, then report what was left behind.
 */
export async function runSandbox(options: SandboxOptions): Promise<number> {
  const agent = getAgent(options.agent);
  const offline = options.network === 'none';

  if (offline && (options.login || options.updateAgent || options.rebuildImage)) {
    throw new Error(
      '--network none cannot be combined with --login, --update-agent or --rebuild-image.',
    );
  }

  if (!options.dryRun) {
    ensureDocker();
  }

  step('Validating the Git repository');
  const repository = resolveRepository(options.repo);
  detail(`${repository.root} (base ref: ${repository.headRef})`);

  const plan = resolveWorktreePlan(repository, agent, options.task, {
    branch: options.branch,
    worktree: options.worktree,
  });

  const skills =
    options.skills && !offline
      ? await resolveSkillsDirectory({
          requested: options.skillsDir,
          repositoryUrl: options.skillsRepo,
          nonInteractive: options.yes || !process.stdin.isTTY,
        })
      : { path: repository.root, syncCommand: 'true' };

  if (offline) {
    warn(
      'No network: skipping skills, installs and login. Cloud agents cannot reach their providers.',
    );
  } else if (options.skills) {
    detail(`skills: ${skills.path}`);
  } else {
    warn('Skills provisioning disabled with --no-skills.');
  }

  if (!options.dryRun) {
    ensureNoActiveContainer(plan.path);
  }

  const preview = previewWorktree(repository, plan);
  if (!options.dryRun && preview.created) {
    await ensureWorktreeSourceIsClean(repository.root, { nonInteractive: options.yes });
  }

  step(`Preparing worktree for ${agent.label}`);
  const worktree = options.dryRun
    ? preview
    : ensureWorktree(repository, plan, { base: options.base });
  detail(`${worktree.path} on ${worktree.branch}`);

  if (!worktree.created && !options.dryRun) {
    warn('Reusing the existing worktree - nothing was recreated or overwritten.');
  }

  // During a dry run the worktree may not exist yet; the main checkout is
  // representative enough to preview the environment.
  const environment = detectEnvironment(
    existsSync(worktree.path) ? worktree.path : repository.root,
  );

  if (environment != null) {
    detail(`detected project environment: ${environment.label}`);
  }

  const containerName = buildContainerName(agent.id, worktree.taskSlug, worktree.path);
  const proxied = usesProxy(options.network);
  const names = sessionNetworkNames(containerName);
  const egressHosts = resolveEgressHosts({ agent, environment });

  const sessionPlan: SessionPlan = {
    agentId: agent.id,
    agentLabel: agent.label,
    image: options.dryRun
      ? (options.image ?? 'coding-agent-sandbox:dry-run')
      : ensureImage({
          image: options.image,
          rebuild: options.rebuildImage,
          network: options.network,
        }),
    containerName,
    repositoryRoot: repository.root,
    worktreePath: worktree.path,
    gitDirPath: repository.gitDir,
    mountGit: options.gitMount,
    skillsPath: skills.path,
    volumes: buildSessionVolumes(agent, environment, worktree.path),
    env: {
      ...buildSessionEnv({ agent, environment, repository, worktree, skills, options }),
      ...(proxied ? buildProxyEnv(names.proxyUrl) : {}),
    },
    tty: process.stdin.isTTY === true,
    network: options.network,
    networkName: proxied ? names.internal : undefined,
    cpus: options.cpus,
    memory: options.memory,
  };

  if (options.dryRun) {
    printSessionPlan(sessionPlan);
    return 0;
  }

  if (proxied) {
    ensureSessionNetwork({
      names,
      mode: options.network === 'open' ? 'open' : 'strict',
      allowHosts: egressHosts,
      labels: sessionPlan,
      proxyImage: ensureProxyImage({ rebuild: options.rebuildImage }),
    });
  }

  success(`Starting ${agent.label} in ${sessionPlan.containerName}`);
  ensureSessionVolumes(sessionPlan.volumes);
  let exitCode = 1;
  let proxyHosts: string[] = [];
  try {
    exitCode = await runContainer(sessionPlan);
  } finally {
    if (proxied) {
      // The log dies with the container, so read it before teardown.
      proxyHosts = readProxyHosts(names);
      removeSessionNetwork(names);
    }
    await pruneStaleVolumes();
  }

  if (proxied) {
    printProxyAudit(proxyHosts);
  }

  printSessionSummary(worktree, exitCode);

  if (exitCode !== 0 && options.network === 'strict') {
    warn(
      'This operation may require a host or protocol blocked by strict network mode. Retry with --network open if you trust this operation.',
    );
  }

  return exitCode;
}

async function pruneStaleVolumes(): Promise<void> {
  try {
    await pruneVolumes({ quiet: true, yes: true });
  } catch (cause) {
    warn(
      `Could not remove stale dependency volumes: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
}
