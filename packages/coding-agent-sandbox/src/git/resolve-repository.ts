import type { RepositoryInfo } from '../types';
import fs from 'node:fs';
import path from 'node:path';
import { runCapture, runOrThrow } from '../utils/run-command';

/**
 * Validates that `inputPath` is inside a non-bare Git repository and resolves
 * the main checkout, even when the path points at a linked worktree.
 */
export function resolveRepository(inputPath: string): RepositoryInfo {
  const target = path.resolve(inputPath);

  if (!fs.existsSync(target)) {
    throw new Error(`Repository path does not exist: ${target}`);
  }

  if (!fs.statSync(target).isDirectory()) {
    throw new Error(`Repository path is not a directory: ${target}`);
  }

  const inside = runCapture('git', ['-C', target, 'rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout !== 'true') {
    throw new Error(`Not a Git working tree: ${target}`);
  }

  const bare = runCapture('git', ['-C', target, 'rev-parse', '--is-bare-repository']);
  if (bare.stdout === 'true') {
    throw new Error(`Bare repositories are not supported: ${target}`);
  }

  const gitDir = resolveGitCommonDir(target);
  const root = path.dirname(gitDir);
  const headRef = runOrThrow('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']);

  return {
    root,
    gitDir,
    name: path.basename(root),
    parent: path.dirname(root),
    headRef:
      headRef === 'HEAD' ? runOrThrow('git', ['-C', root, 'rev-parse', 'HEAD']) : headRef,
  };
}

/** Absolute path of the shared `.git` directory for the given working tree. */
function resolveGitCommonDir(target: string): string {
  const absolute = runCapture('git', [
    '-C',
    target,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);

  if (absolute.status === 0 && absolute.stdout !== '') {
    return path.resolve(absolute.stdout);
  }

  // Older Git versions do not support --path-format.
  const relative = runOrThrow('git', ['-C', target, 'rev-parse', '--git-common-dir']);
  return path.resolve(target, relative);
}
