import { describe, expect, it } from 'vitest';
import { sessionNetworkNames } from '../../src/network/session-network-names';

describe('sessionNetworkNames', () => {
  it('should be deterministic so a crashed session can be cleaned up', () => {
    expect(sessionNetworkNames('coding-agent-sandbox-claude-demo-1234')).toStrictEqual(
      sessionNetworkNames('coding-agent-sandbox-claude-demo-1234'),
    );
  });

  it('should give concurrent sessions distinct networks and proxies', () => {
    const a = sessionNetworkNames('coding-agent-sandbox-claude-demo-1234');
    const b = sessionNetworkNames('coding-agent-sandbox-codex-demo-1234');

    expect(a.internal).not.toBe(b.internal);
    expect(a.egress).not.toBe(b.egress);
    expect(a.proxy).not.toBe(b.proxy);
  });

  it('should never reuse one name for two roles', () => {
    const names = sessionNetworkNames('coding-agent-sandbox-claude-demo-1234');

    expect(new Set([names.internal, names.egress, names.proxy]).size).toBe(3);
  });

  it('should prefix every object so cleanup can recognise them', () => {
    const names = sessionNetworkNames('coding-agent-sandbox-claude-demo-1234');

    expect(names.internal).toMatch(/^coding-agent-sandbox-net-[a-f0-9]{12}$/u);
    expect(names.egress).toMatch(/^coding-agent-sandbox-egress-[a-f0-9]{12}$/u);
    expect(names.proxy).toMatch(/^coding-agent-sandbox-proxy-[a-f0-9]{12}$/u);
  });

  it('should address the proxy by container name, which only its network resolves', () => {
    const names = sessionNetworkNames('coding-agent-sandbox-claude-demo-1234');

    expect(names.proxyUrl).toBe(`http://${names.proxy}:8888`);
  });
});
