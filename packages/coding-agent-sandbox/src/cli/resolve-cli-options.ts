import type { SandboxOptions } from '../types';
import { DEFAULT_AGENT } from '../constants';
import { detectDefaultRepo } from './detect-default-repo';

/** Raw option bag produced by Commander or by the guided setup. */
export interface RawCliOptions extends Partial<
  Omit<SandboxOptions, 'agent' | 'repo' | 'task'>
> {
  agent?: string | undefined;
  repo?: string | undefined;
  task?: string | undefined;
}

/**
 * Applies the documented defaults to a raw option bag. This never prompts: the
 * guided setup only runs for a bare invocation, so once any flag is present the
 * run is entirely flag-driven and a missing `--task` is a hard error.
 */
export function resolveCliOptions(raw: RawCliOptions): SandboxOptions {
  const task = raw.task?.trim();

  if (task == null || task === '') {
    throw new Error(
      '--task is required. Run coding-agent-sandbox with no arguments for the guided setup.',
    );
  }

  const repo = raw.repo?.trim();

  return {
    ...raw,
    agent: raw.agent ?? DEFAULT_AGENT,
    repo: repo != null && repo !== '' ? repo : detectDefaultRepo(),
    task,
    fullAccess: raw.fullAccess ?? true,
    install: raw.install ?? true,
    skills: raw.skills ?? true,
    gitMount: raw.gitMount ?? true,
    updateAgent: raw.updateAgent ?? false,
    rebuildImage: raw.rebuildImage ?? false,
    login: raw.login ?? false,
    dryRun: raw.dryRun ?? false,
    yes: raw.yes ?? false,
  };
}
