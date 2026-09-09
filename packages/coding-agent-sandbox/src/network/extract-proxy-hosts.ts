/** Hostnames the bundled session proxy names in its log lines. */
const REACHED_PATTERN = /^PROXY (?:HTTP|CONNECT) (?<host>[\w.-]+):\d+/gmu;
const BLOCKED_PATTERN = /^PROXY REJECTED (?<host>[\w.-]+):\d+/gmu;

/** What a session's proxy saw, split by whether the destination was allowed. */
export interface ProxyAudit {
  /** Hosts the session actually reached. */
  reached: string[];
  /** Hosts the proxy refused; in `strict` these are allowlist candidates. */
  blocked: string[];
}

/**
 * Unique hostnames a session's proxy saw, read back from its container log.
 * Refusals are reported separately: they are how a strict session tells you
 * what it could not reach.
 */
export function extractProxyHosts(log: string): ProxyAudit {
  const reached = collect(log, REACHED_PATTERN);
  const blocked = collect(log, BLOCKED_PATTERN);

  return {
    reached: [...reached].sort(),
    // A host that succeeded at least once is not worth reporting as blocked.
    blocked: [...blocked].filter((host) => !reached.has(host)).sort(),
  };
}

function collect(log: string, pattern: RegExp): Set<string> {
  const hosts = new Set<string>();

  for (const match of log.matchAll(pattern)) {
    const host = match.groups?.['host'];

    if (host != null && host !== '') {
      hosts.add(host.toLowerCase());
    }
  }

  return hosts;
}
