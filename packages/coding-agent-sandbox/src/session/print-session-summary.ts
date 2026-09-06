import type { WorktreeInfo } from '../types';
import { getGitDiffStat } from '../git/get-git-diff-stat';
import { getGitStatus } from '../git/get-git-status';
import { plain, step } from '../utils/logger';

/**
 * End-of-session report. Nothing is merged, reset or deleted - the branch and
 * worktree are simply handed back to the user.
 */
export function printSessionSummary(worktree: WorktreeInfo, exitCode: number): void {
  plain();
  step(`Session finished (exit code ${exitCode})`);
  plain(`  branch    ${worktree.branch}`);
  plain(`  worktree  ${worktree.path}`);
  plain();
  plain(getGitStatus(worktree.path));
  const stat = getGitDiffStat(worktree.path);
  if (stat !== '') {
    plain(stat);
  }
  plain();
  plain('Your work is preserved. Nothing was merged, reset or deleted.');
}
