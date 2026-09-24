import process from 'node:process';
import { isEgressHost } from '../network/render-host-filter';

/** A registry token the dependency install reads from a host variable. */
export interface NpmRegistryAuth {
  /** Registry hostname, e.g. `npm.pkg.github.com`. */
  host: string;
  /** Host environment variable holding the token; forwarded by name only. */
  envVar: string;
}

const ENV_VAR_PATTERN = /^[a-z_]\w*$/iu;

/**
 * Variables the image or the session already defines. Forwarding one of these
 * would replace it for the whole bootstrap, not just the install.
 */
const RESERVED_ENV_VARS = new Set([
  'HOME',
  'HOSTNAME',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'PATH',
  'PWD',
  'SHELL',
  'TERM',
  'USER',
]);
const RESERVED_PREFIXES = ['SANDBOX_', 'NPM_CONFIG_', 'GIT_', 'COREPACK_', 'YARN_'];
const PROXY_SUFFIX = '_PROXY';

const EXAMPLE = 'npm.pkg.github.com=GH_PACKAGES_TOKEN';

/** Parses one `--npm-auth <host>=<ENV_VAR>` entry. */
export function parseNpmAuth(spec: string): NpmRegistryAuth {
  const separator = spec.indexOf('=');
  const host = spec.slice(0, Math.max(separator, 0)).trim().toLowerCase();
  const envVar = spec.slice(separator + 1).trim();

  if (
    separator < 0 ||
    host.startsWith('*.') ||
    !isEgressHost(host) ||
    !ENV_VAR_PATTERN.test(envVar)
  ) {
    throw new Error(
      `Invalid --npm-auth ${JSON.stringify(spec)}. Expected <host>=<ENV_VAR>, e.g. ${EXAMPLE}.`,
    );
  }

  if (isReserved(envVar)) {
    throw new Error(
      `--npm-auth cannot forward ${envVar}: the sandbox relies on that variable itself.`,
    );
  }

  return { host, envVar };
}

/** Parses every `--npm-auth` entry, rejecting a registry named twice. */
export function parseNpmAuthList(specs: readonly string[] = []): NpmRegistryAuth[] {
  const entries = specs.map(parseNpmAuth);
  const hosts = new Set<string>();

  for (const { host } of entries) {
    if (hosts.has(host)) {
      throw new Error(`--npm-auth names ${host} more than once.`);
    }
    hosts.add(host);
  }

  return entries;
}

/** Token variables that are unset or empty in the host environment. */
export function findMissingNpmTokens(
  entries: readonly NpmRegistryAuth[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return entries
    .map(({ envVar }) => envVar)
    .filter((envVar) => (env[envVar] ?? '').trim() === '');
}

function isReserved(envVar: string): boolean {
  const name = envVar.toUpperCase();

  return (
    RESERVED_ENV_VARS.has(name) ||
    name.endsWith(PROXY_SUFFIX) ||
    RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}
