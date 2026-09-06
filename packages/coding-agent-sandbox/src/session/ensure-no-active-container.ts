import { findWorktreeContainers } from '../docker/find-worktree-containers';

/**
 * Aborts when another sandbox container is already running against the same
 * worktree, so two agents can never edit one workspace.
 */
export function ensureNoActiveContainer(worktreePath: string): void {
  const active = findWorktreeContainers(worktreePath);

  if (active.length === 0) {
    return;
  }

  const details = active
    .map((container) => `  ${container.name} (${container.agent || 'unknown agent'})`)
    .join('\n');

  throw new Error(
    `Another sandbox container is already using ${worktreePath}:\n${details}\n` +
      `Stop it before starting a second agent on the same workspace.`,
  );
}
