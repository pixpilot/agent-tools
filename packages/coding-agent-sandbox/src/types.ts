/**
 * Types shared across the sandbox CLI.
 */
import type { ReasoningEffort } from './agents/reasoning-effort';
import type { NetworkMode } from './network/network-mode';

/** How an agent proves it is signed in, and how to sign it in when it is not. */
export interface AgentAuthConfig {
  /** Shell test that exits 0 when the agent is already authenticated. */
  probe: string;
  /** Optional non-interactive-ish login command run before launching. */
  loginCommand?: string | undefined;
  /** Message shown when the agent still needs to sign in. */
  hint: string;
}

/** Inputs used to build the agent's interactive launch command. */
export interface AgentLaunchOptions {
  /** Grant the agent unattended tool/permission access inside the sandbox. */
  fullAccess: boolean;
  /** Initial user message passed as one safely quoted positional argument. */
  prompt?: string | undefined;
  /** Model the agent should use; the name is agent-specific and unvalidated. */
  model?: string | undefined;
  /** Reasoning effort; ignored by agents whose CLI has no equivalent flag. */
  effort?: ReasoningEffort | undefined;
  /** Trusted shell text appended to the agent command; never accept untrusted input. */
  extraArgs?: string | undefined;
}

/** Resolved details of the main Git repository the session is based on. */
export interface RepositoryInfo {
  /** Working tree root of the main checkout. */
  root: string;
  /** Shared `.git` directory (`--git-common-dir`). */
  gitDir: string;
  /** Directory name of the main checkout, e.g. `roleclick`. */
  name: string;
  /** Parent directory of the main checkout. */
  parent: string;
  /** Ref new branches are created from when no base is given. */
  headRef: string;
}

/** The branch and worktree a session is about to use. */
export interface WorktreePlan {
  taskSlug: string;
  branch: string;
  path: string;
}

/** Result of creating or reusing the session worktree. */
export interface WorktreeInfo extends WorktreePlan {
  created: boolean;
  /** Worktree git dir, relative to the repository's shared `.git` directory. */
  gitDirRelative: string;
}

/** A portable source of non-sensitive configuration assets. */
export interface ConfigSourceInfo {
  path: string;
  available: readonly string[];
  /** Removes a temporary snapshot after the session ends. */
  cleanup?: (() => void) | undefined;
}

/** A Docker volume or bind mount added to the session container. */
export interface MountSpec {
  source: string;
  target: string;
  readOnly?: boolean | undefined;
}

/** Options accepted by the sandbox session runner. */
export interface SandboxOptions {
  agent: string;
  repo: string;
  task: string;
  configsDir?: string | undefined;
  branch?: string | undefined;
  worktree?: string | undefined;
  base?: string | undefined;
  image?: string | undefined;
  /** Initial user message passed safely to the selected coding agent. */
  prompt?: string | undefined;
  /** Trusted shell text, evaluated inside the container. */
  agentArgs?: string | undefined;
  /** Model passed to the agent, overriding any `agents.jsonc` default. */
  model?: string | undefined;
  /** Reasoning effort, overriding any `agents.jsonc` default. */
  effort?: ReasoningEffort | undefined;
  fullAccess: boolean;
  install: boolean;
  configs: boolean;
  gitMount: boolean;
  updateAgent: boolean;
  rebuildImage: boolean;
  login: boolean;
  dryRun: boolean;
  /** How much of the network the session gets. Replaces the old `offline` flag. */
  network: NetworkMode;
  /** Extra hosts allowed in `strict`, on top of the resolved allowlist. */
  allowHosts?: readonly string[] | undefined;
  /** `docker run --cpus` value; unconstrained when unset. */
  cpus?: string | undefined;
  /** `docker run --memory` value; unconstrained when unset. */
  memory?: string | undefined;
  /** `docker run --pids-limit` value; a hardened default applies when unset. */
  pidsLimit?: string | undefined;
  yes: boolean;
}

/** A named Docker volume mounted at a container path. */
export interface VolumeMount {
  name: string;
  target: string;
}

/** Everything `docker run` needs for one sandbox session. */
export interface SessionPlan {
  agentId: string;
  agentLabel: string;
  image: string;
  containerName: string;
  repositoryRoot: string;
  worktreePath: string;
  /** Host path of the isolated Git directory used only by this session. */
  gitDirPath: string;
  /** File that replaces the worktree's host `.git` pointer inside the container. */
  gitPointerPath?: string | undefined;
  /** Mount isolated Git metadata so Git works inside the worktree. */
  mountGit: boolean;
  configsPath: string;
  volumes: VolumeMount[];
  env: Record<string, string>;
  /** Allocate a TTY; false when stdin is not a terminal. */
  tty: boolean;
  network: NetworkMode;
  /**
   * Per-session internal Docker network the container joins in `strict` and
   * `open`. Absent until the session network has been created.
   */
  networkName?: string | undefined;
  cpus?: string | undefined;
  memory?: string | undefined;
  pidsLimit?: string | undefined;
}
