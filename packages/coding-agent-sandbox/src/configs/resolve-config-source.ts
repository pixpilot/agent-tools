import type { AgentId, ConfigSnapshot } from '@pixpilot/agent-config-sync';
import type { ConfigSourceInfo } from '../types';
import { select } from '@inquirer/prompts';
import {
  CONFIG_COMPONENTS,
  createAgentConfigSnapshot,
  inspectConfigDirectory,
  mergeConfigDirectories,
} from '@pixpilot/agent-config-sync';
import { detail, plain, warn } from '../utils/logger';
import {
  removeTempDirectory,
  tempDirectoryPrefix,
  trackTempDirectory,
} from '../utils/temp-directories';

export interface ResolveConfigSourceOptions {
  requested?: string | undefined;
  agent: AgentId;
  nonInteractive?: boolean | undefined;
}

/**
 * Resolves explicit portable config assets or makes a safe snapshot of the
 * selected agent's installed settings when no directory was supplied.
 */
export async function resolveConfigSource(
  options: ResolveConfigSourceOptions,
): Promise<ConfigSourceInfo> {
  const requested = options.requested?.trim();
  if (requested == null || requested === '') {
    return snapshotAgentConfig(options.agent);
  }

  const source = inspectConfigDirectory(requested);
  if (
    source.available.length === CONFIG_COMPONENTS.length ||
    options.nonInteractive === true
  ) {
    return source;
  }

  warn('The supplied configuration directory is incomplete:');
  detail(source.path);
  plain(`Available: ${source.available.join(', ') || 'none'}`);
  plain();

  const choice = await select({
    message: 'How would you like to continue?',
    choices: [
      { name: 'Copy missing configs from this agent’s defaults', value: 'defaults' },
      { name: 'Use only the available configs in this directory', value: 'available' },
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (choice === 'cancel') throw new Error('Cancelled - no container was created.');
  if (choice === 'available') return source;

  const snapshot = snapshotAgentConfig(options.agent);
  mergeConfigDirectories(source.path, snapshot.path);
  return { ...inspectConfigDirectory(snapshot.path), cleanup: snapshot.cleanup };
}

/**
 * Names the snapshot after this CLI and hands its removal to the session
 * cleanup, so an interrupted run never leaves it behind.
 */
function snapshotAgentConfig(agent: AgentId): ConfigSnapshot {
  const snapshot = createAgentConfigSnapshot(agent, {
    directoryPrefix: tempDirectoryPrefix('configs'),
  });
  trackTempDirectory(snapshot.path);
  return { ...snapshot, cleanup: () => removeTempDirectory(snapshot.path) };
}
