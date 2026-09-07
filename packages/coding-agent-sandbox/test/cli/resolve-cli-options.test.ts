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
      skills: true,
      gitMount: true,
      updateAgent: false,
      rebuildImage: false,
      login: false,
      dryRun: false,
      yes: false,
    });
  });

  it('should keep explicitly provided values', () => {
    const resolved = resolveCliOptions({
      agent: 'codex',
      repo: '/work/app',
      task: 'hotfix',
      skillsDir: '/skills',
      fullAccess: false,
      gitMount: false,
      offline: true,
      yes: true,
    });

    expect(resolved).toMatchObject({
      agent: 'codex',
      repo: '/work/app',
      task: 'hotfix',
      skillsDir: '/skills',
      fullAccess: false,
      gitMount: false,
      offline: true,
      yes: true,
    });
    expect(detectDefaultRepo).not.toHaveBeenCalled();
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

  it('should never prompt for a missing task', () => {
    expect(() => resolveCliOptions({ agent: 'codex' })).toThrow(
      /Run coding-agent-sandbox with no arguments for the guided setup/u,
    );
  });
});
