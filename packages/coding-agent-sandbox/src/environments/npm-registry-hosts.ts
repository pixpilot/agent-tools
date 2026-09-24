import fs from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { isEgressHost } from '../network/render-host-filter';

/**
 * Hosts a registry hands tarball downloads off to. GitHub Packages redirects
 * every download to its blob storage, so allowing the registry alone would
 * resolve every manifest and then fail on the first tarball.
 */
const DOWNLOAD_HOSTS: Readonly<Record<string, readonly string[]>> = {
  'npm.pkg.github.com': ['pkg-npm.githubusercontent.com'],
};

/** `registry=<url>` and `@scope:registry=<url>`; comment lines never match. */
const REGISTRY_LINE = /^\s*(?:@[^\s:=]+:)?registry\s*=\s*(?<url>\S+)/u;

/**
 * `//host[/path]/:_authToken=${VAR}` (npm's optional `${VAR?}` included). A
 * token written out literally never matches, so it is never read.
 */
const TOKEN_VAR_LINE =
  /^\s*\/\/(?<host>[^\s/:]+)(?::\d+)?(?:\/\S*)?:_authToken\s*=\s*\$\{(?<envVar>[a-z_]\w*)\??\}\s*$/iu;

const HTTP_URL = /^https?:\/\//iu;

/** A registry host followed by the hosts it redirects downloads to. */
export function withDownloadHosts(host: string): string[] {
  const normalized = host.trim().toLowerCase();

  return [normalized, ...(DOWNLOAD_HOSTS[normalized] ?? [])];
}

/**
 * Registry hosts named in a project's `.npmrc`. Hosts the allowlist cannot
 * express, such as IP addresses or `${VAR}` placeholders, are skipped.
 */
export function readNpmrcRegistries(projectPath: string): string[] {
  const hosts = new Set<string>();

  for (const line of readLines(path.join(projectPath, '.npmrc'))) {
    const url = REGISTRY_LINE.exec(line)?.groups?.['url'];
    const host = url == null ? undefined : hostOf(url);

    if (host != null) {
      hosts.add(host);
    }
  }

  return [...hosts].sort();
}

/**
 * Registry hosts in a project's `.npmrc` plus their download hosts, so a
 * scoped private registry works in `strict` mode without `--allow-hosts`.
 */
export function readNpmrcRegistryHosts(projectPath: string): string[] {
  return [...new Set(readNpmrcRegistries(projectPath).flatMap(withDownloadHosts))].sort();
}

/**
 * Registry host to token variable, for every auth line in an npmrc file that
 * names a variable. The first line for a host wins, as it does for npm.
 */
export function readNpmrcTokenVars(file: string): Map<string, string> {
  const tokens = new Map<string, string>();

  for (const line of readLines(file)) {
    const groups = TOKEN_VAR_LINE.exec(line)?.groups;
    const host = groups?.['host']?.toLowerCase();
    const envVar = groups?.['envVar'];

    if (host != null && envVar != null && !tokens.has(host)) {
      tokens.set(host, envVar);
    }
  }

  return tokens;
}

function readLines(file: string): string[] {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/u);
  } catch {
    return [];
  }
}

function hostOf(url: string): string | undefined {
  if (!HTTP_URL.test(url)) {
    return undefined;
  }

  try {
    const { hostname } = new URL(url);
    // An IP address is almost always a local registry, which the proxy
    // refuses to reach anyway.
    return isIP(hostname) === 0 && isEgressHost(hostname)
      ? hostname.toLowerCase()
      : undefined;
  } catch {
    return undefined;
  }
}
