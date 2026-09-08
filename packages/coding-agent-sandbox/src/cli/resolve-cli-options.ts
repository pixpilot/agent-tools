import type { SandboxOptions } from '../types';
import { DEFAULT_AGENT } from '../constants';
import { detectDefaultRepo } from './detect-default-repo';
import { resolveNetworkMode } from './resolve-network-mode';

/** Raw option bag produced by Commander or by the guided setup. */
export interface RawCliOptions extends Partial<
  Omit<SandboxOptions, 'agent' | 'repo' | 'task'>
> {
  agent?: string | undefined;
  repo?: string | undefined;
  task?: string | undefined;
  /** @deprecated Alias for `network: 'none'`. */
  offline?: boolean | undefined;
}

/**
 * Applies the documented defaults to a raw option bag. This never prompts, so
 * the task remains mandatory for non-interactive and programmatic calls.
 */
export function resolveCliOptions(raw: RawCliOptions): SandboxOptions {
  // `offline` is resolved into `network` and must not survive as a second source of truth.
  const { offline: _offline, ...rest } = raw;
  const task = raw.task?.trim();

  if (task == null || task === '') {
    throw new Error(
      '--task is required. Remove --yes to complete the guided setup interactively.',
    );
  }

  const repo = raw.repo?.trim();

  return {
    ...rest,
    agent: raw.agent ?? DEFAULT_AGENT,
    repo: repo != null && repo !== '' ? repo : detectDefaultRepo(),
    task,
    fullAccess: raw.fullAccess ?? true,
    install: raw.install ?? true,
    configs: raw.configs ?? true,
    gitMount: raw.gitMount ?? true,
    updateAgent: raw.updateAgent ?? false,
    rebuildImage: raw.rebuildImage ?? false,
    login: raw.login ?? false,
    dryRun: raw.dryRun ?? false,
    network: resolveNetworkMode(raw),
    yes: raw.yes ?? false,
  };
}
