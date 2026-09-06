import { describe, expect, it } from 'vitest';
import { parseBoolean } from '../../src/cli/parse-boolean';

describe('parseBoolean', () => {
  it.each(['true', 'TRUE', '1', 'yes', 'y', 'on', ' true '])(
    'should read %s as true',
    (value) => {
      expect(parseBoolean(value)).toBe(true);
    },
  );

  it.each(['false', 'FALSE', '0', 'no', 'n', 'off'])(
    'should read %s as false',
    (value) => {
      expect(parseBoolean(value)).toBe(false);
    },
  );

  it('should reject values that are not booleans', () => {
    expect(() => parseBoolean('maybe')).toThrow(/Expected a boolean value/u);
  });
});
