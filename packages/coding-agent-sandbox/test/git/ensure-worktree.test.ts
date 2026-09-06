import type { RepositoryInfo } from '../../src/types';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { ensureWorktree } from '../../src/git/ensure-worktree';
import { previewWorktree } from '../../src/git/preview-worktree';
import { resolveRepository } from '../../src/git/resolve-repository';
import { resolveWorktreePlan } from '../../src/git/resolve-worktree-plan';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

let sandbox: string;
let repository: RepositoryInfo;

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cas-git-')));
  const root = path.join(sandbox, 'demo');
  fs.mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main', '.');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');
  repository = resolveRepository(root);
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('resolveRepository', () => {
  it('should resolve the main checkout and its shared git directory', () => {
    expect(repository.name).toBe('demo');
    expect(repository.gitDir).toBe(path.join(repository.root, '.git'));
    expect(repository.headRef).toBe('main');
  });

  it('should reject a directory that is not a Git working tree', () => {
    expect(() => resolveRepository(sandbox)).toThrow(/Not a Git working tree/u);
  });

  it('should reject a path that does not exist', () => {
    expect(() => resolveRepository(path.join(sandbox, 'nope'))).toThrow(
      /does not exist/u,
    );
  });
});

describe('ensureWorktree', () => {
  it('should create the branch and worktree on first use', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');
    const worktree = ensureWorktree(repository, plan);

    expect(worktree.created).toBe(true);
    expect(fs.existsSync(path.join(worktree.path, 'package.json'))).toBe(true);
    expect(git(worktree.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(
      'ai/claude/fix-resume',
    );
  });

  it('should point at the worktree git directory inside the shared .git', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');
    const worktree = ensureWorktree(repository, plan);

    expect(worktree.gitDirRelative).toBe('worktrees/fix-resume-claude');
    expect(fs.existsSync(path.join(repository.gitDir, worktree.gitDirRelative))).toBe(
      true,
    );
  });

  it('should reuse an existing worktree instead of recreating it', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');
    const first = ensureWorktree(repository, plan);
    fs.writeFileSync(path.join(first.path, 'agent-work.txt'), 'in progress');

    const second = ensureWorktree(repository, plan);

    expect(second.created).toBe(false);
    expect(fs.readFileSync(path.join(second.path, 'agent-work.txt'), 'utf-8')).toBe(
      'in progress',
    );
  });

  it('should refuse a directory that is not a worktree of this repository', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');
    fs.mkdirSync(plan.path, { recursive: true });
    fs.writeFileSync(path.join(plan.path, 'precious.txt'), 'do not delete');

    expect(() => ensureWorktree(repository, plan)).toThrow(/Refusing to overwrite/u);
    expect(fs.existsSync(path.join(plan.path, 'precious.txt'))).toBe(true);
  });

  it('should refuse a worktree checked out on a different branch', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');
    git(repository.root, 'worktree', 'add', '-b', 'other/branch', plan.path);

    expect(() => ensureWorktree(repository, plan)).toThrow(/Refusing to touch it/u);
  });

  it('should let two agents work on the same task side by side', () => {
    const claude = ensureWorktree(
      repository,
      resolveWorktreePlan(repository, getAgent('claude'), 'Shared task'),
    );
    const codex = ensureWorktree(
      repository,
      resolveWorktreePlan(repository, getAgent('codex'), 'Shared task'),
    );

    expect(claude.path).not.toBe(codex.path);
    expect(claude.branch).toBe('ai/claude/shared-task');
    expect(codex.branch).toBe('ai/codex/shared-task');
  });

  it('should reuse an existing branch rather than failing', () => {
    git(repository.root, 'branch', 'ai/claude/reuse-branch');
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Reuse branch');

    expect(ensureWorktree(repository, plan).branch).toBe('ai/claude/reuse-branch');
  });

  it('should create the branch from an explicit base ref', () => {
    git(repository.root, 'checkout', '-q', '-b', 'release');
    fs.writeFileSync(path.join(repository.root, 'release.txt'), 'release only');
    git(repository.root, 'add', '-A');
    git(repository.root, 'commit', '-qm', 'release change');
    git(repository.root, 'checkout', '-q', 'main');

    const plan = resolveWorktreePlan(repository, getAgent('codex'), 'From release');
    const worktree = ensureWorktree(repository, plan, { base: 'release' });

    expect(fs.existsSync(path.join(worktree.path, 'release.txt'))).toBe(true);
  });
});

describe('previewWorktree', () => {
  it('should describe an unborn worktree without creating it', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');
    const preview = previewWorktree(repository, plan);

    expect(preview.created).toBe(true);
    expect(preview.gitDirRelative).toBe('worktrees/fix-resume-claude');
    expect(fs.existsSync(plan.path)).toBe(false);
  });

  it('should report an existing worktree as already present', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');
    ensureWorktree(repository, plan);

    expect(previewWorktree(repository, plan).created).toBe(false);
  });
});
