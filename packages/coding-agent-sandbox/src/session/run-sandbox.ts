import type { AgentId } from '@pixpilot/agent-config-sync';
import type { ProxyAudit } from '../network/extract-proxy-hosts';
import type { ConfigSourceInfo, SandboxOptions, SessionPlan } from '../types';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { getAgent } from '../agents/agent-registry';
import { parseModelSpec } from '../agents/parse-model-spec';
import { readAgentSettings } from '../configs/read-agent-settings';
import { resolveConfigSource } from '../configs/resolve-config-source';
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
import { getRemoteHosts } from '../git/get-remote-hosts';
import {
  importSandboxGit,
  keepSandboxGit,
  prepareSandboxGit,
  removeSandboxGit,
} from '../git/prepare-sandbox-git';
import { previewWorktree } from '../git/preview-worktree';
import { resolveRepository } from '../git/resolve-repository';
import { resolveWorktreePlan } from '../git/resolve-worktree-plan';
import { buildProxyEnv } from '../network/build-proxy-env';
import { usesProxy } from '../network/network-mode';
import { resolveEgressHosts } from '../network/resolve-egress-hosts';
import { sessionNetworkNames } from '../network/session-network-names';
import { detail, step, success, warn } from '../utils/logger';
import { buildContainerName } from './build-container-name';
import { buildSessionEnv } from './build-session-env';
import { buildSessionVolumes } from './build-session-volumes';
import { ensureNoActiveContainer } from './ensure-no-active-container';
import { ensureWorktreeSourceIsClean } from './ensure-worktree-source-is-clean';
import { printSessionPlan } from './print-session-plan';
import { printSessionSummary } from './print-session-summary';

const SHORT_COMMIT_LENGTH = 12;

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

  const configs: ConfigSourceInfo =
    options.configs && !offline
      ? resolveConfigSource({
          requested: options.configsDir,
          agent: agent.id as AgentId,
        })
      : { path: repository.root, available: [] };

  // `agents.jsonc` only supplies defaults; explicit flags always win. `--model`
  // may carry its own `:<effort>`, which an explicit `--effort` still overrides.
  const settings = readAgentSettings(options.configsDir, agent.id as AgentId);
  const requested = parseModelSpec(options.model);
  const effort = options.effort ?? requested.effort ?? settings.effort;
  const session: SandboxOptions = {
    ...options,
    model: requested.model ?? settings.model,
    effort,
  };

  if (effort != null && !agent.supportsEffort) {
    warn(
      `${agent.label} has no reasoning-effort setting: --effort ${effort} is ignored.`,
    );
  }

  try {
    if (offline) {
      warn(
        'No network: skipping configuration, installs and login. Cloud agents cannot reach their providers.',
      );
    } else if (options.configs) {
      detail(`configs: ${configs.path}`);
    } else {
      warn('Configuration provisioning disabled with --no-configs.');
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
    const sandboxGit =
      options.gitMount && !options.dryRun
        ? prepareSandboxGit(repository, worktree)
        : undefined;
    // The repository's own remotes must be reachable, or a session whose purpose
    // is committing to that repository cannot fetch, pull or push.
    const egressHosts = resolveEgressHosts({
      agent,
      environment,
      extraHosts: [...getRemoteHosts(repository.root), ...(options.allowHosts ?? [])],
    });

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
      gitDirPath: sandboxGit?.gitDir ?? repository.gitDir,
      gitPointerPath: sandboxGit?.pointerPath,
      mountGit: options.gitMount,
      configsPath: configs.path,
      volumes: buildSessionVolumes(agent, environment, worktree.path),
      env: {
        ...buildSessionEnv({
          agent,
          environment,
          repository,
          worktree,
          configs,
          options: session,
        }),
        ...(proxied ? buildProxyEnv(names.proxyUrl) : {}),
      },
      tty: process.stdin.isTTY === true,
      network: options.network,
      networkName: proxied ? names.internal : undefined,
      cpus: options.cpus,
      memory: options.memory,
      pidsLimit: options.pidsLimit,
    };

    if (options.dryRun) {
      if (sessionPlan.mountGit) {
        sessionPlan.gitPointerPath = `${repository.gitDir}/sandbox-git-pointer-preview`;
      }
      printSessionPlan(sessionPlan);
      return 0;
    }

    let exitCode = 1;
    let proxyHosts: ProxyAudit = { reached: [], blocked: [] };
    let preserveSandboxGit = false;
    try {
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
      exitCode = await runContainer(sessionPlan);
    } finally {
      if (sandboxGit != null) {
        try {
          const imported = importSandboxGit(sandboxGit, repository, worktree);
          if (imported != null) {
            detail(
              `Imported sandbox commit ${imported.slice(0, SHORT_COMMIT_LENGTH)} into ${worktree.branch}.`,
            );
          }
        } catch (cause) {
          preserveSandboxGit = true;
          keepSandboxGit(sandboxGit);
          warn(
            `Could not import sandbox commits safely: ${
              cause instanceof Error ? cause.message : String(cause)
            }. Private Git data was kept at ${sandboxGit.root} for recovery.`,
          );
        } finally {
          if (!preserveSandboxGit) {
            removeSandboxGit(sandboxGit);
          }
        }
      }

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
  } finally {
    configs.cleanup?.();
  }
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
