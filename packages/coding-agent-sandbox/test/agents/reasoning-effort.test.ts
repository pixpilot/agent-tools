import { describe, expect, it } from 'vitest';
import { KNOWN_EFFORTS, parseReasoningEffort } from '../../src/agents/reasoning-effort';

describe('parseReasoningEffort', () => {
  it('should accept every shorthand level, in any case', () => {
    for (const effort of KNOWN_EFFORTS) {
      expect(parseReasoningEffort(` ${effort.toUpperCase()} `)).toBe(effort);
    }
  });

  it('should accept a level this package has never heard of', () => {
    // Agent CLIs add levels between releases; only the shape is ours to police.
    expect(parseReasoningEffort('hyper-2')).toBe('hyper-2');
  });

  it('should reject anything that is not one shell-safe token', () => {
    for (const value of ['', '  ', 'very high', "high'; rm -rf /", '-high', '2x']) {
      expect(() => parseReasoningEffort(value)).toThrow(/Invalid --effort level/u);
    }
  });
});
