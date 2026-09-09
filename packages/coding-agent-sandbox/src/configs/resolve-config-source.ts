import type { AgentId, ConfigSnapshot } from '@pixpilot/agent-config-sync';
import type { ConfigSourceInfo } from '../types';
import {
  CONFIG_COMPONENTS,
  createAgentConfigSnapshot,
  inspectConfigDirectory,
  mergeConfigDirectories,
} from '@pixpilot/agent-config-sync';
import { detail } from '../utils/logger';
import {
  removeTempDirectory,
  tempDirectoryPrefix,
  trackTempDirectory,
} from '../utils/temp-directories';

export interface ResolveConfigSourceOptions {
  requested?: string | undefined;
  agent: AgentId;
}

/**
 * Resolves explicit portable config assets or makes a safe snapshot of the
 * selected agent's installed settings when no directory was supplied. A
 * directory that provides only some components is never rejected and never
 * prompts: the agent's own configuration fills the gaps, and the supplied
 * assets win wherever both exist.
 */
export function resolveConfigSource(
  options: ResolveConfigSourceOptions,
): ConfigSourceInfo {
  const requested = options.requested?.trim();
  if (requested == null || requested === '') {
    return snapshotAgentConfig(options.agent);
  }

  const source = inspectConfigDirectory(requested);
  if (source.available.length === CONFIG_COMPONENTS.length) {
    return source;
  }

  const missing = CONFIG_COMPONENTS.filter(
    (component) => !source.available.includes(component),
  );
  detail(`using ${options.agent} defaults for: ${missing.join(', ')}`);

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
