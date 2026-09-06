import type { SessionPlan } from '../types';
import {
  AGENT_LABEL,
  CONTAINER_GIT_DIR,
  CONTAINER_SKILLS_SRC,
  CONTAINER_WORKSPACE,
  REPO_LABEL,
  SANDBOX_LABEL,
  WORKTREE_LABEL,
} from '../constants';
import { pathKey, toMountSource } from '../utils/normalize-path';

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
    '--label',
    `${SANDBOX_LABEL}=1`,
    '--label',
    `${AGENT_LABEL}=${plan.agentId}`,
    '--label',
    `${WORKTREE_LABEL}=${pathKey(plan.worktreePath)}`,
    '--label',
    `${REPO_LABEL}=${pathKey(plan.repositoryRoot)}`,
    '--workdir',
    CONTAINER_WORKSPACE,
  ];

  // Only the dedicated worktree is writable. The main checkout is never mounted.
  if (plan.offline) {
    args.push('--network', 'none', '--pull', 'never');
  }
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
