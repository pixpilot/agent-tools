import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNetworkMode } from '../../src/cli/resolve-network-mode';
import { warn } from '../../src/utils/logger';

vi.mock('../../src/utils/logger', () => ({ warn: vi.fn() }));

describe('resolveNetworkMode', () => {
  beforeEach(() => {
    vi.mocked(warn).mockClear();
  });

  it('should default to strict when nothing was asked for', () => {
    expect(resolveNetworkMode({})).toBe('strict');
  });

  it.each(['strict', 'open', 'none'] as const)('should honour --network %s', (mode) => {
    expect(resolveNetworkMode({ network: mode })).toBe(mode);
  });

  it('should treat the deprecated --offline as --network none', () => {
    expect(resolveNetworkMode({ offline: true })).toBe('none');
  });

  it('should warn that --offline is deprecated', () => {
    resolveNetworkMode({ offline: true });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--network none'));
  });

  it('should accept --offline alongside the mode it is an alias for', () => {
    expect(resolveNetworkMode({ offline: true, network: 'none' })).toBe('none');
  });

  it.each(['strict', 'open'] as const)(
    'should reject --offline combined with --network %s',
    (network) => {
      expect(() => resolveNetworkMode({ offline: true, network })).toThrow(
        /--offline is an alias for --network none/u,
      );
    },
  );

  it('should not warn when --offline was not passed', () => {
    resolveNetworkMode({ network: 'open' });

    expect(warn).not.toHaveBeenCalled();
  });
});
