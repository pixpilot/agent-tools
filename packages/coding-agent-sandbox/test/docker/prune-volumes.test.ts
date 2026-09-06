import { confirm } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRUNABLE_VOLUME_LABEL, SANDBOX_LABEL } from '../../src/constants';
import { pruneVolumes } from '../../src/docker/prune-volumes';
import { runOrThrow } from '../../src/utils/run-command';

vi.mock('../../src/docker/ensure-docker', () => ({ ensureDocker: vi.fn() }));
vi.mock('node:process', () => ({ default: { stdin: { isTTY: true } } }));
vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn() }));
vi.mock('../../src/utils/logger', () => ({ plain: vi.fn() }));
vi.mock('../../src/utils/run-command', () => ({ runOrThrow: vi.fn() }));

const dependency = 'coding-agent-sandbox-deps-0123456789-abcdef';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runOrThrow).mockReturnValue(dependency);
});

describe('pruneVolumes', () => {
  it('should delete nothing when confirmation is declined', async () => {
    vi.mocked(confirm).mockResolvedValue(false);
    await pruneVolumes();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ default: false }));
    expect(runOrThrow).toHaveBeenCalledTimes(1);
  });
  it('should only list labeled and unreferenced volumes in dry runs', async () => {
    await pruneVolumes({ dryRun: true });
    expect(runOrThrow).toHaveBeenCalledExactlyOnceWith('docker', [
      'volume',
      'ls',
      '--quiet',
      '--filter',
      'dangling=true',
      '--filter',
      `label=${SANDBOX_LABEL}=1`,
      '--filter',
      `label=${PRUNABLE_VOLUME_LABEL}=1`,
    ]);
  });

  it('should preserve auth, installed CLIs and unrelated names even if mislabeled', async () => {
    vi.mocked(runOrThrow).mockReturnValue(
      'coding-agent-sandbox-auth-claude\ncoding-agent-sandbox-npm-global\ncoding-agent-sandbox-package-cache\nother\ncoding-agent-sandbox-deps-invalid',
    );
    await pruneVolumes({ yes: true });
    expect(runOrThrow).toHaveBeenCalledTimes(1);
  });

  it('should recheck unused volumes after confirmation and remove without force', async () => {
    await pruneVolumes({ yes: true });
    expect(runOrThrow).toHaveBeenLastCalledWith('docker', ['volume', 'rm', dependency]);
    expect(runOrThrow).toHaveBeenCalledTimes(3);
  });

  it('should preserve a volume that becomes referenced after the preview', async () => {
    vi.mocked(runOrThrow).mockReturnValueOnce(dependency).mockReturnValueOnce('');
    await pruneVolumes({ yes: true });
    expect(runOrThrow).toHaveBeenCalledTimes(2);
  });

  it('should fail closed when discovery fails', async () => {
    vi.mocked(runOrThrow).mockImplementation(() => {
      throw new Error('Docker failed');
    });
    await expect(pruneVolumes({ yes: true })).rejects.toThrow('Docker failed');
    expect(runOrThrow).toHaveBeenCalledTimes(1);
  });
});
