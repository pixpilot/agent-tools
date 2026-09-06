import process from 'node:process';
import { confirm } from '@inquirer/prompts';
import { HOME_CACHE_VOLUME, PRUNABLE_VOLUME_LABEL, SANDBOX_LABEL } from '../constants';
import { plain } from '../utils/logger';
import { runOrThrow } from '../utils/run-command';
import { ensureDocker } from './ensure-docker';

/** Removes only labeled, unused dependency/cache volumes after explicit confirmation. */
export async function pruneVolumes(
  options: { dryRun?: boolean; yes?: boolean } = {},
): Promise<void> {
  ensureDocker();
  const candidates = listCandidates();
  if (candidates.length === 0) {
    plain('No unused labeled sandbox dependency/cache volumes found.');
    return;
  }
  plain(`Volumes to permanently remove:\n${candidates.join('\n')}`);
  if (options.dryRun) {
    return;
  }
  if (!options.yes) {
    if (!process.stdin.isTTY) {
      throw new Error(
        'Pruning requires confirmation. Use --dry-run to preview or --yes to confirm.',
      );
    }
    if (
      !(await confirm({
        message: 'Permanently delete these cached dependencies and data?',
        default: false,
      }))
    ) {
      return;
    }
  }
  // Recheck after the prompt. Docker also refuses removal of referenced volumes.
  const unused = new Set(listCandidates());
  for (const name of candidates) {
    if (unused.has(name)) {
      runOrThrow('docker', ['volume', 'rm', name]);
      plain(`Removed ${name}`);
    }
  }
}

function listCandidates(): string[] {
  const result = runOrThrow('docker', [
    'volume',
    'ls',
    '--quiet',
    '--filter',
    'dangling=true',
    '--filter',
    `label=${SANDBOX_LABEL}=1`,
    '--filter',
    `label=${PRUNABLE_VOLUME_LABEL}=1`,
  ]);
  return result
    .split(/\r?\n/u)
    .filter(
      (name) =>
        name === HOME_CACHE_VOLUME ||
          /^coding-agent-sandbox-deps-[a-f0-9]{10}-[a-f0-9]{6}$/u.test(name),
    );
}
