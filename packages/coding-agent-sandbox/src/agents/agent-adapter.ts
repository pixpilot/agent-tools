import type { AgentAuthConfig, AgentLaunchOptions } from '../types';

/**
 * Contract every coding agent implements. Adding an agent means adding one
 * subclass and registering it - nothing else in the CLI needs to change.
 */
export abstract class AgentAdapter {
  /** Stable id used in branch names, volume names and `--agent`. */
  abstract readonly id: string;
  /** Human-readable name shown in prompts and logs. */
  abstract readonly label: string;
  /** Executable name inside the container, used to skip redundant installs. */
  abstract readonly binary: string;
  /** Shell command that installs the agent CLI inside the container. */
  abstract readonly installCommand: string;
  /** How the agent proves it is signed in. */
  abstract readonly auth: AgentAuthConfig;

  /**
   * Provider hosts this agent must reach in `strict` network mode, including
   * its OAuth login flow. Signing in reaches more hosts than a running session,
   * so verify these in `open` mode against a fresh, unauthenticated volume.
   */
  readonly egressHosts: readonly string[] = [];

  /** Home-relative directories persisted in the agent's Docker auth volume. */
  readonly stateDirs: readonly string[] = [];
  /** Home-relative files persisted in the agent's Docker auth volume. */
  readonly stateFiles: readonly string[] = [];

  /** Shell command that launches the agent interactively in `/workspace`. */
  abstract launchCommand(options: AgentLaunchOptions): string;

  /** Shell command run after config sync, e.g. to link the shared skills directory. */
  postSyncCommand(): string {
    return '';
  }

  /** Docker volume holding this agent's credentials and settings. */
  get authVolume(): string {
    return `coding-agent-sandbox-auth-${this.id}`;
  }

  /** Segment used in the `ai/<segment>/<task>` branch name. */
  get branchSegment(): string {
    return this.id;
  }

  /** Joins the base command with the full-access flag and any extra args. */
  protected buildCommand(parts: Array<string | undefined>, extraArgs?: string): string {
    return [...parts, extraArgs]
      .filter((part): part is string => part != null && part.trim() !== '')
      .join(' ');
  }
}
