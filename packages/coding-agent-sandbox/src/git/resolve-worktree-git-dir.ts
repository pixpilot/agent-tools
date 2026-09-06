import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads the `gitdir:` pointer from a linked worktree's `.git` file and returns
 * the absolute directory it refers to.
 */
export function resolveWorktreeGitDir(worktreePath: string): string {
  const pointer = path.join(worktreePath, '.git');
  const stats = fs.statSync(pointer);

  if (stats.isDirectory()) {
    return path.resolve(pointer);
  }

  const contents = fs.readFileSync(pointer, 'utf-8').trim();
  const match = /^gitdir:[ \t]*(?<target>\S.*)$/mu.exec(contents);

  const target = match?.groups?.['target'];

  if (target == null) {
    throw new Error(`Could not read the Git directory pointer at ${pointer}`);
  }

  return path.resolve(worktreePath, target.trim());
}
