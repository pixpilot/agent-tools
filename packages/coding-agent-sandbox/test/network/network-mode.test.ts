import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NETWORK_MODE,
  parseNetworkMode,
  usesProxy,
} from '../../src/network/network-mode';

describe('parseNetworkMode', () => {
  it.each(['strict', 'open', 'none'] as const)('should accept %s', (mode) => {
    expect(parseNetworkMode(mode)).toBe(mode);
  });

  it('should normalise case and surrounding whitespace', () => {
    expect(parseNetworkMode('  Strict ')).toBe('strict');
  });

  it.each(['offline', 'all', 'yes', ''])('should reject %s', (value) => {
    expect(() => parseNetworkMode(value)).toThrow(/Unknown --network mode/u);
  });
});

describe('default network mode', () => {
  it('should be strict, because full access is on by default', () => {
    expect(DEFAULT_NETWORK_MODE).toBe('strict');
  });
});

describe('usesProxy', () => {
  it('should route strict and open through the session proxy', () => {
    expect(usesProxy('strict')).toBe(true);
    expect(usesProxy('open')).toBe(true);
  });

  it('should not start a proxy when there is no network', () => {
    expect(usesProxy('none')).toBe(false);
  });
});
