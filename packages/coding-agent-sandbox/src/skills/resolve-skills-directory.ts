import type { SkillsInfo } from '../types';
import fs from 'node:fs';
import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import { DEFAULT_SKILLS_DIR } from '../constants';
import { detail, plain, warn } from '../utils/logger';
import { cloneSkillsRepository } from './clone-skills-repository';
import { validateSkillsDirectory } from './validate-skills-directory';

export interface ResolveSkillsOptions {
  /** Explicit directory from `--skills-dir` or a Scaffoldfy prompt. */
  requested?: string | undefined;
  /** Repository cloned by the "clone the default" choice. */
  repositoryUrl?: string | undefined;
  /** Fail instead of prompting (non-interactive runs). */
  nonInteractive?: boolean | undefined;
}

/**
 * Resolves the canonical skills directory for a session, falling back to the
 * documented prompt (another directory / clone the default / cancel) when the
 * default location is missing. Fails closed - it never silently continues.
 */
export async function resolveSkillsDirectory(
  options: ResolveSkillsOptions = {},
): Promise<SkillsInfo> {
  const requested = options.requested?.trim();
  const candidate =
    requested != null && requested !== '' ? requested : DEFAULT_SKILLS_DIR;

  if (fs.existsSync(path.resolve(candidate))) {
    return validateSkillsDirectory(candidate);
  }

  if (options.nonInteractive === true) {
    throw new Error(
      `Canonical skills directory not found: ${path.resolve(candidate)}. ` +
        `Pass --skills-dir with an existing directory.`,
    );
  }

  warn(`Canonical skills directory not found:`);
  detail(path.resolve(candidate));
  plain();

  return promptForSkills(candidate, options.repositoryUrl?.trim());
}

/** Prompts for a user-supplied skills directory or repository. */
async function promptForSkills(
  missingPath: string,
  repositoryUrl: string | undefined,
): Promise<SkillsInfo> {
  const choices = [
    { name: 'Use another skills directory', value: 'other' },
    ...(repositoryUrl != null && repositoryUrl !== ''
      ? [{ name: 'Clone the requested skills repository', value: 'clone' }]
      : []),
    { name: 'Cancel', value: 'cancel' },
  ];
  const choice = await select({
    message: 'How would you like to continue?',
    choices,
  });

  if (choice === 'cancel') {
    throw new Error('Cancelled - no container was created.');
  }

  if (choice === 'clone' && repositoryUrl != null && repositoryUrl !== '') {
    return cloneSkillsRepository(missingPath, repositoryUrl);
  }

  const directory = await input({
    message: 'Path to your centralized skills/prompts repository',
    required: true,
  });

  try {
    return validateSkillsDirectory(directory);
  } catch (cause) {
    warn(cause instanceof Error ? cause.message : String(cause));
    plain();
    return promptForSkills(missingPath, repositoryUrl);
  }
}
