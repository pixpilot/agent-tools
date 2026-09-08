import type { RepositoryInfo, WorktreeInfo } from '../../src/types';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { ensureWorktree } from '../../src/git/ensure-worktree';
import {
  importSandboxGit,
  prepareSandboxGit,
  removeSandboxGit,
} from '../../src/git/prepare-sandbox-git';
import { resolveRepository } from '../../src/git/resolve-repository';
import { resolveWorktreePlan } from '../../src/git/resolve-worktree-plan';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
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
});
