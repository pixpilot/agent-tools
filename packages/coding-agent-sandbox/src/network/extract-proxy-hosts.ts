/** Hostnames tinyproxy names in its connection, tunnel and refusal log lines. */
const HOST_PATTERNS = [
  /CONNECT\s+(?<host>[\w.-]+):\d+/gu,
  /host "(?<host>[^"]+)"/gu,
  /filtered domain "(?<host>[^"]+)"/gu,
];

/**
 * Unique hostnames a session's proxy saw, read back from its container log.
 * This is what `open` mode delivers in place of prevention.
 */
export function extractProxyHosts(log: string): string[] {
  const hosts = new Set<string>();

  for (const pattern of HOST_PATTERNS) {
    for (const match of log.matchAll(pattern)) {
      const host = match.groups?.['host'];

      if (host != null && host !== '') {
        hosts.add(host.toLowerCase());
      }
    }
  }

  return [...hosts].sort();
}
