import type { RepositoryInfo, WorktreeInfo } from '../types';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCapture, runOrThrow } from '../utils/run-command';
import { shortHash } from '../utils/short-hash';

/** Private Git metadata and its container-facing pointer for one session. */
export interface SandboxGit {
  root: string;
  gitDir: string;
  pointerPath: string;
  hooksPath: string;
  branch: string;
  baseCommit: string;
}

/** Creates an isolated clone so an agent never receives the host repository's `.git`. */
export function prepareSandboxGit(
  repository: RepositoryInfo,
  worktree: WorktreeInfo,
): SandboxGit {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-sandbox-git-'));
  const gitDir = path.join(root, 'repository.git');
  const pointerPath = path.join(root, 'workspace.git');
  const hooksPath = path.join(root, 'hooks');

  try {
    // --no-local prevents Git from hard-linking the host object database into
    // the writable clone. The agent can therefore never mutate host objects.
    runOrThrow('git', ['clone', '--bare', '--no-local', repository.gitDir, gitDir]);
    runOrThrow('git', ['--git-dir', gitDir, 'rev-parse', '--verify', worktree.branch]);
    runOrThrow('git', ['--git-dir', gitDir, 'config', 'core.bare', 'false']);
    runOrThrow('git', ['--git-dir', gitDir, 'config', 'core.autocrlf', 'input']);
    runOrThrow('git', ['--git-dir', gitDir, 'config', 'core.eol', 'lf']);
    runOrThrow('git', [
      '--git-dir',
      gitDir,
      'symbolic-ref',
      'HEAD',
      `refs/heads/${worktree.branch}`,
    ]);
    runOrThrow('git', ['--git-dir', gitDir, 'read-tree', worktree.branch]);
    fs.mkdirSync(hooksPath);
    fs.writeFileSync(pointerPath, 'gitdir: /repo/.git\n', {
      encoding: 'utf-8',
      mode: 0o600,
    });

    return {
      root,
      gitDir,
      pointerPath,
      hooksPath,
      branch: worktree.branch,
      baseCommit: runOrThrow('git', [
        '-C',
        repository.root,
        'rev-parse',
        worktree.branch,
      ]),
    };
  } catch (cause) {
    fs.rmSync(root, { recursive: true, force: true });
    throw cause;
  }
}

/** Imports only descendant commits into the intended branch, with host hooks disabled. */
export function importSandboxGit(
  sandboxGit: SandboxGit,
  repository: RepositoryInfo,
  worktree: WorktreeInfo,
): string | undefined {
  const candidate = runOrThrow('git', [
    '--git-dir',
    sandboxGit.gitDir,
    'rev-parse',
    `refs/heads/${sandboxGit.branch}`,
  ]);

  if (candidate === sandboxGit.baseCommit) {
    return undefined;
  }

  if (!isAncestor(sandboxGit.gitDir, sandboxGit.baseCommit, candidate)) {
    throw new Error(
      `Sandbox branch ${sandboxGit.branch} no longer descends from its session base; refusing to import rewritten history.`,
    );
  }

  const current = runOrThrow('git', [
    '-C',
    repository.root,
    'rev-parse',
    sandboxGit.branch,
  ]);

  if (current !== sandboxGit.baseCommit) {
    throw new Error(
      `Host branch ${sandboxGit.branch} changed during the session; refusing to overwrite it.`,
    );
  }

  const importRef = `refs/coding-agent-sandbox/import/${shortHash(sandboxGit.root)}`;

  try {
    // Transfer objects before moving the real ref. The temporary ref is unique
    // to this host-created directory and is deleted in the finally block.
    runOrThrow('git', [
      '-C',
      repository.root,
      '-c',
      'protocol.file.allow=always',
      'fetch',
      '--no-tags',
      '--no-write-fetch-head',
      sandboxGit.gitDir,
      `+refs/heads/${sandboxGit.branch}:${importRef}`,
    ]);

    if (!isAncestor(repository.gitDir, sandboxGit.baseCommit, candidate)) {
      throw new Error('Imported sandbox commits do not descend from the host branch.');
    }

    // update-ref's expected old value makes a concurrent host update fail closed.
    runOrThrow('git', [
      '-C',
      repository.root,
      'update-ref',
      `refs/heads/${sandboxGit.branch}`,
      candidate,
      sandboxGit.baseCommit,
    ]);
    // --mixed updates only the worktree index. It preserves any uncommitted
    // files the agent intentionally left for review, and hooks never run.
    runOrThrow('git', [
      '-C',
      worktree.path,
      '-c',
      `core.hooksPath=${sandboxGit.hooksPath}`,
      'reset',
      '--mixed',
      candidate,
    ]);
  } finally {
    runCapture('git', ['-C', repository.root, 'update-ref', '-d', importRef]);
  }

  return candidate;
}

/** Removes private session Git data after it was imported or proved unused. */
export function removeSandboxGit(sandboxGit: SandboxGit): void {
  fs.rmSync(sandboxGit.root, { recursive: true, force: true });
}

function isAncestor(gitDirectory: string, base: string, candidate: string): boolean {
  return (
    runCapture('git', [
      '--git-dir',
      gitDirectory,
      'merge-base',
      '--is-ancestor',
      base,
      candidate,
    ]).status === 0
  );
}
