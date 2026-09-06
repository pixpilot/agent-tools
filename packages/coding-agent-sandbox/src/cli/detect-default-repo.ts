import process from 'node:process';
import { runCapture } from '../utils/run-command';

/**
 * Repository the CLI defaults to: the Git root containing the current working
 * directory, falling back to the working directory itself.
 */
export function detectDefaultRepo(cwd: string = process.cwd()): string {
  const result = runCapture('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  return result.status === 0 && result.stdout !== '' ? result.stdout : cwd;
}
