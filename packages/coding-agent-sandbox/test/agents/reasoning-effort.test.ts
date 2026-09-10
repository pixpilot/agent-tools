import { describe, expect, it } from 'vitest';
import {
  parseReasoningEffort,
  REASONING_EFFORTS,
} from '../../src/agents/reasoning-effort';

describe('parseReasoningEffort', () => {
  it('should accept every known level, in any case', () => {
    for (const effort of REASONING_EFFORTS) {
      expect(parseReasoningEffort(` ${effort.toUpperCase()} `)).toBe(effort);
    }
  });

  it('should list the known levels when the value is unknown', () => {
    expect(() => parseReasoningEffort('turbo')).toThrow(
      /minimal, low, medium, high, xhigh/u,
    );
  });
});
