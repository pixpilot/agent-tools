import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGitDiffStat } from '../../src/git/get-git-diff-stat';
import { runCapture } from '../../src/utils/run-command';

vi.mock('../../src/utils/run-command', () => ({ runCapture: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
});

describe('getGitDiffStat', () => {
  it('should report both staged and unstaged changes without external diff execution', () => {
    vi.mocked(runCapture)
      .mockReturnValueOnce({ status: 0, stdout: 'file-a | 1 +', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'file-b | 1 -', stderr: '' });
    expect(getGitDiffStat('/worktree')).toBe(
      'Unstaged changes:\nfile-a | 1 +\nStaged changes:\nfile-b | 1 -',
    );
    expect(runCapture).toHaveBeenLastCalledWith('git', [
      '-C',
      '/worktree',
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--stat',
      '--cached',
    ]);
  });
  it('should omit empty diff sections', () => {
    vi.mocked(runCapture).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    expect(getGitDiffStat('/worktree')).toBe('');
  });
  it('should surface Git failures', () => {
    vi.mocked(runCapture).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'Git failed',
    });
    expect(getGitDiffStat('/worktree')).toContain('Git failed');
  });
});
