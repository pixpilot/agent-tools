import {
  EGRESS_NETWORK_PREFIX,
  NETWORK_PREFIX,
  PROXY_CONTAINER_PREFIX,
  PROXY_PORT,
} from '../constants';
import { shortHash } from '../utils/short-hash';

const SESSION_KEY_LENGTH = 12;

/** Every Docker object one session's networking owns. */
export interface SessionNetworkNames {
  internal: string;
  egress: string;
  proxy: string;
  /** Proxy address as seen from the agent container, via Docker's embedded DNS. */
  proxyUrl: string;
}

/**
 * Deterministic names for a session's networks and proxy, derived from its
 * container name. Determinism lets the next run of the same session remove
 * objects a crashed run left behind, instead of adopting a stale proxy whose
 * allowlist no longer matches.
 */
export function sessionNetworkNames(containerName: string): SessionNetworkNames {
  const key = shortHash(containerName, SESSION_KEY_LENGTH);
  const proxy = `${PROXY_CONTAINER_PREFIX}-${key}`;

  return {
    internal: `${NETWORK_PREFIX}-${key}`,
    egress: `${EGRESS_NETWORK_PREFIX}-${key}`,
    proxy,
    proxyUrl: `http://${proxy}:${PROXY_PORT}`,
  };
}
