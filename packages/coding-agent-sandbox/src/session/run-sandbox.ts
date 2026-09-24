import type { AgentId } from '@pixpilot/agent-config-sync';
import type { NpmRegistryAuth } from '../environments/parse-npm-auth';
import type { ProxyAudit } from '../network/extract-proxy-hosts';
import type { ConfigSourceInfo, SandboxOptions, SessionPlan } from '../types';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { getAgent } from '../agents/agent-registry';
import { parseModelSpec } from '../agents/parse-model-spec';
import { describeProviderMcp, PROVIDER_MCP_FLAG } from '../agents/provider-mcp';
import { readAgentSettings } from '../configs/read-agent-settings';
import { resolveConfigSource } from '../configs/resolve-config-source';
import { PROMPT_WARN_CHARS } from '../constants';
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
import { discoverNpmAuth } from '../environments/discover-npm-auth';
import { withDownloadHosts } from '../environments/npm-registry-hosts';
import { findMissingNpmTokens, parseNpmAuthList } from '../environments/parse-npm-auth';
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
import { buildSessionEnv, installsDependencies } from './build-session-env';
import { buildSessionVolumes } from './build-session-volumes';
import { composePrompt } from './compose-prompt';
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

  // A provider gateway is a remote service, so the flag cannot mean anything
  // without a network; failing is clearer than accepting it and ignoring it.
  if (offline && options.allowProviderMcp === true) {
    throw new Error(
      `${PROVIDER_MCP_FLAG} cannot be combined with --network none: the gateway is reached over the network.`,
    );
  }

  // Checked before any side effect, so a malformed entry or a missing token
  // never leaves a worktree behind.
  const explicitNpmAuth = parseNpmAuthList(options.npmAuth);
  ensureNpmTokens(explicitNpmAuth, options);
  const providerMcp = describeProviderMcp(agent, options.allowProviderMcp);

  if (providerMcp != null && !offline) {
    detail(providerMcp);
  }

  if (!options.dryRun) {
    ensureDocker();
  }

  step('Validating the Git repository');
  const repository = resolveRepository(options.repo);
  detail(`${repository.root} (base ref: ${repository.headRef})`);

  // Registries come from the main checkout for the same reason as the allowlist.
  const requestedNpmAuth = withDiscoveredNpmAuth(
    explicitNpmAuth,
    repository.root,
    options,
  );

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
  // Shared instructions from `agents.jsonc` extend a prompt the user gave;
  // a session opened without one still opens idle.
  const prompt = composePrompt(options.prompt, settings.promptSuffix?.text);
  const session: SandboxOptions = {
    ...options,
    model: requested.model ?? settings.model,
    effort,
    prompt,
  };

  if (effort != null && !agent.supportsEffort) {
    warn(
      `${agent.label} has no reasoning-effort setting: --effort ${effort} is ignored.`,
    );
  }

  if (settings.promptSuffix != null && prompt !== options.prompt) {
    detail(
      `prompt suffix: ${settings.promptSuffix.source} (${settings.promptSuffix.text.length} chars)`,
    );
  }

  if (prompt != null && prompt.length > PROMPT_WARN_CHARS) {
    warn(
      `The initial prompt is ${prompt.length} characters; agent CLIs may truncate a prompt this long.`,
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
      await ensureWorktreeSourceIsClean(repository.root, {
        nonInteractive: options.yes,
        allowDirty: options.allowDirty,
      });
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

    const npmAuth = selectNpmAuth(
      requestedNpmAuth,
      installsDependencies(environment, options),
    );

    const containerName = buildContainerName(agent.id, worktree.taskSlug, worktree.path);
    const proxied = usesProxy(options.network);
    const names = sessionNetworkNames(containerName);
    const sandboxGit =
      options.gitMount && !options.dryRun
        ? prepareSandboxGit(repository, worktree)
        : undefined;
    // The repository's own remotes must be reachable, or a session whose purpose
    // is committing to that repository cannot fetch, pull or push. Project
    // registries come from the main checkout: the worktree is agent-writable.
    const egressHosts = resolveEgressHosts({
      agent,
      environment,
      extraHosts: [
        ...getRemoteHosts(repository.root),
        ...(environment?.projectEgressHosts(repository.root) ?? []),
        ...npmAuth.flatMap(({ host }) => withDownloadHosts(host)),
        ...(options.allowHosts ?? []),
      ],
      allowProviderMcp: options.allowProviderMcp,
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
          npmAuth,
        }),
        ...(proxied ? buildProxyEnv(names.proxyUrl) : {}),
      },
      hostEnv: npmAuth.map(({ envVar }) => envVar),
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

/**
 * A token `--npm-auth` names must be set on the host: failing here is clearer
 * than a 401 buried in the install output. Skipped when nothing is installed.
 */
function ensureNpmTokens(
  requested: readonly NpmRegistryAuth[],
  options: SandboxOptions,
): void {
  const missing = findMissingNpmTokens(requested);

  if (missing.length === 0 || !options.install || options.network === 'none') {
    return;
  }

  const message = `--npm-auth needs ${missing.join(', ')} set in this environment.`;

  if (!options.dryRun) {
    throw new Error(message);
  }
  warn(message);
}

/**
 * `--auto-npm-auth` adds the token variables the npmrc files name for the
 * project's registries. An explicit `--npm-auth` for the same registry wins,
 * and an unset variable only warns: nobody asked for that token by name.
 */
function withDiscoveredNpmAuth(
  explicit: readonly NpmRegistryAuth[],
  repositoryRoot: string,
  options: SandboxOptions,
): readonly NpmRegistryAuth[] {
  if (options.autoNpmAuth !== true || !options.install || options.network === 'none') {
    return explicit;
  }

  const named = new Set(explicit.map(({ host }) => host));
  const { found, missing } = discoverNpmAuth(repositoryRoot);

  for (const { host, envVar, source } of missing) {
    if (!named.has(host)) {
      warn(
        `${envVar} (named in ${source}) is not set: ${host} installs without a token.`,
      );
    }
  }

  if (found.length === 0 && missing.length === 0) {
    detail('--auto-npm-auth: no npmrc token variable matches the project registries.');
  }

  return [
    ...explicit,
    ...found
      .filter(({ host }) => !named.has(host))
      .map(({ host, envVar }) => ({ host, envVar })),
  ];
}

/** The entries this session forwards; a token has no use without an install. */
function selectNpmAuth(
  requested: readonly NpmRegistryAuth[],
  installing: boolean,
): readonly NpmRegistryAuth[] {
  if (requested.length === 0) {
    return [];
  }

  if (!installing) {
    warn('Registry auth is ignored: this session does not install dependencies.');
    return [];
  }

  detail(
    `registry auth: ${requested.map(({ host, envVar }) => `${host} (${envVar})`).join(', ')}`,
  );
  return requested;
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
