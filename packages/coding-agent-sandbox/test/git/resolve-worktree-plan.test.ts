import type { RepositoryInfo } from '../../src/types';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { resolveWorktreePlan } from '../../src/git/resolve-worktree-plan';

const repository: RepositoryInfo = {
  root: path.join(path.sep, 'github', 'roleclick'),
  gitDir: path.join(path.sep, 'github', 'roleclick', '.git'),
  name: 'roleclick',
  parent: path.join(path.sep, 'github'),
  headRef: 'main',
};

describe('resolveWorktreePlan', () => {
  it('should namespace the branch by agent', () => {
    expect(
      resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume generation').branch,
    ).toBe('ai/claude/fix-resume-generation');
    expect(
      resolveWorktreePlan(repository, getAgent('codex'), 'Fix resume generation').branch,
    ).toBe('ai/codex/fix-resume-generation');
  });

  it('should place the worktree next to the main checkout', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Fix resume');

    expect(plan.path).toBe(
      path.resolve(
        path.join(path.sep, 'github', 'roleclick.worktrees', 'fix-resume-claude'),
      ),
    );
  });

  it('should give each agent a distinct worktree for the same task', () => {
    const paths = ['claude', 'codex', 'copilot'].map(
      (id) => resolveWorktreePlan(repository, getAgent(id), 'Same task').path,
    );

    expect(new Set(paths).size).toBe(3);
  });

  it('should honour an explicit branch override', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Task', {
      branch: 'custom/branch',
    });

    expect(plan.branch).toBe('custom/branch');
  });

  it('should honour an explicit worktree override', () => {
    const plan = resolveWorktreePlan(repository, getAgent('claude'), 'Task', {
      worktree: path.join(path.sep, 'elsewhere', 'wt'),
    });

    expect(plan.path).toBe(path.resolve(path.join(path.sep, 'elsewhere', 'wt')));
  });
});
