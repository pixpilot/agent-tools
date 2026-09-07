import type { AgentAdapter } from '../agents/agent-adapter';
import type { EnvironmentAdapter } from '../environments/environment-adapter';
import { BOOTSTRAP_EGRESS_HOSTS } from '../constants';

/** Everything that contributes hosts to one session's allowlist. */
export interface EgressHostSources {
  agent: AgentAdapter;
  environment?: EnvironmentAdapter | undefined;
}

/**
 * The `strict` allowlist: what the container bootstrap needs before any agent
 * runs, plus the selected agent's provider, plus the detected environment's
 * registries. Deduplicated and sorted so the proxy config is deterministic.
 */
export function resolveEgressHosts({
  agent,
  environment,
}: EgressHostSources): string[] {
  const hosts = [
    ...BOOTSTRAP_EGRESS_HOSTS,
    ...agent.egressHosts,
    ...(environment?.egressHosts ?? []),
  ].map((host) => host.trim().toLowerCase());

  return [...new Set(hosts.filter((host) => host !== ''))].sort();
}
