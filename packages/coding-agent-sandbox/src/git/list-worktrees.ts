import path from 'node:path';
import { runOrThrow } from '../utils/run-command';

export interface RegisteredWorktree {
  path: string;
  branch?: string;
}

/** Parses `git worktree list --porcelain` for the given repository. */
export function listWorktrees(repositoryRoot: string): RegisteredWorktree[] {
  const output = runOrThrow('git', [
    '-C',
    repositoryRoot,
    'worktree',
    'list',
    '--porcelain',
  ]);

  const worktrees: RegisteredWorktree[] = [];
  let current: RegisteredWorktree | undefined;

  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith('worktree ')) {
      current = { path: path.resolve(line.slice('worktree '.length)) };
      worktrees.push(current);
    } else if (line.startsWith('branch ') && current != null) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//u, '');
    }
  }

  return worktrees;
}
