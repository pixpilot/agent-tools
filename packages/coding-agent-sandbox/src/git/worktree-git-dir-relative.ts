import path from 'node:path';
import { toPosixPath } from '../utils/normalize-path';
import { resolveWorktreeGitDir } from './resolve-worktree-git-dir';

/**
 * Location of a worktree's Git directory relative to the repository's shared
 * `.git` directory, which is how the container addresses it after mounting.
 */
export function worktreeGitDirRelative(gitDir: string, worktreePath: string): string {
  const absolute = resolveWorktreeGitDir(worktreePath);
  const relative = path.relative(gitDir, absolute).split(path.sep).join('/');

  if (relative === '' || relative.startsWith('..')) {
    throw new Error(
      `Worktree Git directory ${toPosixPath(absolute)} is not inside ${toPosixPath(gitDir)}.`,
    );
  }

  return relative;
}
