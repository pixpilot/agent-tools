import process from 'node:process';
import { select } from '@inquirer/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureWorktreeSourceIsClean } from '../../src/session/ensure-worktree-source-is-clean';
import { plain, warn } from '../../src/utils/logger';
import { runOrThrow } from '../../src/utils/run-command';

vi.mock('node:process', () => ({ default: { stdin: { isTTY: true } } }));
vi.mock('@inquirer/prompts', () => ({ select: vi.fn() }));
vi.mock('../../src/utils/logger', () => ({ plain: vi.fn(), warn: vi.fn() }));
vi.mock('../../src/utils/run-command', () => ({ runOrThrow: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runOrThrow).mockReturnValue('');
  vi.mocked(select).mockResolvedValue('bypass');
});

describe('ensureWorktreeSourceIsClean', () => {
  it('should allow a clean main checkout without prompting', async () => {
    await ensureWorktreeSourceIsClean('/repository');

    expect(select).not.toHaveBeenCalled();
    expect(runOrThrow).toHaveBeenCalledWith('git', [
      '-C',
      '/repository',
      'status',
      '--short',
      '--untracked-files=all',
    ]);
  });

  it('should check again by default when the main checkout has local changes', async () => {
    vi.mocked(runOrThrow)
      .mockReturnValueOnce('M  staged.ts\n M unstaged.ts\n?? new.ts')
      .mockReturnValueOnce('');
    vi.mocked(select).mockResolvedValueOnce('check-again');

    await expect(ensureWorktreeSourceIsClean('/repository')).resolves.toBeUndefined();

    expect(plain).toHaveBeenCalledWith(expect.stringContaining('M  staged.ts'));
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        default: 'check-again',
        choices: expect.arrayContaining([expect.objectContaining({ value: 'bypass' })]),
      }),
    );
    expect(runOrThrow).toHaveBeenCalledTimes(2);
  });

  it('should continue only after the explicit bypass selection', async () => {
    vi.mocked(runOrThrow).mockReturnValue(' M local.ts');
    vi.mocked(select).mockResolvedValue('bypass');

    await expect(ensureWorktreeSourceIsClean('/repository')).resolves.toBeUndefined();
  });

  it('should fail closed without a terminal or when --yes is used', async () => {
    vi.mocked(runOrThrow).mockReturnValue(' M local.ts');
    vi.mocked(process.stdin).isTTY = false;

    await expect(ensureWorktreeSourceIsClean('/repository')).rejects.toThrow(/Refusing/u);
    await expect(
      ensureWorktreeSourceIsClean('/repository', { nonInteractive: true }),
    ).rejects.toThrow(/Refusing/u);
    expect(select).not.toHaveBeenCalled();
  });

  it('should point at --allow-dirty when it fails closed', async () => {
    vi.mocked(runOrThrow).mockReturnValue(' M local.ts');

    await expect(
      ensureWorktreeSourceIsClean('/repository', { nonInteractive: true }),
    ).rejects.toThrow(/--allow-dirty/u);
  });

  it('should continue from committed HEAD when --allow-dirty is passed', async () => {
    vi.mocked(runOrThrow).mockReturnValue(' M local.ts');

    await expect(
      ensureWorktreeSourceIsClean('/repository', {
        nonInteractive: true,
        allowDirty: true,
      }),
    ).resolves.toBeUndefined();

    expect(plain).toHaveBeenCalledWith(expect.stringContaining(' M local.ts'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--allow-dirty'));
    expect(select).not.toHaveBeenCalled();
  });

  it('should not bypass the check for a clean checkout', async () => {
    vi.mocked(runOrThrow).mockReturnValue('');

    await ensureWorktreeSourceIsClean('/repository', { allowDirty: true });

    expect(warn).not.toHaveBeenCalled();
    expect(plain).not.toHaveBeenCalled();
  });
});
