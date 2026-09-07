import { AGENT_LABEL, REPO_LABEL, SANDBOX_LABEL, WORKTREE_LABEL } from '../constants';
import { pathKey } from '../utils/normalize-path';

/** The session identity every Docker object this CLI creates is labelled with. */
export interface SandboxLabelSource {
  agentId: string;
  worktreePath: string;
  repositoryRoot: string;
}

/**
 * `--label` arguments marking a Docker object as owned by this session. Shared
 * by the container, its networks and its proxy so one cleanup rule finds them all.
 */
export function buildSandboxLabels(source: SandboxLabelSource): string[] {
  return [
    '--label',
    `${SANDBOX_LABEL}=1`,
    '--label',
    `${AGENT_LABEL}=${source.agentId}`,
    '--label',
    `${WORKTREE_LABEL}=${pathKey(source.worktreePath)}`,
    '--label',
    `${REPO_LABEL}=${pathKey(source.repositoryRoot)}`,
  ];
}
