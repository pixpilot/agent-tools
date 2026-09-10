import process from 'node:process';
import { select } from '@inquirer/prompts';
import { plain, warn } from '../utils/logger';
import { runOrThrow } from '../utils/run-command';

/**
 * Waits until local checkout changes are committed, stashed, or explicitly bypassed.
 *
 * The bypass is deliberately explicit: interactively it is a menu choice, and
 * non-interactively it is `--allow-dirty`. Without one of the two the session
 * fails rather than silently starting the agent on a stale HEAD.
 */
export async function ensureWorktreeSourceIsClean(
  repositoryRoot: string,
  options: {
    nonInteractive?: boolean | undefined;
    /** Caller already accepted that the worktree is created from committed HEAD. */
    allowDirty?: boolean | undefined;
  } = {},
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

  if (options.allowDirty) {
    warn('Continuing from committed HEAD only, as requested with --allow-dirty.');

    return;
  }

  if (options.nonInteractive || process.stdin.isTTY !== true) {
    throw new Error(
      'Refusing to create a worktree with local changes. Commit or stash them, rerun interactively to choose, or pass --allow-dirty to continue from committed HEAD.',
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
