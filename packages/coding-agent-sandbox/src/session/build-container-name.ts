import { CONTAINER_PREFIX } from '../constants';
import { pathKey } from '../utils/normalize-path';
import { shortHash } from '../utils/short-hash';

const MAX_NAME_LENGTH = 48;
const WORKTREE_KEY_LENGTH = 8;

/** Docker-safe, collision-free container name for one agent/worktree pair. */
export function buildContainerName(
  agentId: string,
  taskSlug: string,
  worktreePath: string,
): string {
  const base = `${CONTAINER_PREFIX}-${agentId}-${taskSlug}`.slice(0, MAX_NAME_LENGTH);
  return `${base}-${shortHash(pathKey(worktreePath), WORKTREE_KEY_LENGTH)}`;
}
