import { describe, expect, it } from 'vitest';
import { ClaudeAgent } from '../../src/agents/claude-agent';
import { CodexAgent } from '../../src/agents/codex-agent';
import { NodeEnvironment } from '../../src/environments/node-environment';
import { resolveEgressHosts } from '../../src/network/resolve-egress-hosts';

describe('resolveEgressHosts', () => {
  it('should combine the bootstrap, agent and environment hosts', () => {
    const hosts = resolveEgressHosts({
      agent: new ClaudeAgent(),
      environment: new NodeEnvironment(),
    });

    expect(hosts).toContain('registry.npmjs.org');
    expect(hosts).toContain('api.anthropic.com');
  });

  it('should still allow the npm registry so the agent CLI can install', () => {
    const hosts = resolveEgressHosts({ agent: new CodexAgent() });

    expect(hosts).toContain('registry.npmjs.org');
  });

  it('should allow the subscription OAuth login hosts, not just the API host', () => {
    const hosts = resolveEgressHosts({ agent: new ClaudeAgent() });

    expect(hosts).toContain('claude.ai');
    expect(hosts).toContain('console.anthropic.com');
  });

  it('should not leak one agent provider into another', () => {
    const hosts = resolveEgressHosts({ agent: new CodexAgent() });

    expect(hosts).not.toContain('api.anthropic.com');
  });

  it('should deduplicate hosts claimed by more than one source', () => {
    const hosts = resolveEgressHosts({
      agent: new ClaudeAgent(),
      environment: new NodeEnvironment(),
    });

    expect(hosts.filter((host) => host === 'registry.npmjs.org')).toHaveLength(1);
  });

  it('should sort the result so the proxy configuration is deterministic', () => {
    const hosts = resolveEgressHosts({
      agent: new ClaudeAgent(),
      environment: new NodeEnvironment(),
    });

    expect(hosts).toEqual([...hosts].sort());
  });

  it('should work when no project environment was detected', () => {
    const hosts = resolveEgressHosts({ agent: new ClaudeAgent() });

    expect(hosts).toContain('registry.npmjs.org');
    expect(hosts.length).toBeGreaterThan(0);
  });
});
