import { WORKTREE_LABEL } from '../constants';
import { pathKey } from '../utils/normalize-path';
import { runCapture } from '../utils/run-command';

export interface SandboxContainer {
  id: string;
  name: string;
  agent: string;
}

/**
 * Running sandbox containers already bound to a worktree. Used to stop two
 * agents from editing the same workspace at once.
 */
export function findWorktreeContainers(worktreePath: string): SandboxContainer[] {
  const result = runCapture('docker', [
    'ps',
    '--filter',
    `label=${WORKTREE_LABEL}=${pathKey(worktreePath)}`,
    '--format',
    '{{.ID}}\t{{.Names}}\t{{.Label "com.pixpilot.sandbox.agent"}}',
  ]);

  if (result.status !== 0 || result.stdout === '') {
    return [];
  }

  return result.stdout.split(/\r?\n/u).map((line) => {
    const [id = '', name = '', agent = ''] = line.split('\t');
    return { id, name, agent };
  });
}
