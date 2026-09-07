import type { SessionPlan } from '../types';
import {
  CONTAINER_GIT_DIR,
  CONTAINER_SKILLS_SRC,
  CONTAINER_WORKSPACE,
} from '../constants';
import { toMountSource } from '../utils/normalize-path';
import { buildSandboxLabels } from './build-sandbox-labels';

/** Generous enough for package managers and test runners, low enough to cap a fork bomb. */
const AGENT_PIDS_LIMIT = 512;

/**
 * Builds the full `docker run` argument list for a session. Pure and
 * dependency-free so the exact mount and label set can be asserted in tests.
 */
export function buildRunArgs(plan: SessionPlan): string[] {
  const args = [
    'run',
    '--rm',
    plan.tty ? '-it' : '-i',
    '--name',
    plan.containerName,
    ...buildSandboxLabels(plan),
    '--workdir',
    CONTAINER_WORKSPACE,
  ];

  // The agent joins only the per-session internal network, which has no route
  // off itself; `none` keeps the container off every network entirely.
  if (plan.network === 'none') {
    args.push('--network', 'none', '--pull', 'never');
  } else if (plan.networkName != null) {
    args.push('--network', plan.networkName);
  }

  // Cheap defence in depth: the workload already runs as non-root `node`.
  args.push(
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit',
    String(AGENT_PIDS_LIMIT),
  );

  // Build tools and test suites are the workload, so limits stay opt-in.
  if (plan.cpus != null) {
    args.push('--cpus', plan.cpus);
  }

  if (plan.memory != null) {
    args.push('--memory', plan.memory);
  }

  // Only the dedicated worktree is writable. The main checkout is never mounted.
  args.push('-v', `${toMountSource(plan.worktreePath)}:${CONTAINER_WORKSPACE}`);

  if (plan.mountGit) {
    args.push('-v', `${toMountSource(plan.gitDirPath)}:${CONTAINER_GIT_DIR}`);
  }

  if (plan.env['SANDBOX_SKILLS_ENABLED'] !== '0') {
    args.push('-v', `${toMountSource(plan.skillsPath)}:${CONTAINER_SKILLS_SRC}:ro`);
  }

  for (const volume of plan.volumes) {
    args.push('-v', `${volume.name}:${volume.target}`);
  }

  for (const [key, value] of Object.entries(plan.env)) {
    args.push('-e', `${key}=${value}`);
  }

  args.push(plan.image);
  return args;
}
