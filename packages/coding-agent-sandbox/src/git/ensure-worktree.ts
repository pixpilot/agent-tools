import type { RepositoryInfo, WorktreeInfo, WorktreePlan } from '../types';
import fs from 'node:fs';
import path from 'node:path';
import { pathsEqual } from '../utils/normalize-path';
import { runCapture, runOrThrow } from '../utils/run-command';
import { listWorktrees } from './list-worktrees';
import { worktreeGitDirRelative } from './worktree-git-dir-relative';

/**
 * Creates the session worktree, or validates and reuses an existing one.
 * An existing directory is never recreated, overwritten or reset.
 */
export function ensureWorktree(
  repository: RepositoryInfo,
  plan: WorktreePlan,
  options: { base?: string | undefined } = {},
): WorktreeInfo {
  const registered = listWorktrees(repository.root).find((worktree) =>
    pathsEqual(worktree.path, plan.path),
  );

  if (registered != null) {
    if (registered.branch !== plan.branch) {
      throw new Error(
        `Worktree ${plan.path} is checked out on "${registered.branch ?? 'a detached HEAD'}" ` +
          `but this session expects "${plan.branch}". Refusing to touch it.`,
      );
    }

    return {
      ...plan,
      created: false,
      gitDirRelative: worktreeGitDirRelative(repository.gitDir, plan.path),
    };
  }

  if (fs.existsSync(plan.path)) {
    throw new Error(
      `${plan.path} already exists but is not a worktree of ${repository.root}. ` +
        `Refusing to overwrite it - remove it manually or pass --worktree.`,
    );
  }

  fs.mkdirSync(path.dirname(plan.path), { recursive: true });
  runOrThrow('git', [
    '-C',
    repository.root,
    'worktree',
    'add',
    ...addArgs(repository, plan, options.base),
  ]);

  return {
    ...plan,
    created: true,
    gitDirRelative: worktreeGitDirRelative(repository.gitDir, plan.path),
  };
}

/** `git worktree add` arguments, reusing the branch when it already exists. */
function addArgs(
  repository: RepositoryInfo,
  plan: WorktreePlan,
  base: string | undefined,
): string[] {
  const branchExists =
    runCapture('git', [
      '-C',
      repository.root,
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${plan.branch}`,
    ]).status === 0;

  return branchExists
    ? [plan.path, plan.branch]
    : ['-b', plan.branch, plan.path, base ?? repository.headRef];
}
