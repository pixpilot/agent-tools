import type { AgentId } from '@pixpilot/agent-config-sync';
import type { ReasoningEffort } from '../agents/reasoning-effort';
import type { PromptSuffix } from './read-prompt-suffix';
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from '@pixpilot/agent-config-sync';
import { parseModelSpec } from '../agents/parse-model-spec';
import { KNOWN_EFFORTS, parseReasoningEffort } from '../agents/reasoning-effort';
import { readOptionalString } from './read-optional-string';
import { readPromptSuffix } from './read-prompt-suffix';

/** Filenames recognized as the portable per-agent launch settings. */
const SETTINGS_FILES = ['agents.jsonc', 'agents.json'] as const;
/** Key holding settings that apply to every agent, mirroring `mcp.jsonc`. */
const DEFAULTS_KEY = '$defaults';

/** One selectable model, with the options it may be run with. */
export interface ModelChoice {
  /** Model name passed directly to the agent CLI. */
  name: string;
  /** Display name a picker shows instead of the raw model name. */
  label?: string | undefined;
  /** Reasoning efforts this model may be run with. */
  efforts?: readonly ReasoningEffort[] | undefined;
  /** Reasoning effort selected with this model by default. */
  effort?: ReasoningEffort | undefined;
}

/** Launch settings a configuration directory can supply for one agent. */
export interface AgentSettings {
  /** Agent-specific model name, passed through to the agent CLI unvalidated. */
  model?: string | undefined;
  /** Reasoning effort, mapped onto whichever setting the agent CLI understands. */
  effort?: ReasoningEffort | undefined;
  /** Models available to integrations for selection, one entry per model. */
  models?: readonly ModelChoice[] | undefined;
  /** Shared instructions appended to a non-empty initial prompt. */
  promptSuffix?: PromptSuffix | undefined;
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
  // A `<model>:<effort>` shorthand fills in an effort the file did not spell out.
  const spec = parseModelSpec(
    readOptionalString(forAgent['model'] ?? defaults['model'], file, 'model'),
  );
  const effort =
    readOptionalEffort(forAgent['effort'] ?? defaults['effort'], file, 'effort') ??
    spec.effort;
  const models = readModelChoices(forAgent['models'] ?? defaults['models'], file);
  const promptSuffix = readPromptSuffix([forAgent, defaults], file);

  return {
    ...(spec.model == null ? {} : { model: spec.model }),
    ...(effort == null ? {} : { effort }),
    ...(models == null ? {} : { models }),
    ...(promptSuffix == null ? {} : { promptSuffix }),
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

function readOptionalEffort(
  value: unknown,
  file: string,
  key: string,
): ReasoningEffort | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new TypeError(`"${key}" must be an effort level: ${file}`);
  }
  try {
    // Levels are agent-specific, so only the shape is checked here.
    return parseReasoningEffort(value);
  } catch {
    throw new TypeError(
      `"${key}" must be an effort level such as ${KNOWN_EFFORTS.join(', ')}: ${file}`,
    );
  }
}

/**
 * Reads the picker entries. A bare string stays supported as the shorthand for
 * an entry carrying nothing but a name.
 */
function readModelChoices(
  value: unknown,
  file: string,
): readonly ModelChoice[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`"models" must contain model names or objects: ${file}`);
  }

  return value.map((entry: unknown) => readModelChoice(entry, file));
}

function readModelChoice(entry: unknown, file: string): ModelChoice {
  if (typeof entry === 'string') {
    const spec = parseModelSpec(entry);
    if (spec.model == null) {
      throw new TypeError(`"models" must contain non-empty strings: ${file}`);
    }
    return {
      name: spec.model,
      ...(spec.effort == null ? {} : { effort: spec.effort }),
    };
  }

  const choice = readObject(entry, file, 'models');
  const name = readOptionalString(choice['name'], file, 'models[].name');
  if (name == null) {
    throw new TypeError(`"models[].name" must be a non-empty string: ${file}`);
  }

  const label = readOptionalString(choice['label'], file, 'models[].label');
  const efforts = readEfforts(choice['efforts'], file);
  const effort = readOptionalEffort(choice['effort'], file, 'models[].effort');

  return {
    name,
    ...(label == null ? {} : { label }),
    ...(efforts == null ? {} : { efforts }),
    ...(effort == null ? {} : { effort }),
  };
}

function readEfforts(
  value: unknown,
  file: string,
): readonly ReasoningEffort[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`"models[].efforts" must contain effort levels: ${file}`);
  }
  return value.map((entry: unknown) => {
    const effort = readOptionalEffort(entry, file, 'models[].efforts');
    if (effort == null) {
      throw new TypeError(`"models[].efforts" must contain effort levels: ${file}`);
    }
    return effort;
  });
}
