import type { AgentAdapter } from '../agents/agent-adapter';
import type { EnvironmentAdapter } from '../environments/environment-adapter';
import type { VolumeMount } from '../types';
import {
  CONTAINER_HOME,
  CONTAINER_STATE_ROOT,
  HOME_CACHE_VOLUME,
  NPM_GLOBAL_VOLUME,
  PACKAGE_CACHE_VOLUME,
} from '../constants';
import { pathKey } from '../utils/normalize-path';
import { shortHash } from '../utils/short-hash';

const TARGET_KEY_LENGTH = 6;

/**
 * Named volumes for the session: the agent's persistent OAuth state, shared
 * tool/package caches, and per-worktree dependency directories that must not
 * live in the host worktree.
 */
export function buildSessionVolumes(
  agent: AgentAdapter,
  environment: EnvironmentAdapter | undefined,
  worktreePath: string,
): VolumeMount[] {
  const volumes: VolumeMount[] = [
    { name: agent.authVolume, target: CONTAINER_STATE_ROOT },
    { name: NPM_GLOBAL_VOLUME, target: `${CONTAINER_HOME}/.npm-global` },
    { name: HOME_CACHE_VOLUME, target: `${CONTAINER_HOME}/.cache` },
    { name: PACKAGE_CACHE_VOLUME, target: '/cache' },
  ];

  const key = shortHash(pathKey(worktreePath));

  for (const target of environment?.volumePaths ?? []) {
    volumes.push({
      name: `coding-agent-sandbox-deps-${key}-${shortHash(target, TARGET_KEY_LENGTH)}`,
      target,
    });
  }

  return volumes;
}
