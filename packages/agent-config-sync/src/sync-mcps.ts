import type { AgentId } from './types.ts';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseJsonc } from './jsonc.ts';

const JSON_INDENT_SPACES = 2;
const PORTABLE_DEFAULTS_KEY = '$defaults';
const JSON_SCHEMA_KEY = '$schema';
const STARTUP_TIMEOUT_KEY = 'startupTimeoutSec';
const CODEX_OPTIONAL_STARTUP_GRACE_KEY = 'mcp_optional_startup_grace_ms';
const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Environment a stdio MCP server needs to reach the network from inside the
 * sandbox. Claude Code hands child processes the full environment, but Codex
 * starts them with a fixed core allowlist, so the session proxy and the shared
 * npm cache have to be re-attached per server: without them `npx` resolves DNS
 * itself and dies with EAI_AGAIN on the gateway-less internal network. Codex
 * merges this map into its allowlist, so PATH and HOME still reach the server.
 */
const FORWARDED_MCP_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
  'NPM_CONFIG_CACHE',
] as const;

type McpServers = Record<string, Record<string, unknown>>;

interface McpConfig {
  servers: McpServers;
  startupTimeoutSec?: number;
}

interface McpSyncOptions {
  settingsFile?: string | undefined;
}

/** Reads a portable MCP server map and refuses malformed source values. */
export function readMcpServers(source: string): McpServers {
  return readMcpConfig(source).servers;
}

/** Writes portable MCP servers and source-wide startup policy to one client. */
export function syncMcps(
  source: string,
  target: string,
  agent: AgentId,
  options: McpSyncOptions = {},
): string[] {
  const config = readMcpConfig(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (agent === 'codex') {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    // Codex decides for itself when to give up on a pending optional server;
    // earlier versions of this sync pinned that to 0, so drop what they left.
    const contents = replaceCodexMcpServers(
      removeTopLevelTomlSetting(existing, CODEX_OPTIONAL_STARTUP_GRACE_KEY),
      withServerEnv(
        withServerTimeout(
          config.servers,
          'startup_timeout_sec',
          config.startupTimeoutSec,
        ),
        readForwardedMcpEnv(),
      ),
    );
    fs.writeFileSync(target, contents);
    return [target];
  }

  const existing = readJsonObject(target);
  const servers =
    agent === 'copilot'
      ? withServerTimeout(
          config.servers,
          'timeout',
          config.startupTimeoutSec == null
            ? undefined
            : config.startupTimeoutSec * MILLISECONDS_PER_SECOND,
        )
      : config.servers;
  existing['mcpServers'] = servers;
  fs.writeFileSync(target, `${JSON.stringify(existing, null, JSON_INDENT_SPACES)}\n`);

  const copied = [target];
  if (
    agent === 'claude' &&
    config.startupTimeoutSec != null &&
    options.settingsFile != null
  ) {
    syncClaudeStartupTimeout(options.settingsFile, config.startupTimeoutSec);
    copied.push(options.settingsFile);
  }
  return copied;
}

function readMcpConfig(source: string): McpConfig {
  const value = parseJsonc(fs.readFileSync(source, 'utf8'), source);
  if (value == null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(`MCP source must contain an object: ${source}`);
  }

  const sourceConfig = value as Record<string, unknown>;
  const defaults = sourceConfig[PORTABLE_DEFAULTS_KEY];
  const servers = Object.fromEntries(
    Object.entries(sourceConfig).filter(
      ([name]) => name !== PORTABLE_DEFAULTS_KEY && name !== JSON_SCHEMA_KEY,
    ),
  );

  return {
    servers: sanitizeMcpServers(servers),
    ...(defaults === undefined
      ? {}
      : { startupTimeoutSec: readStartupTimeoutSec(defaults, source) }),
  };
}

function readStartupTimeoutSec(defaults: unknown, source: string): number {
  if (defaults == null || Array.isArray(defaults) || typeof defaults !== 'object') {
    throw new TypeError(`${PORTABLE_DEFAULTS_KEY} must contain an object: ${source}`);
  }

  const value = (defaults as Record<string, unknown>)[STARTUP_TIMEOUT_KEY];
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(
      `${PORTABLE_DEFAULTS_KEY}.${STARTUP_TIMEOUT_KEY} must be a positive integer: ${source}`,
    );
  }

  return value as number;
}

function withServerTimeout(
  servers: McpServers,
  key: string,
  timeout: number | undefined,
): McpServers {
  if (timeout == null) return servers;

  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      { ...server, [key]: timeout },
    ]),
  );
}

/** Reads the sandbox network settings this sync process was itself started with. */
function readForwardedMcpEnv(): Record<string, string> {
  return Object.fromEntries(
    FORWARDED_MCP_ENV_KEYS.map((key) => [key, process.env[key]]).filter(
      (entry): entry is [string, string] => entry[1] != null && entry[1] !== '',
    ),
  );
}

/** Attaches one shared environment to every server, changing nothing when empty. */
function withServerEnv(servers: McpServers, env: Record<string, string>): McpServers {
  if (Object.keys(env).length === 0) return servers;

  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, { ...server, env }]),
  );
}

function syncClaudeStartupTimeout(settingsFile: string, timeoutSec: number): void {
  const settings = readJsonObject(settingsFile);
  const existingEnv = settings['env'];
  if (
    existingEnv != null &&
    (Array.isArray(existingEnv) || typeof existingEnv !== 'object')
  ) {
    throw new TypeError(`Claude settings env must contain an object: ${settingsFile}`);
  }

  settings['env'] = {
    ...(existingEnv as Record<string, unknown> | undefined),
    MCP_TIMEOUT: String(timeoutSec * MILLISECONDS_PER_SECOND),
  };
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(
    settingsFile,
    `${JSON.stringify(settings, null, JSON_INDENT_SPACES)}\n`,
  );
}

/** Removes credentials and arbitrary environment variables from MCP definitions. */
export function sanitizeMcpServers(value: Record<string, unknown>): McpServers {
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, config]) =>
          config != null && !Array.isArray(config) && typeof config === 'object',
      )
      .map(([name, config]) => [
        name,
        stripSensitiveValues(config as Record<string, unknown>),
      ]),
  );
}

/** Replaces the Codex MCP table group while retaining unrelated TOML settings. */
export function replaceCodexMcpServers(toml: string, servers: McpServers): string {
  const retained: string[] = [];
  let skipping = false;

  for (const line of toml.split(/(?<=\n)/u)) {
    if (/^\s*\[mcp_servers(?:\.|\])/u.test(line)) {
      skipping = true;
    } else {
      if (/^\s*\[/u.test(line)) skipping = false;
      if (!skipping) retained.push(line);
    }
  }

  const generated = Object.entries(servers)
    .map(([name, config]) => {
      const lines = [`[mcp_servers.${JSON.stringify(name)}]`];
      for (const [key, value] of Object.entries(config)) {
        lines.push(`${key} = ${toTomlValue(value)}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  const prefix = retained.join('').trimEnd();
  return generated === ''
    ? `${prefix}\n`
    : `${prefix}${prefix === '' ? '' : '\n\n'}${generated}\n`;
}

/** Drops a top-level setting, and the blank line under it, leaving tables alone. */
function removeTopLevelTomlSetting(toml: string, key: string): string {
  const settingPattern = new RegExp(`^\\s*${key}\\s*=`, 'u');
  const retained: string[] = [];
  let inTopLevel = true;
  let removedPrevious = false;

  for (const line of toml.split(/\r?\n/u)) {
    if (/^\s*\[/u.test(line)) inTopLevel = false;

    if (inTopLevel && settingPattern.test(line)) {
      removedPrevious = true;
    } else if (!removedPrevious || line.trim() !== '') {
      removedPrevious = false;
      retained.push(line);
    }
  }

  return retained.join('\n');
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const value = parseJsonc(fs.readFileSync(filePath, 'utf8'), filePath);
  if (value == null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(`MCP target must contain an object: ${filePath}`);
  }
  return value as Record<string, unknown>;
}

function stripSensitiveValues(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, entry]) => [key, sanitizeValue(entry, key)]),
  );
}

function sanitizeValue(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    return key === 'args'
      ? sanitizeArguments(value)
      : value.map((entry) => sanitizeValue(entry, key));
  }
  if (value != null && typeof value === 'object')
    return stripSensitiveValues(value as Record<string, unknown>);
  return typeof value === 'string' && /url|uri|endpoint/iu.test(key)
    ? sanitizeUrl(value)
    : value;
}

function isSensitiveKey(key: string): boolean {
  return /api[_-]?key|token|secret|password|authorization|credential|cookie|headers?|oauth|connection(?:string|[_-]?options)?|^env$/iu.test(
    key,
  );
}

function sanitizeArguments(args: unknown[]): unknown[] {
  const sanitized: unknown[] = [];
  let skipNext = false;

  for (const argument of args) {
    if (skipNext) {
      skipNext = false;
    } else if (typeof argument === 'string' && isSensitiveArgument(argument)) {
      skipNext = !argument.includes('=');
    } else {
      sanitized.push(sanitizeValue(argument, 'args'));
    }
  }

  return sanitized;
}

function isSensitiveArgument(argument: string): boolean {
  return /^--?(?:api[_-]?key|token|secret|password|authorization|credential|cookie|headers?|oauth|connection(?:string|[_-]?options)?)(?:=|$)/iu.test(
    argument,
  );
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function toTomlValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(toTomlValue).join(', ')}]`;
  if (value != null && typeof value === 'object') {
    return `{ ${Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${JSON.stringify(key)} = ${toTomlValue(entry)}`)
      .join(', ')} }`;
  }
  throw new TypeError('MCP configuration values cannot be null or undefined.');
}
