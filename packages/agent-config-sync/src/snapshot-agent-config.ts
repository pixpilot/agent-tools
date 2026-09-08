import type { AgentId, ConfigSnapshot } from './types';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAgentConfigPaths } from './agent-config-paths';
import { inspectConfigDirectory } from './config-directory';
import { parseJsonc } from './jsonc';
import { sanitizeMcpServers } from './sync-mcps';
import { extractRules } from './sync-rules';

const JSON_INDENT_SPACES = 2;
/** Creates a temporary portable snapshot containing no credentials or token values. */
export function createAgentConfigSnapshot(
  agent: AgentId,
  options: { homeDirectory?: string; platform?: NodeJS.Platform } = {},
): ConfigSnapshot {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-sync-'));
  try {
    const paths = getAgentConfigPaths(agent, options);
    copyDirectoryIfPresent(paths.skillsDirectory, path.join(root, 'skills'));
    copyPrompts(agent, paths.promptsDirectory, path.join(root, 'prompts'));
    copyMcpSnapshot(agent, paths.mcpFile, path.join(root, 'mcp.jsonc'));
    copyRulesSnapshot(paths.rulesFile, path.join(root, 'GLOBAL-AI-RULES.md'));
    const info = inspectConfigDirectory(root);
    return { ...info, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
  } catch (cause) {
    fs.rmSync(root, { recursive: true, force: true });
    throw cause;
  }
}

function copyDirectoryIfPresent(source: string, target: string): void {
  if (!isDirectory(source)) return;
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isSymbolicLink() && !isSensitiveName(entry.name)) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      if (entry.isDirectory()) copyDirectoryIfPresent(sourcePath, targetPath);
      else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function copyPrompts(agent: AgentId, source: string, target: string): void {
  if (!isDirectory(source)) return;
  const files = fs
    .readdirSync(source, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.md') && !isSensitiveName(entry.name),
    );
  if (files.length === 0) return;
  fs.mkdirSync(target, { recursive: true });

  for (const file of files) {
    if (agent === 'copilot') {
      fs.copyFileSync(path.join(source, file.name), path.join(target, file.name));
    } else if (file.name.endsWith('.md')) {
      const name = file.name.endsWith('.prompt.md')
        ? file.name
        : file.name.replace(/\.md$/u, '.prompt.md');
      fs.copyFileSync(path.join(source, file.name), path.join(target, name));
    }
  }
}

function copyMcpSnapshot(agent: AgentId, source: string, target: string): void {
  if (!isFile(source)) return;
  const servers = readInstalledMcpServers(agent, source);
  if (Object.keys(servers).length === 0) return;
  fs.writeFileSync(target, `${JSON.stringify(sanitizeMcpServers(servers), null, JSON_INDENT_SPACES)}\n`);
}

function readInstalledMcpServers(
  agent: AgentId,
  source: string,
): Record<string, unknown> {
  if (agent === 'codex') return extractCodexMcpServers(fs.readFileSync(source, 'utf8'));

  const value = parseJsonc(fs.readFileSync(source, 'utf8'), source);
  if (value == null || Array.isArray(value) || typeof value !== 'object') return {};
  const property = agent === 'claude' ? 'mcpServers' : 'servers';
  const servers = (value as Record<string, unknown>)[property];
  return servers != null && !Array.isArray(servers) && typeof servers === 'object'
    ? (servers as Record<string, unknown>)
    : {};
}

function copyRulesSnapshot(source: string, target: string): void {
  if (!isFile(source)) return;
  const rules = extractRules(fs.readFileSync(source, 'utf8'));
  if (rules !== '') fs.writeFileSync(target, `${rules}\n`);
}

function isDirectory(candidate: string): boolean {
  return fs.existsSync(candidate) && fs.lstatSync(candidate).isDirectory();
}

function isFile(candidate: string): boolean {
  return fs.existsSync(candidate) && fs.lstatSync(candidate).isFile();
}

function isSensitiveName(name: string): boolean {
  return /^\.env(?:\.|$)|(?:^|[._-])(?:api[_-]?key|auth|credential|credentials|secret|token|password|cookie)(?:[._-]|$)/iu.test(
    name,
  );
}

/** Extracts simple Codex MCP tables so they can be safely converted to portable JSON. */
export function extractCodexMcpServers(contents: string): Record<string, unknown> {
  const servers: Record<string, Record<string, unknown>> = {};
  let current: Record<string, unknown> | undefined;

  for (const line of contents.split(/\r?\n/u)) {
    const header = line.match(
      /^\s*\[mcp_servers\.(?:"(?<quotedName>[^"\\]*(?:\\.[^"\\]*)*)"|(?<plainName>[\w-]+))\]\s*$/u,
    );
    if (header != null) {
      const quotedName = header.groups?.['quotedName'];
      const plainName = header.groups?.['plainName'];
      const name = quotedName == null ? plainName : parseJsonString(`"${quotedName}"`);
      if (name != null) {
        current = {};
        servers[name] = current;
      }
    } else if (/^\s*\[/u.test(line)) {
      current = undefined;
    } else {
      const separator = line.indexOf('=');
      const key = line.slice(0, separator).trim();
      const value = separator < 0 ? '' : stripTomlComment(line.slice(separator + 1));
      if (current != null && separator >= 0 && /^[\w-]+$/u.test(key)) {
        current[key] = parseTomlValue(value);
      }
    }
  }

  return servers;
}

function parseTomlValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return JSON.parse(trimmed);
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return splitTomlValues(trimmed.slice(1, -1)).map(parseTomlValue);
  }
  return trimmed;
}

function splitTomlValues(value: string): string[] {
  const values: string[] = [];
  let part = '';
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;

    if (character === ',' && !quoted) {
      values.push(part);
      part = '';
    } else part += character;
  }
  if (part.trim() !== '') values.push(part);
  return values;
}
function parseJsonString(value: string): string {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== 'string') throw new TypeError('Expected a JSON string.');
  return parsed;
}

function stripTomlComment(value: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') {
      quoted = true;
    } else if (character === '#') {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trim();
}
