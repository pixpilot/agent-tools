import { isEgressHost } from '../network/render-host-filter';
import { runCapture } from '../utils/run-command';

const HTTP_REMOTE = /^https?:\/\//iu;

/**
 * Hostnames of the repository's own HTTPS Git remotes. `strict` mode has to
 * allow these, or fetch, pull and push fail in a session whose entire purpose
 * is committing to that repository.
 *
 * SSH remotes are ignored on purpose: they cannot traverse an HTTP proxy.
 */
export function getRemoteHosts(repositoryRoot: string): string[] {
  const result = runCapture('git', [
    '-C',
    repositoryRoot,
    'config',
    '--get-regexp',
    String.raw`^remote\..*\.url`,
  ]);

  if (result.status !== 0) {
    return [];
  }

  const hosts = new Set<string>();

  for (const line of result.stdout.split(/\r?\n/u)) {
    const host = hostOf(line.slice(line.indexOf(' ') + 1).trim());

    if (host != null) {
      hosts.add(host);
    }
  }

  return [...hosts].sort();
}

function hostOf(url: string): string | undefined {
  if (!HTTP_REMOTE.test(url)) {
    return undefined;
  }

  try {
    const { hostname } = new URL(url);
    // Derived from repository config, so a host we cannot express is skipped
    // rather than allowed to abort the session.
    return isEgressHost(hostname) ? hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
