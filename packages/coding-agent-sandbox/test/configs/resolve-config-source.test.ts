import type { ConfigDirectoryInfo, ConfigSnapshot } from '@pixpilot/agent-config-sync';
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

  it('should snapshot only the selected agent when no directory was supplied', () => {
    expect(resolveConfigSource({ agent: 'codex' })).toMatchObject({
      path: '/snapshot',
    });
    expect(createAgentConfigSnapshot).toHaveBeenCalledWith('codex', {
      directoryPrefix: 'coding-agent-sandbox-configs-1234-',
    });
  });

  it('should remove the snapshot through the session cleanup registry', () => {
    const resolved = resolveConfigSource({ agent: 'codex' });
    expect(trackTempDirectory).toHaveBeenCalledWith('/snapshot');

    resolved.cleanup?.();
    expect(removeTempDirectory).toHaveBeenCalledWith('/snapshot');
  });

  it('should use a complete explicit source without snapshotting the agent', () => {
    vi.mocked(inspectConfigDirectory).mockReturnValue({
      path: '/configs',
      available: ['skills', 'prompts', 'mcp', 'rules'],
    });

    expect(resolveConfigSource({ requested: '/configs', agent: 'claude' })).toMatchObject(
      { path: '/configs' },
    );
    expect(createAgentConfigSnapshot).not.toHaveBeenCalled();
  });

  it('should fill missing components from the agent defaults without prompting', () => {
    vi.mocked(inspectConfigDirectory)
      .mockReturnValueOnce(source)
      .mockReturnValueOnce(snapshot);

    expect(resolveConfigSource({ requested: '/configs', agent: 'claude' })).toMatchObject(
      { path: '/snapshot', cleanup: expect.any(Function) },
    );
    expect(mergeConfigDirectories).toHaveBeenCalledWith('/configs', '/snapshot');
  });
});
