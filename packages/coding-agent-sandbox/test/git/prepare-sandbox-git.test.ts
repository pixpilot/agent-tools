import type { SandboxGit } from '../../src/git/prepare-sandbox-git';
import type { RepositoryInfo, WorktreeInfo } from '../../src/types';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { TEMP_DIRECTORY_KEEP_MARKER } from '../../src/constants';
import { ensureWorktree } from '../../src/git/ensure-worktree';
import {
  importSandboxGit,
  prepareSandboxGit,
  preserveSandboxRefs,
  removeSandboxGit,
} from '../../src/git/prepare-sandbox-git';
import { resolveRepository } from '../../src/git/resolve-repository';
import { resolveWorktreePlan } from '../../src/git/resolve-worktree-plan';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/** Runs Git the way the agent does inside the container: private dir, shared worktree. */
function agentGit(sandboxGit: SandboxGit, workTree: string, ...args: string[]): string {
  return git(
    workTree,
    '--git-dir',
    sandboxGit.gitDir,
    '--work-tree',
    workTree,
    '-c',
    'user.email=agent@example.com',
    '-c',
    'user.name=Agent',
    ...args,
  );
}

let root: string;
let repository: RepositoryInfo;
let worktree: WorktreeInfo;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cas-private-git-')));
  const checkout = path.join(root, 'demo');
  fs.mkdirSync(checkout);
  git(checkout, 'init', '-q', '-b', 'main', '.');
  git(checkout, 'config', 'user.email', 'test@example.com');
  git(checkout, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(checkout, 'README.md'), '# Demo\n');
  git(checkout, 'add', '-A');
  git(checkout, 'commit', '-qm', 'init');
  repository = resolveRepository(checkout);
  worktree = ensureWorktree(
    repository,
    resolveWorktreePlan(repository, getAgent('claude'), 'Private git'),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('prepareSandboxGit', () => {
  it('should give the agent a private Git directory and a container-safe pointer', () => {
    const sandboxGit = prepareSandboxGit(repository, worktree);

    try {
      expect(sandboxGit.gitDir).not.toBe(repository.gitDir);
      expect(fs.readFileSync(sandboxGit.pointerPath, 'utf-8')).toBe(
        'gitdir: /repo/.git\n',
      );
      expect(
        git(worktree.path, '--git-dir', sandboxGit.gitDir, 'branch', '--show-current'),
      ).toBe(worktree.branch);
      expect(
        git(
          worktree.path,
          '--git-dir',
          sandboxGit.gitDir,
          '--work-tree',
          worktree.path,
          'status',
          '--porcelain',
        ),
      ).toBe('');
    } finally {
      removeSandboxGit(sandboxGit);
    }
  });

  it('should import an agent commit without exposing or running host hooks', () => {
    const sandboxGit = prepareSandboxGit(repository, worktree);

    try {
      fs.writeFileSync(path.join(worktree.path, 'agent.txt'), 'preserved\n');
      git(
        worktree.path,
        '--git-dir',
        sandboxGit.gitDir,
        'config',
        'user.email',
        'agent@example.com',
      );
      git(worktree.path, '--git-dir', sandboxGit.gitDir, 'config', 'user.name', 'Agent');
      git(
        worktree.path,
        '--git-dir',
        sandboxGit.gitDir,
        '--work-tree',
        worktree.path,
        'add',
        '-A',
      );
      git(
        worktree.path,
        '--git-dir',
        sandboxGit.gitDir,
        '--work-tree',
        worktree.path,
        'commit',
        '-qm',
        'feat: agent change',
      );

      const imported = importSandboxGit(sandboxGit, repository, worktree);

      expect(imported).toMatch(/^[a-f0-9]{40}$/u);
      expect(git(worktree.path, 'rev-parse', 'HEAD')).toBe(imported);
      expect(fs.readFileSync(path.join(worktree.path, 'agent.txt'), 'utf-8')).toBe(
        'preserved\n',
      );
      expect(git(worktree.path, 'status', '--porcelain')).toBe('');
    } finally {
      removeSandboxGit(sandboxGit);
    }
  });

  it('should preserve uncommitted agent files while importing committed work', () => {
    const sandboxGit = prepareSandboxGit(repository, worktree);

    try {
      fs.writeFileSync(path.join(worktree.path, 'committed.txt'), 'commit\n');
      git(
        worktree.path,
        '--git-dir',
        sandboxGit.gitDir,
        'config',
        'user.email',
        'agent@example.com',
      );
      git(worktree.path, '--git-dir', sandboxGit.gitDir, 'config', 'user.name', 'Agent');
      git(
        worktree.path,
        '--git-dir',
        sandboxGit.gitDir,
        '--work-tree',
        worktree.path,
        'add',
        '-A',
      );
      git(
        worktree.path,
        '--git-dir',
        sandboxGit.gitDir,
        '--work-tree',
        worktree.path,
        'commit',
        '-qm',
        'feat: commit one file',
      );
      fs.writeFileSync(path.join(worktree.path, 'uncommitted.txt'), 'review me\n');

      importSandboxGit(sandboxGit, repository, worktree);

      expect(fs.readFileSync(path.join(worktree.path, 'uncommitted.txt'), 'utf-8')).toBe(
        'review me\n',
      );
      expect(git(worktree.path, 'status', '--porcelain')).toContain('?? uncommitted.txt');
    } finally {
      removeSandboxGit(sandboxGit);
    }
  });

  it('should mark the private clone for recovery before the agent starts', () => {
    const sandboxGit = prepareSandboxGit(repository, worktree);

    try {
      expect(fs.existsSync(path.join(sandboxGit.root, TEMP_DIRECTORY_KEEP_MARKER))).toBe(
        true,
      );
    } finally {
      removeSandboxGit(sandboxGit);
    }
  });

  it('should preserve nothing when the agent only touched the session branch', () => {
    const sandboxGit = prepareSandboxGit(repository, worktree);

    try {
      fs.writeFileSync(path.join(worktree.path, 'agent.txt'), 'change\n');
      agentGit(sandboxGit, worktree.path, 'add', '-A');
      agentGit(sandboxGit, worktree.path, 'commit', '-qm', 'feat: agent change');

      expect(preserveSandboxRefs(sandboxGit, repository)).toEqual([]);
    } finally {
      removeSandboxGit(sandboxGit);
    }
  });

  it('should preserve a private main merge on the host without touching host main', () => {
    const sandboxGit = prepareSandboxGit(repository, worktree);
    const hostMain = git(repository.root, 'rev-parse', 'main');

    try {
      fs.writeFileSync(path.join(worktree.path, 'agent.txt'), 'change\n');
      agentGit(sandboxGit, worktree.path, 'add', '-A');
      agentGit(sandboxGit, worktree.path, 'commit', '-qm', 'feat: agent change');
      agentGit(sandboxGit, worktree.path, 'checkout', '-q', 'main');
      agentGit(
        sandboxGit,
        worktree.path,
        'merge',
        '-q',
        '--no-ff',
        '-m',
        'merge',
        worktree.branch,
      );
      const privateMain = agentGit(sandboxGit, worktree.path, 'rev-parse', 'main');

      const preserved = preserveSandboxRefs(sandboxGit, repository);

      expect(preserved).toHaveLength(1);
      expect(preserved[0]).toMatch(
        /^refs\/coding-agent-sandbox\/preserved\/.+\/heads\/main$/u,
      );
      expect(git(repository.root, 'rev-parse', preserved[0]!)).toBe(privateMain);
      expect(git(repository.root, 'rev-parse', 'main')).toBe(hostMain);
    } finally {
      removeSandboxGit(sandboxGit);
    }
  });

  it('should preserve a stash and a detached HEAD', () => {
    const sandboxGit = prepareSandboxGit(repository, worktree);

    try {
      fs.writeFileSync(path.join(worktree.path, 'README.md'), '# Stashed\n');
      agentGit(sandboxGit, worktree.path, 'stash', '-q');
      agentGit(sandboxGit, worktree.path, 'checkout', '-q', '--detach');
      fs.writeFileSync(path.join(worktree.path, 'detached.txt'), 'orphan\n');
      agentGit(sandboxGit, worktree.path, 'add', '-A');
      agentGit(sandboxGit, worktree.path, 'commit', '-qm', 'feat: detached work');
      const detached = agentGit(sandboxGit, worktree.path, 'rev-parse', 'HEAD');

      const preserved = preserveSandboxRefs(sandboxGit, repository);

      expect(preserved.map((ref) => ref.split('/').pop())).toEqual(
        expect.arrayContaining(['stash', 'HEAD']),
      );
      const head = preserved.find((ref) => ref.endsWith('/HEAD'))!;
      expect(git(repository.root, 'rev-parse', head)).toBe(detached);
    } finally {
      removeSandboxGit(sandboxGit);
    }
  });
});
