import type { ConfigDirectoryInfo, ConfigSnapshot } from '@pixpilot/agent-config-sync';
import { select } from '@inquirer/prompts';
import {
  createAgentConfigSnapshot,
  inspectConfigDirectory,
  mergeConfigDirectories,
} from '@pixpilot/agent-config-sync';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfigSource } from '../../src/configs/resolve-config-source';
import {
  removeTempDirectory,
  trackTempDirectory,
} from '../../src/utils/temp-directories';

vi.mock('@inquirer/prompts', () => ({ select: vi.fn() }));
vi.mock('../../src/utils/temp-directories', () => ({
  removeTempDirectory: vi.fn(),
  tempDirectoryPrefix: (purpose: string) => `coding-agent-sandbox-${purpose}-1234-`,
  trackTempDirectory: vi.fn(),
}));
vi.mock('@pixpilot/agent-config-sync', () => ({
  CONFIG_COMPONENTS: ['skills', 'prompts', 'mcp', 'rules'],
  createAgentConfigSnapshot: vi.fn(),
  inspectConfigDirectory: vi.fn(),
  mergeConfigDirectories: vi.fn(),
}));

const source: ConfigDirectoryInfo = { path: '/configs', available: ['skills'] };
const snapshot: ConfigSnapshot = {
  path: '/snapshot',
  available: ['skills', 'prompts', 'mcp', 'rules'],
  cleanup: vi.fn(),
};

describe('resolveConfigSource', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(inspectConfigDirectory).mockReturnValue(source);
    vi.mocked(createAgentConfigSnapshot).mockReturnValue(snapshot);
  });

  it('should snapshot only the selected agent when no directory was supplied', async () => {
    await expect(resolveConfigSource({ agent: 'codex' })).resolves.toMatchObject({
      path: '/snapshot',
    });
    expect(createAgentConfigSnapshot).toHaveBeenCalledWith('codex', {
      directoryPrefix: 'coding-agent-sandbox-configs-1234-',
    });
  });

  it('should remove the snapshot through the session cleanup registry', async () => {
    const resolved = await resolveConfigSource({ agent: 'codex' });
    expect(trackTempDirectory).toHaveBeenCalledWith('/snapshot');

    resolved.cleanup?.();
    expect(removeTempDirectory).toHaveBeenCalledWith('/snapshot');
  });

  it('should use an incomplete explicit source unchanged in non-interactive mode', async () => {
    await expect(
      resolveConfigSource({
        requested: '/configs',
        agent: 'claude',
        nonInteractive: true,
      }),
    ).resolves.toBe(source);
    expect(select).not.toHaveBeenCalled();
  });

  it('should overlay explicit assets onto a default snapshot when selected', async () => {
    vi.mocked(select).mockResolvedValue('defaults');
    vi.mocked(inspectConfigDirectory)
      .mockReturnValueOnce(source)
      .mockReturnValueOnce(snapshot);

    await expect(
      resolveConfigSource({ requested: '/configs', agent: 'claude' }),
    ).resolves.toMatchObject({ path: '/snapshot', cleanup: expect.any(Function) });
    expect(mergeConfigDirectories).toHaveBeenCalledWith('/configs', '/snapshot');
  });

  it('should cancel before creating a snapshot when requested', async () => {
    vi.mocked(select).mockResolvedValue('cancel');
    await expect(
      resolveConfigSource({ requested: '/configs', agent: 'claude' }),
    ).rejects.toThrow('Cancelled');
    expect(createAgentConfigSnapshot).not.toHaveBeenCalled();
  });
});
