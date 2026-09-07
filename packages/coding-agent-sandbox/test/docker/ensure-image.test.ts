import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureImage } from '../../src/docker/ensure-image';
import { runCapture, runInherit } from '../../src/utils/run-command';

vi.mock('../../src/utils/run-command', () => ({
  runCapture: vi.fn(),
  runInherit: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('network none images', () => {
  it('should use an existing image without building or pulling', () => {
    vi.mocked(runCapture).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    expect(ensureImage({ image: 'local:test', network: 'none' })).toBe('local:test');
    expect(runCapture).toHaveBeenCalledExactlyOnceWith('docker', [
      'image',
      'inspect',
      'local:test',
    ]);
    expect(runInherit).not.toHaveBeenCalled();
  });
  it('should fail if the image is missing without building or pulling', () => {
    vi.mocked(runCapture).mockReturnValue({ status: 1, stdout: '', stderr: '' });
    expect(() => ensureImage({ image: 'missing:test', network: 'none' })).toThrow(
      'cached image',
    );
    expect(runInherit).not.toHaveBeenCalled();
  });
});
