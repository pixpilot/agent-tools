import type { AgentId } from '@pixpilot/agent-config-sync';
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from '@pixpilot/agent-config-sync';

/** Filenames recognized as the portable per-agent launch settings. */
const SETTINGS_FILES = ['agents.jsonc', 'agents.json'] as const;
/** Key holding settings that apply to every agent, mirroring `mcp.jsonc`. */
const DEFAULTS_KEY = '$defaults';

/** Launch settings a configuration directory can supply for one agent. */
export interface AgentSettings {
  /** Agent-specific model name, passed through to the agent CLI unvalidated. */
  model?: string | undefined;
  /** Agent-specific model names available to integrations for selection. */
  models?: readonly string[] | undefined;
}

/**
 * Reads `agents.jsonc` from a portable configuration directory. Unlike the
 * synced components these settings shape the launch command on the host, so a
 * missing file is simply an empty settings object.
 */
export function readAgentSettings(
  configsDir: string | undefined,
  agent: AgentId,
): AgentSettings {
  const file = findSettingsFile(configsDir);
  if (file == null) {
    return {};
  }

  const contents = readObject(parseJsonc(fs.readFileSync(file, 'utf8'), file), file);
  const defaults = readObject(contents[DEFAULTS_KEY] ?? {}, file, DEFAULTS_KEY);
  const forAgent = readObject(contents[agent] ?? {}, file, agent);
  const model = readOptionalString(forAgent['model'] ?? defaults['model'], file, 'model');
  const models = readOptionalStrings(
    forAgent['models'] ?? defaults['models'],
    file,
    'models',
  );

  return {
    ...(model == null ? {} : { model }),
    ...(models == null ? {} : { models }),
  };
}

function findSettingsFile(configsDir: string | undefined): string | undefined {
  const directory = configsDir?.trim();
  if (directory == null || directory === '') {
    return undefined;
  }

  return SETTINGS_FILES.map((name) => path.join(path.resolve(directory), name)).find(
    (candidate) => fs.existsSync(candidate) && fs.lstatSync(candidate).isFile(),
  );
}

function readObject(value: unknown, file: string, key?: string): Record<string, unknown> {
  if (value == null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(
      `${key == null ? 'Agent settings' : `"${key}"`} must contain an object: ${file}`,
    );
  }
  return value as Record<string, unknown>;
}

function readOptionalString(
  value: unknown,
  file: string,
  key: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`"${key}" must be a non-empty string: ${file}`);
  }
  return value.trim();
}

function readOptionalStrings(
  value: unknown,
  file: string,
  key: string,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`"${key}" must contain non-empty strings: ${file}`);
  }
  const strings = value.filter(
    (entry: unknown): entry is string =>
      typeof entry === 'string' && entry.trim() !== '',
  );
  if (strings.length !== value.length) {
    throw new TypeError(`"${key}" must contain non-empty strings: ${file}`);
  }
  return strings.map((entry) => entry.trim());
}
