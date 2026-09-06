import { runCapture } from '../utils/run-command';

/** Summarizes staged and unstaged changes without invoking external diff tools. */
export function getGitDiffStat(worktreePath: string): string {
  const args = ['-C', worktreePath, 'diff', '--no-ext-diff', '--no-textconv', '--stat'];
  return [false, true]
    .map((staged) => {
      const result = runCapture('git', staged ? [...args, '--cached'] : args);
      const text = result.status === 0 ? result.stdout : result.stderr;
      return text === '' ? '' : `${staged ? 'Staged' : 'Unstaged'} changes:\n${text}`;
    })
    .filter(Boolean)
    .join('\n');
}
