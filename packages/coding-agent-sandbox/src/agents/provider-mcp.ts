import type { AgentAdapter } from './agent-adapter';

/** The flag that turns provider-hosted MCP on for one session. */
export const PROVIDER_MCP_FLAG = '--allow-provider-mcp';

/**
 * Shown above the guided setup's first question, where the agent is not yet
 * known. The per-agent line comes later, once the session knows which gateway
 * is involved.
 */
export const PROVIDER_MCP_NOTICE = `Provider-hosted MCP connectors (such as claude.ai connectors) are disabled. Re-run with ${PROVIDER_MCP_FLAG} to enable them for a session.`;

/**
 * One line naming the agent's gateway and the state it is in, or `undefined`
 * for an agent that has no provider-hosted gateway to report on.
 */
export function describeProviderMcp(
  agent: AgentAdapter,
  allowed: boolean | undefined,
): string | undefined {
  const config = agent.providerMcp;

  if (config == null) {
    return undefined;
  }

  const hosts = config.hosts.join(', ');

  return allowed === true
    ? `${config.label}: enabled by ${PROVIDER_MCP_FLAG} (allowlisted: ${hosts}).`
    : `${config.label}: disabled. Pass ${PROVIDER_MCP_FLAG} to enable them and allowlist ${hosts}.`;
}
