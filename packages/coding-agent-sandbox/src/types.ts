/**
 * Types shared across the sandbox CLI.
 */

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

/** A validated canonical skills/prompts repository. */
export interface SkillsInfo {
  path: string;
  /** Command that runs the repository's own sync utility. */
  syncCommand: string;
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
  skillsDir?: string | undefined;
  skillsRepo?: string | undefined;
  branch?: string | undefined;
  worktree?: string | undefined;
  base?: string | undefined;
  image?: string | undefined;
  /** Trusted shell text, evaluated inside the container. */
  agentArgs?: string | undefined;
  /** Extra home-relative placeholder files seeded before the skills sync. */
  seedFiles?: readonly string[] | undefined;
  fullAccess: boolean;
  install: boolean;
  skills: boolean;
  gitMount: boolean;
  updateAgent: boolean;
  rebuildImage: boolean;
  login: boolean;
  dryRun: boolean;
  /** Disable container networking and all network-dependent bootstrap steps. */
  offline?: boolean | undefined;
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
  /** Host path of the repository's shared `.git` directory. */
  gitDirPath: string;
  /** Mount the shared `.git` directory so Git works inside the worktree. */
  mountGit: boolean;
  skillsPath: string;
  volumes: VolumeMount[];
  env: Record<string, string>;
  /** Allocate a TTY; false when stdin is not a terminal. */
  tty: boolean;
  offline?: boolean | undefined;
}
