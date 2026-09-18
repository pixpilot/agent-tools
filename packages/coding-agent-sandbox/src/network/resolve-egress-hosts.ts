import type { AgentAdapter } from '../agents/agent-adapter';
import type { EnvironmentAdapter } from '../environments/environment-adapter';
import { BOOTSTRAP_EGRESS_HOSTS } from '../constants';
import { isEgressHost } from './render-host-filter';

/** Everything that contributes hosts to one session's allowlist. */
export interface EgressHostSources {
  agent: AgentAdapter;
  environment?: EnvironmentAdapter | undefined;
  /** The repository's own Git remotes, plus anything `--allow-hosts` added. */
  extraHosts?: readonly string[] | undefined;
  /**
   * Adds the agent's provider MCP gateway. Off by default, so the gateway host
   * is absent from the allowlist unless the session asked for it.
   */
  allowProviderMcp?: boolean | undefined;
}

/**
 * The `strict` allowlist: what the container bootstrap needs before any agent
 * runs, plus the selected agent's provider, plus the detected environment's
 * registries. Deduplicated and sorted so the proxy config is deterministic.
 */
export function resolveEgressHosts({
  agent,
  environment,
  extraHosts,
  allowProviderMcp,
}: EgressHostSources): string[] {
  const hosts = [
    ...BOOTSTRAP_EGRESS_HOSTS,
    ...agent.egressHosts,
    ...(allowProviderMcp === true ? (agent.providerMcp?.hosts ?? []) : []),
    ...(environment?.egressHosts ?? []),
    ...(extraHosts ?? []),
  ].map((host) => host.trim().toLowerCase());

  const resolved = [...new Set(hosts.filter((host) => host !== ''))].sort();

  for (const host of resolved) {
    if (!isEgressHost(host)) {
      throw new Error(
        `Invalid egress host ${JSON.stringify(host)}. Expected a hostname such as "example.com" or "*.example.com".`,
      );
    }
  }

  return resolved;
}
