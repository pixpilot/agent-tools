import process from 'node:process';
import { select } from '@inquirer/prompts';
import { plain } from '../utils/logger';
import { runOrThrow } from '../utils/run-command';

/**
 * Waits until local checkout changes are committed, stashed, or explicitly bypassed.
 */
export async function ensureWorktreeSourceIsClean(
  repositoryRoot: string,
  options: { nonInteractive?: boolean | undefined } = {},
): Promise<void> {
  const changes = runOrThrow('git', [
    '-C',
    repositoryRoot,
    'status',
    '--short',
    '--untracked-files=all',
  ]);

  if (changes === '') {
    return;
  }

  plain(
    `Local changes in the main checkout will not be included in the new worktree:\n${changes}`,
  );

  if (options.nonInteractive || process.stdin.isTTY !== true) {
    throw new Error(
      'Refusing to create a worktree with local changes. Commit or stash them, then rerun interactively to explicitly continue from committed HEAD.',
    );
  }

  const choice = await select({
    message: 'Commit or stash your changes, then press Enter to check again.',
    choices: [
      {
        name: 'Check again after committing or stashing',
        value: 'check-again',
      },
      {
        name: 'Bypass — create from committed HEAD only',
        value: 'bypass',
      },
    ],
    default: 'check-again',
  });

  if (choice === 'check-again') {
    await ensureWorktreeSourceIsClean(repositoryRoot, options);
  }
}
