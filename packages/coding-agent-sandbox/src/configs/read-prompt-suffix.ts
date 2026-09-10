import fs from 'node:fs';
import path from 'node:path';
import { readOptionalString } from './read-optional-string';

/** Key naming a file that holds the shared instructions. */
const FILE_KEY = 'promptFile';
/** Key holding the shared instructions inline, for short ones. */
const INLINE_KEY = 'prompt';

/** Shared instructions appended to a non-empty initial prompt. */
export interface PromptSuffix {
  /** Instruction text, trimmed. */
  text: string;
  /** Where the text came from, as written in the settings file. */
  source: string;
}

/**
 * Resolves the shared instructions for one agent from its settings entries,
 * most specific first. The first entry naming either key wins as a whole, so an
 * agent's own instructions are never mixed with those from `$defaults`; within
 * one entry `promptFile` wins over an inline `prompt`.
 */
export function readPromptSuffix(
  entries: readonly Record<string, unknown>[],
  file: string,
): PromptSuffix | undefined {
  const entry = entries.find(
    (candidate) =>
      candidate[FILE_KEY] !== undefined || candidate[INLINE_KEY] !== undefined,
  );
  if (entry == null) {
    return undefined;
  }

  const reference = readOptionalString(entry[FILE_KEY], file, FILE_KEY);
  if (reference != null) {
    return readPromptFile(reference, file);
  }

  const text = readOptionalString(entry[INLINE_KEY], file, INLINE_KEY);
  return text == null ? undefined : { text, source: path.basename(file) };
}

/**
 * Reads the instructions file, resolved against the settings file's directory.
 * A named file that cannot be read is an error: instructions silently dropped
 * would leave the agent working without rules the user believes are in force.
 */
function readPromptFile(reference: string, file: string): PromptSuffix {
  const resolved = path.resolve(path.dirname(file), reference);

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`"${FILE_KEY}" is not a file: ${resolved}, named in ${file}`);
  }

  const text = fs.readFileSync(resolved, 'utf8').trim();
  if (text === '') {
    throw new Error(`"${FILE_KEY}" is empty: ${resolved}, named in ${file}`);
  }

  return { text, source: reference };
}
