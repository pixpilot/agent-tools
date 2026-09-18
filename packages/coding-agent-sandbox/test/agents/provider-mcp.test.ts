import { describe, expect, it } from 'vitest';
import { ClaudeAgent } from '../../src/agents/claude-agent';
import { CodexAgent } from '../../src/agents/codex-agent';
import { CopilotAgent } from '../../src/agents/copilot-agent';
import {
  describeProviderMcp,
  PROVIDER_MCP_FLAG,
  PROVIDER_MCP_NOTICE,
} from '../../src/agents/provider-mcp';

describe('provider MCP configuration', () => {
  it('should route Claude Code through the claude.ai connector gateway', () => {
    const { providerMcp } = new ClaudeAgent();

    expect(providerMcp?.hosts).toStrictEqual(['mcp-proxy.anthropic.com']);
  });

  // The gateway reaches an account's mail, drive and calendar, so a coding
  // session must opt in rather than inherit the vendor's own default.
  it('should turn the gateway off unless the session allows it', () => {
    const agent = new ClaudeAgent();

    expect(agent.providerMcpState(false).env).toStrictEqual({
      ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    });
    expect(agent.providerMcpState(true).env).toStrictEqual({
      ENABLE_CLAUDEAI_MCP_SERVERS: 'true',
    });
  });

  it('should treat an unset value as not allowed', () => {
    expect(new ClaudeAgent().providerMcpState(undefined).env).toStrictEqual({
      ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
    });
  });

  it.each([
    ['codex', new CodexAgent()],
    ['copilot', new CopilotAgent()],
  ])('should leave %s untouched, having no vendor gateway to switch', (_id, agent) => {
    expect(agent.providerMcp).toBeUndefined();
    expect(agent.providerMcpState(true)).toStrictEqual({});
    expect(agent.providerMcpState(false)).toStrictEqual({});
  });
});

describe('describeProviderMcp', () => {
  it('should name the gateway and the flag when it is off', () => {
    const notice = describeProviderMcp(new ClaudeAgent(), false);

    expect(notice).toContain('claude.ai MCP connectors');
    expect(notice).toContain('disabled');
    expect(notice).toContain(PROVIDER_MCP_FLAG);
    expect(notice).toContain('mcp-proxy.anthropic.com');
  });

  it('should report the allowlisted host when it is on', () => {
    const notice = describeProviderMcp(new ClaudeAgent(), true);

    expect(notice).toContain('enabled');
    expect(notice).toContain('mcp-proxy.anthropic.com');
  });

  it('should say nothing for an agent without a vendor gateway', () => {
    expect(describeProviderMcp(new CodexAgent(), false)).toBeUndefined();
  });

  it('should tell the guided setup how to turn the feature on', () => {
    expect(PROVIDER_MCP_NOTICE).toContain(PROVIDER_MCP_FLAG);
  });
});
