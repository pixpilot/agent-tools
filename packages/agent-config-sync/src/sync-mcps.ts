import type { AgentId } from './types';
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc';

const JSON_INDENT_SPACES = 2;
type McpServers = Record<string, Record<string, unknown>>;

/** Reads a portable MCP server map and refuses malformed source values. */
export function readMcpServers(source: string): McpServers {
  const value = parseJsonc(fs.readFileSync(source, 'utf8'), source);
  if (value == null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(`MCP source must contain an object: ${source}`);
  }

  return sanitizeMcpServers(value as Record<string, unknown>);
}

/** Writes the selected agent's MCP configuration without touching credentials. */
export function syncMcps(source: string, target: string, agent: AgentId): string {
  const servers = readMcpServers(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (agent === 'codex') {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    fs.writeFileSync(target, replaceCodexMcpServers(existing, servers));
  } else {
    const existing = readJsonObject(target);
    const property = agent === 'claude' ? 'mcpServers' : 'servers';
    existing[property] = servers;
    fs.writeFileSync(target, `${JSON.stringify(existing, null, JSON_INDENT_SPACES)}\n`);
  }

  return target;
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
