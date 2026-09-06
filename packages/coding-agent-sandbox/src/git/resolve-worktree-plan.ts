import type { AgentAdapter } from '../agents/agent-adapter';
import type { RepositoryInfo, WorktreePlan } from '../types';
import path from 'node:path';
import { slugify } from '../utils/slugify';

export interface WorktreePlanOverrides {
  branch?: string | undefined;
  worktree?: string | undefined;
}

/**
 * Derives the agent-specific branch and the worktree location that sits next to
 * the main checkout, so the same task can run under several agents at once.
 */
export function resolveWorktreePlan(
  repository: RepositoryInfo,
  agent: AgentAdapter,
  taskName: string,
  overrides: WorktreePlanOverrides = {},
): WorktreePlan {
  const taskSlug = slugify(taskName);
  const branch = overrides.branch ?? `ai/${agent.branchSegment}/${taskSlug}`;
  const worktreePath =
    overrides.worktree ??
    path.join(
      repository.parent,
      `${repository.name}.worktrees`,
      `${taskSlug}-${agent.id}`,
    );

  return { taskSlug, branch, path: path.resolve(worktreePath) };
}
