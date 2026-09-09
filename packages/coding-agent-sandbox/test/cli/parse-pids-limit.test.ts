import { describe, expect, it } from 'vitest';
import { parsePidsLimit } from '../../src/cli/parse-pids-limit';

describe('parsePidsLimit', () => {
  it('should accept a limit at or above the runtime floor', () => {
    expect(parsePidsLimit('512')).toBe('512');
    expect(parsePidsLimit(' 8192 ')).toBe('8192');
  });

  it('should accept -1 as unlimited', () => {
    expect(parsePidsLimit('-1')).toBe('-1');
  });

  it('should reject limits that cannot fit an idle agent runtime', () => {
    expect(() => parsePidsLimit('256')).toThrow(/at least 512/u);
    expect(() => parsePidsLimit('0')).toThrow(/at least 512/u);
  });

  it('should reject values that are not integers', () => {
    expect(() => parsePidsLimit('4k')).toThrow(/integer PID limit/u);
    expect(() => parsePidsLimit('')).toThrow(/integer PID limit/u);
  });
});
