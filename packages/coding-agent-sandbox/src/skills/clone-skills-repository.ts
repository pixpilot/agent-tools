import type { SkillsInfo } from '../types';
import fs from 'node:fs';
import path from 'node:path';
import { detail, step } from '../utils/logger';
import { runInherit } from '../utils/run-command';
import { validateSkillsDirectory } from './validate-skills-directory';

/**
 * Clones a supplied skills repository into `directory`. Never overwrites an
 * existing directory, and validates the result before it is used.
 */
export function cloneSkillsRepository(
  directory: string,
  repositoryUrl: string,
): SkillsInfo {
  const target = path.resolve(directory);

  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`Refusing to clone into a non-empty directory: ${target}`);
  }

  step(`Cloning ${repositoryUrl}`);
  detail(`into ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const status = runInherit('git', ['clone', repositoryUrl, target]);

  if (status !== 0) {
    throw new Error(`git clone failed with exit code ${status}`);
  }

  return validateSkillsDirectory(target);
}
