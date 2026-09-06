import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRUNABLE_VOLUME_LABEL } from '../../src/constants';
import { ensureSessionVolumes } from '../../src/docker/ensure-session-volumes';
import { runCapture, runOrThrow } from '../../src/utils/run-command';

vi.mock('../../src/utils/run-command', () => ({
  runCapture: vi.fn(),
  runOrThrow: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
});

describe('ensureSessionVolumes', () => {
  it('should never relabel existing volumes', () => {
    vi.mocked(runCapture).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    ensureSessionVolumes([
      { name: 'coding-agent-sandbox-cache-home', target: '/home/node/.cache' },
    ]);
    expect(runOrThrow).not.toHaveBeenCalled();
  });
  it('should only mark new dependency/cache volumes for pruning', () => {
    vi.mocked(runCapture).mockReturnValue({ status: 1, stdout: '', stderr: '' });
    for (const name of [
      'coding-agent-sandbox-cache-home',
      'coding-agent-sandbox-package-cache',
      'coding-agent-sandbox-deps-0123456789-abcdef',
      'coding-agent-sandbox-auth-codex',
      'coding-agent-sandbox-npm-global',
    ]) {
      ensureSessionVolumes([{ name, target: '/unused' }]);
      const args = vi.mocked(runOrThrow).mock.lastCall?.[1] ?? [];
      expect(args.includes(`${PRUNABLE_VOLUME_LABEL}=1`)).toBe(
        name === 'coding-agent-sandbox-cache-home' ||
          name.startsWith('coding-agent-sandbox-deps-'),
      );
    }
  });
});
