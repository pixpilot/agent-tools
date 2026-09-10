/**
 * How much reasoning the model should spend before answering.
 *
 * The names come from the agent CLIs that expose the setting at all; they are
 * normalized here so one `--effort` value can be mapped onto whichever flag the
 * selected agent actually understands.
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

/** Parses an `--effort` value, rejecting anything that is not a known level. */
export function parseReasoningEffort(value: string): ReasoningEffort {
  const effort = value.trim().toLowerCase();

  if (!isReasoningEffort(effort)) {
    throw new Error(
      `Unknown --effort level ${JSON.stringify(value)}. Expected ${REASONING_EFFORTS.join(', ')}.`,
    );
  }

  return effort;
}

/** True when the value is one of the normalized effort levels. */
export function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}
