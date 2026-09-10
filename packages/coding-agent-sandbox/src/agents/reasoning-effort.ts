/**
 * How much reasoning the model should spend before answering.
 *
 * Every agent CLI names its own levels and adds to them between releases -
 * Claude Code lists five, Copilot four, Codex six - so this stays a plain token
 * handed to the agent, exactly like the model name, instead of a closed set
 * this package owns and has to chase.
 */
export type ReasoningEffort = string;

/**
 * The levels the `<model>:<effort>` shorthand recognizes. `--effort` and
 * `agents.jsonc` accept any level the agent supports; this list only decides
 * when a suffix is an effort rather than part of the model name.
 */
export const KNOWN_EFFORTS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;

/** Rejects whitespace and quoting, so a level is always one safe shell token. */
const EFFORT_PATTERN = /^[a-z][a-z0-9-]*$/u;

/** Parses an `--effort` value, normalizing case and rejecting non-tokens. */
export function parseReasoningEffort(value: string): ReasoningEffort {
  const effort = value.trim().toLowerCase();

  if (!EFFORT_PATTERN.test(effort)) {
    throw new Error(
      `Invalid --effort level ${JSON.stringify(value)}. Expected a name such as ${KNOWN_EFFORTS.join(', ')}.`,
    );
  }

  return effort;
}

/** True for a level the `<model>:<effort>` shorthand splits on. */
export function isKnownEffort(value: string): boolean {
  return (KNOWN_EFFORTS as readonly string[]).includes(value);
}
