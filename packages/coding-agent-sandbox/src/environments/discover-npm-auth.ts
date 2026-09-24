import type { NpmRegistryAuth } from './parse-npm-auth';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { readNpmrcRegistries, readNpmrcTokenVars } from './npm-registry-hosts';
import { findMissingNpmTokens, parseNpmAuth } from './parse-npm-auth';

/** A token variable found in an npmrc file. */
export interface DiscoveredNpmAuth extends NpmRegistryAuth {
  /** The npmrc file whose auth line names the variable. */
  source: string;
}

/** What `--auto-npm-auth` found for the project's registries. */
export interface NpmAuthDiscovery {
  /** Entries whose variable is set on the host, ready to forward. */
  found: DiscoveredNpmAuth[];
  /** Entries whose variable is unset or empty on the host. */
  missing: DiscoveredNpmAuth[];
}

export interface DiscoverNpmAuthOptions {
  /** Host user config; defaults to the one npm itself would read. */
  userConfig?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

/** The host user config npm and pnpm read, honouring `NPM_CONFIG_USERCONFIG`. */
export function hostUserNpmrcPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (
    env['NPM_CONFIG_USERCONFIG'] ??
    env['npm_config_userconfig'] ??
    ''
  ).trim();

  return configured === '' ? path.join(os.homedir(), '.npmrc') : configured;
}

/**
 * For each registry the project's `.npmrc` names, the token variable an auth
 * line refers to. The project file is checked before the host user config,
 * matching npm's precedence. Only `${VAR}` references are read; a token written
 * into a file is never picked up.
 */
export function discoverNpmAuth(
  projectPath: string,
  options: DiscoverNpmAuthOptions = {},
): NpmAuthDiscovery {
  const env = options.env ?? process.env;
  const sources = [
    path.join(projectPath, '.npmrc'),
    options.userConfig ?? hostUserNpmrcPath(env),
  ].map((source) => ({ source, tokenVars: readNpmrcTokenVars(source) }));
  const discovery: NpmAuthDiscovery = { found: [], missing: [] };

  for (const host of readNpmrcRegistries(projectPath)) {
    const match = sources.find(({ tokenVars }) => tokenVars.has(host));
    const entry = match == null ? undefined : toEntry(host, match);

    if (entry != null) {
      const bucket = findMissingNpmTokens([entry], env).length > 0 ? 'missing' : 'found';
      discovery[bucket].push(entry);
    }
  }

  return discovery;
}

function toEntry(
  host: string,
  { source, tokenVars }: { source: string; tokenVars: Map<string, string> },
): DiscoveredNpmAuth | undefined {
  try {
    return { ...parseNpmAuth(`${host}=${tokenVars.get(host)}`), source };
  } catch {
    // A reference to a variable the sandbox reserves, such as `${HOME}`, is
    // not a registry token; `--npm-auth` explains the rule if it is asked for.
    return undefined;
  }
}
