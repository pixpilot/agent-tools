import type { SessionPlan } from '../../src/types';
import { describe, expect, it, vi } from 'vitest';
import { printSessionPlan } from '../../src/session/print-session-plan';
import { plain } from '../../src/utils/logger';

vi.mock('../../src/utils/logger', () => ({ plain: vi.fn(), step: vi.fn() }));

describe('printSessionPlan', () => {
  it('should omit every environment value including secrets embedded in commands', () => {
    const plan: SessionPlan = {
      agentId: 'codex',
      agentLabel: 'Codex',
      image: 'test',
      containerName: 'test',
      repositoryRoot: '/repo',
      worktreePath: '/worktree',
      gitDirPath: '/repo/.git',
      mountGit: false,
      skillsPath: '/skills',
      volumes: [],
      tty: false,
      network: 'strict',
      env: {
        SANDBOX_AGENT_CMD: 'codex --example-secret super-secret',
        UNKNOWN_KEY: 'another-secret',
      },
    };
    printSessionPlan(plan);
    const output = vi.mocked(plain).mock.calls.flat().join('\n');
    expect(output).toContain('SANDBOX_AGENT_CMD=<omitted>');
    expect(output).toContain('UNKNOWN_KEY=<omitted>');
    expect(output).not.toContain('super-secret');
    expect(output).not.toContain('another-secret');
  });
});
