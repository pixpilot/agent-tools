import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectDefaultRepo } from '../../src/cli/detect-default-repo';
import { resolveCliOptions } from '../../src/cli/resolve-cli-options';

vi.mock('../../src/cli/detect-default-repo', () => ({
  detectDefaultRepo: vi.fn(() => '/detected/repo'),
}));

describe('resolveCliOptions', () => {
  beforeEach(() => {
    vi.mocked(detectDefaultRepo).mockClear();
  });

  it('should default the agent, repository and every boolean', () => {
    expect(resolveCliOptions({ task: 'fix login' })).toStrictEqual({
      agent: 'claude',
      repo: '/detected/repo',
      task: 'fix login',
      fullAccess: true,
      install: true,
      configs: true,
      gitMount: true,
      updateAgent: false,
      rebuildImage: false,
      login: false,
      dryRun: false,
      allowDirty: false,
      network: 'strict',
      yes: false,
    });
  });

  it('should keep explicitly provided values', () => {
    const resolved = resolveCliOptions({
      agent: 'codex',
      repo: '/work/app',
      task: 'hotfix',
      configsDir: '/configs',
      prompt: 'Fix the login flow',
      fullAccess: false,
      gitMount: false,
      network: 'none',
      yes: true,
    });

    expect(resolved).toMatchObject({
      agent: 'codex',
      repo: '/work/app',
      task: 'hotfix',
      configsDir: '/configs',
      prompt: 'Fix the login flow',
      fullAccess: false,
      gitMount: false,
      network: 'none',
      yes: true,
    });
    expect(detectDefaultRepo).not.toHaveBeenCalled();
  });

  it('should resolve the deprecated offline alias without leaking it downstream', () => {
    const resolved = resolveCliOptions({ task: 'hotfix', offline: true });

    expect(resolved.network).toBe('none');
    expect(resolved).not.toHaveProperty('offline');
  });

  it('should trim the task and the repository', () => {
    expect(
      resolveCliOptions({ task: '  fix login  ', repo: '  /work/app  ' }),
    ).toMatchObject({ task: 'fix login', repo: '/work/app' });
  });

  it('should fall back to the detected repository for a blank --repo', () => {
    expect(resolveCliOptions({ task: 'fix login', repo: '   ' })).toMatchObject({
      repo: '/detected/repo',
    });
  });

  it.each([undefined, '', '   '])('should reject the task %o', (task) => {
    expect(() => resolveCliOptions({ task })).toThrow(/--task is required/u);
  });

  it('should reject a missing task for non-interactive callers', () => {
    expect(() => resolveCliOptions({ agent: 'codex' })).toThrow(/--task is required/u);
  });
});
