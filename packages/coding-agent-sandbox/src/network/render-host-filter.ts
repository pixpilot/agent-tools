const MAX_HOST_LENGTH = 253;

/** Two or more labels, optionally prefixed with `*.` for subdomains. */
const HOST_PATTERN =
  /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u;

/** One or more leading labels, so `*.example.com` excludes `example.com` itself. */
const SUBDOMAIN_PREFIX = '([a-z0-9-]+\\.)+';

const WILDCARD = '*.';

/** True when a string is a hostname this allowlist can safely express. */
export function isEgressHost(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return normalized.length <= MAX_HOST_LENGTH && HOST_PATTERN.test(normalized);
}

/**
 * Turns one allowlist host into an anchored regex for the proxy's filter file.
 * Tinyproxy matches filters unanchored, so a bare `registry.npmjs.org` would
 * also match `registry.npmjs.org.attacker.example`.
 */
export function renderHostFilter(host: string): string {
  const normalized = host.trim().toLowerCase();
  ensureValidHost(normalized, host);

  return normalized.startsWith(WILDCARD)
    ? `^${SUBDOMAIN_PREFIX}${escapeHost(normalized.slice(WILDCARD.length))}$`
    : `^${escapeHost(normalized)}$`;
}

/** Rejects anything that would inject regex syntax into the filter file. */
function ensureValidHost(normalized: string, original: string): void {
  if (!isEgressHost(normalized)) {
    throw new Error(
      `Invalid egress host ${JSON.stringify(original)}. Expected a hostname such as "example.com" or "*.example.com".`,
    );
  }
}

function escapeHost(value: string): string {
  return value.replace(/[^a-z0-9-]/gu, (character) => `\\${character}`);
}
