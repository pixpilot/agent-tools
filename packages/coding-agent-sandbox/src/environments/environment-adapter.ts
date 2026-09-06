/**
 * Contract for project environments. Each environment knows how to recognise a
 * project and how to install its dependencies inside the container.
 */
export abstract class EnvironmentAdapter {
  /** Stable id, e.g. `node`. */
  abstract readonly id: string;
  /** Human-readable name shown in logs. */
  abstract readonly label: string;

  /** True when this adapter recognises the project in the given worktree. */
  abstract detect(worktreePath: string): boolean;

  /** Shell command that installs project dependencies in `/workspace`. */
  abstract readonly installCommand: string;

  /**
   * Container paths kept in named volumes instead of the host worktree, so
   * dependency trees are neither written to Windows nor reinstalled each run.
   */
  readonly volumePaths: readonly string[] = [];
}
