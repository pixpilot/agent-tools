import type { AgentAdapter } from '../agents/agent-adapter';
import type { EnvironmentAdapter } from '../environments/environment-adapter';
import type { RepositoryInfo, SandboxOptions, SkillsInfo, WorktreeInfo } from '../types';
import os from 'node:os';
import {
  CONTAINER_GIT_DIR,
  CONTAINER_SKILLS_SRC,
  CONTAINER_SKILLS_WORK,
  CONTAINER_STATE_ROOT,
  CONTAINER_WORKSPACE,
} from '../constants';
import { getGitIdentity } from '../git/get-git-status';
import { partitionSeedFiles } from '../skills/seed-files';

export interface SessionEnvInputs {
  agent: AgentAdapter;
  environment: EnvironmentAdapter | undefined;
  repository: RepositoryInfo;
  worktree: WorktreeInfo;
  skills: SkillsInfo;
  options: SandboxOptions;
}

/**
 * Builds the `SANDBOX_*` contract consumed by the container entrypoint. All
 * agent- and environment-specific behaviour reaches the container through here.
 * Commands are trusted shell code: keep task names and paths out of them.
 * agentArgs is an explicit raw-shell override; callers must never use untrusted input.
 */
export function buildSessionEnv(inputs: SessionEnvInputs): Record<string, string> {
  const { agent, environment, repository, worktree, options } = inputs;
  const seeds = partitionSeedFiles(options.seedFiles ?? []);

  const env: Record<string, string> = {
    SANDBOX_OFFLINE: options.offline ? '1' : '0',
    SANDBOX_AGENT_ID: agent.id,
    SANDBOX_AGENT_LABEL: agent.label,
    SANDBOX_AGENT_BIN: agent.binary,
    SANDBOX_AGENT_INSTALL: agent.installCommand,
    SANDBOX_AGENT_UPDATE: options.updateAgent ? '1' : '0',
    SANDBOX_AGENT_CMD: agent.launchCommand({
      fullAccess: options.fullAccess,
      extraArgs: options.agentArgs,
    }),
    SANDBOX_STATE_ROOT: CONTAINER_STATE_ROOT,
    SANDBOX_STATE_DIRS: agent.stateDirs.join('\n'),
    SANDBOX_STATE_FILES: agent.stateFiles.join('\n'),
    SANDBOX_AUTH_PROBE: agent.auth.probe,
    SANDBOX_AUTH_HINT: agent.auth.hint,
    SANDBOX_AUTH_VOLUME: agent.authVolume,
    SANDBOX_FORCE_LOGIN: options.login ? '1' : '0',
    SANDBOX_SKILLS_ENABLED: options.skills && !options.offline ? '1' : '0',
    SANDBOX_SKILLS_SRC: CONTAINER_SKILLS_SRC,
    SANDBOX_SKILLS_WORK: CONTAINER_SKILLS_WORK,
    SANDBOX_SKILLS_SYNC_CMD: inputs.skills.syncCommand,
    SANDBOX_POST_SYNC_CMD: agent.postSyncCommand(),
    SANDBOX_SEED_JSON: seeds.json.join('\n'),
    SANDBOX_SEED_EMPTY: seeds.empty.join('\n'),
    SANDBOX_HOST_USER: hostUser(),
    SANDBOX_TASK: worktree.taskSlug,
    SANDBOX_BRANCH: worktree.branch,
  };

  if (agent.auth.loginCommand != null) {
    env['SANDBOX_LOGIN_CMD'] = agent.auth.loginCommand;
  }

  if (environment != null && options.install && !options.offline) {
    env['SANDBOX_ENV_LABEL'] = environment.label;
    env['SANDBOX_DEPS_INSTALL'] = environment.installCommand;
  }

  if (options.gitMount) {
    // Worktree .git files point at host paths, so Git is steered explicitly.
    env['GIT_DIR'] = `${CONTAINER_GIT_DIR}/${worktree.gitDirRelative}`;
    env['GIT_WORK_TREE'] = CONTAINER_WORKSPACE;
  }

  const identity = getGitIdentity(repository.root);

  if (identity.name != null) {
    env['GIT_AUTHOR_NAME'] = identity.name;
    env['GIT_COMMITTER_NAME'] = identity.name;
  }

  if (identity.email != null) {
    env['GIT_AUTHOR_EMAIL'] = identity.email;
    env['GIT_COMMITTER_EMAIL'] = identity.email;
  }

  return env;
}

/** Host account name, used to shim `<Drive>:/Users/<name>` paths into $HOME. */
function hostUser(): string {
  try {
    return os.userInfo().username;
  } catch {
    return '';
  }
}
