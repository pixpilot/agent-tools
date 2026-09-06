import type { RepositoryInfo, WorktreeInfo, WorktreePlan } from '../types';
import fs from 'node:fs';
import path from 'node:path';
import { worktreeGitDirRelative } from './worktree-git-dir-relative';

/**
 * Describes what `ensureWorktree` would produce, without touching the disk.
 * Used by `--dry-run` so previewing a session has no side effects.
 */
export function previewWorktree(
  repository: RepositoryInfo,
  plan: WorktreePlan,
): WorktreeInfo {
  const exists = fs.existsSync(path.join(plan.path, '.git'));

  return {
    ...plan,
    created: !exists,
    gitDirRelative: exists
      ? worktreeGitDirRelative(repository.gitDir, plan.path)
      : `worktrees/${path.basename(plan.path)}`,
  };
}
