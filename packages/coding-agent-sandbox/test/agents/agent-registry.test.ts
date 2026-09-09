import { describe, expect, it } from 'vitest';
import { getAgent, listAgents } from '../../src/agents/agent-registry';

describe('listAgents', () => {
  it('should expose the three supported agents', () => {
    expect(listAgents().map((agent) => agent.id)).toEqual(['claude', 'codex', 'copilot']);
  });

  it('should give every agent its own auth volume', () => {
    const volumes = listAgents().map((agent) => agent.authVolume);

    expect(volumes).toEqual([
      'coding-agent-sandbox-auth-claude',
      'coding-agent-sandbox-auth-codex',
      'coding-agent-sandbox-auth-copilot',
    ]);
    expect(new Set(volumes).size).toBe(volumes.length);
  });
});

describe('getAgent', () => {
  it('should look an agent up by id', () => {
    expect(getAgent('codex').label).toBe('OpenAI Codex');
  });

  it('should accept mixed case and padding', () => {
    expect(getAgent('  Claude ').id).toBe('claude');
  });

  it('should list the known agents when the id is unknown', () => {
    expect(() => getAgent('cursor')).toThrow(/claude, codex, copilot/u);
  });
});

describe('agent launch commands', () => {
  it('should add the unattended flag when full access is granted', () => {
    expect(getAgent('claude').launchCommand({ fullAccess: true })).toBe(
      'claude --dangerously-skip-permissions',
    );
    expect(getAgent('codex').launchCommand({ fullAccess: true })).toBe(
      'codex --dangerously-bypass-approvals-and-sandbox',
    );
    expect(getAgent('copilot').launchCommand({ fullAccess: true })).toBe(
      'copilot --allow-all-tools',
    );
  });

  it('should omit the unattended flag when full access is refused', () => {
    for (const agent of listAgents()) {
      expect(agent.launchCommand({ fullAccess: false })).toBe(agent.binary);
    }
  });

  it('should append extra arguments last', () => {
    expect(
      getAgent('claude').launchCommand({ fullAccess: true, extraArgs: '--model opus' }),
    ).toBe('claude --dangerously-skip-permissions --model opus');
  });

  it('should append a safely quoted initial prompt last', () => {
    for (const agent of listAgents()) {
      expect(
        agent.launchCommand({ fullAccess: false, prompt: "Fix O'Reilly login" }),
      ).toBe(`${agent.binary} 'Fix O'\\''Reilly login'`);
    }
  });

  it('should end option parsing before a prompt that starts with a dash', () => {
    for (const agent of listAgents()) {
      expect(agent.launchCommand({ fullAccess: false, prompt: '- add a navbar' })).toBe(
        `${agent.binary} -- '- add a navbar'`,
      );
    }
  });

  it('should ignore a blank initial prompt', () => {
    expect(getAgent('codex').launchCommand({ fullAccess: false, prompt: '  ' })).toBe(
      'codex',
    );
  });

  it('should ignore blank extra arguments', () => {
    expect(getAgent('claude').launchCommand({ fullAccess: false, extraArgs: '  ' })).toBe(
      'claude',
    );
  });
});

describe('agent state', () => {
  it('should persist agent state under home-relative paths only', () => {
    for (const agent of listAgents()) {
      for (const entry of [...agent.stateDirs, ...agent.stateFiles]) {
        expect(entry.startsWith('/')).toBe(false);
        expect(entry.startsWith('..')).toBe(false);
      }
    }
  });

  it('should derive the branch segment from the agent id', () => {
    expect(listAgents().map((agent) => agent.branchSegment)).toEqual([
      'claude',
      'codex',
      'copilot',
    ]);
  });
});
