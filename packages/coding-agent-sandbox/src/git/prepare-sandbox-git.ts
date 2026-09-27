import type { RepositoryInfo, WorktreeInfo } from '../types';
import fs from 'node:fs';
import path from 'node:path';
import { runCapture, runOrThrow } from '../utils/run-command';
import { shortHash } from '../utils/short-hash';
import {
  createTempDirectory,
  keepTempDirectory,
  removeTempDirectory,
} from '../utils/temp-directories';

const PRESERVED_REF_PREFIX = 'refs/coding-agent-sandbox/preserved';

/** Private Git metadata and its container-facing pointer for one session. */
export interface SandboxGit {
  root: string;
  gitDir: string;
  pointerPath: string;
  hooksPath: string;
  branch: string;
  baseCommit: string;
  /** Private refs at session start, so refs the agent moved can be preserved. */
  initialRefs: Map<string, string>;
}

/** Creates an isolated clone so an agent never receives the host repository's `.git`. */
export function prepareSandboxGit(
  repository: RepositoryInfo,
  worktree: WorktreeInfo,
): SandboxGit {
  const root = createTempDirectory('git');
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

    // Marked for recovery from the start: a hard-killed session must not have
    // its unimported commits removed by the next run's stale-directory sweep.
    keepTempDirectory(root);

    return {
      root,
      gitDir,
      pointerPath,
      hooksPath,
      branch: worktree.branch,
      initialRefs: listRefs(gitDir),
      baseCommit: runOrThrow('git', [
        '-C',
        repository.root,
        'rev-parse',
        worktree.branch,
      ]),
    };
  } catch (cause) {
    removeTempDirectory(root);
    throw cause;
  }
}

/**
 * Copies every private ref the agent created or moved, other than the session
 * branch, into a host-only namespace. Covers merges into a private `main`,
 * stashes, new branches and tags, and a detached HEAD. Returns the host refs.
 */
export function preserveSandboxRefs(
  sandboxGit: SandboxGit,
  repository: RepositoryInfo,
): string[] {
  const sessionRef = `refs/heads/${sandboxGit.branch}`;
  const namespace = `${PRESERVED_REF_PREFIX}/${sandboxGit.branch}/${shortHash(sandboxGit.root)}`;
  const refspecs: string[] = [];
  const preserved: string[] = [];

  for (const [ref, commit] of listRefs(sandboxGit.gitDir)) {
    if (ref !== sessionRef && sandboxGit.initialRefs.get(ref) !== commit) {
      const target = `${namespace}/${ref.replace(/^refs\//u, '')}`;
      refspecs.push(`+${ref}:${target}`);
      preserved.push(target);
    }
  }

  if (refspecs.length === 0) {
    return [];
  }

  runOrThrow('git', [
    '-C',
    repository.root,
    '-c',
    'protocol.file.allow=always',
    'fetch',
    '--no-tags',
    '--no-write-fetch-head',
    sandboxGit.gitDir,
    ...refspecs,
  ]);

  return preserved;
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
  removeTempDirectory(sandboxGit.root);
}

/** Every ref plus a detached HEAD, which only the reflog would otherwise hold. */
function listRefs(gitDirectory: string): Map<string, string> {
  const refs = new Map<string, string>();
  const output = runOrThrow('git', [
    '--git-dir',
    gitDirectory,
    'for-each-ref',
    '--format=%(objectname) %(refname)',
  ]);

  for (const line of output.split('\n')) {
    const [commit, ref] = line.split(' ');
    if (commit != null && ref != null) refs.set(ref, commit);
  }

  const symbolic = runCapture('git', [
    '--git-dir',
    gitDirectory,
    'symbolic-ref',
    '-q',
    'HEAD',
  ]);

  if (symbolic.status !== 0) {
    refs.set('HEAD', runOrThrow('git', ['--git-dir', gitDirectory, 'rev-parse', 'HEAD']));
  }

  return refs;
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
