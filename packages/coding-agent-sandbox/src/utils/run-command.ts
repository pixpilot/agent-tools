/**
 * Small wrappers around `child_process` used for host-side tooling calls.
 */
import type { SpawnSyncOptions } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs a command and captures its output without touching the terminal. */
export function runCapture(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    windowsHide: true,
    ...options,
  });

  if (result.error != null) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').toString().trim(),
    stderr: (result.stderr ?? '').toString().trim(),
  };
}

/**
 * Runs a command and throws with the captured stderr when it fails. Used for
 * every Git call so failures surface the real Git message.
 */
export function runOrThrow(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): string {
  const result = runCapture(command, args, options);

  if (result.status !== 0) {
    const detail = result.stderr !== '' ? result.stderr : result.stdout;
    throw new Error(`\`${command} ${args.join(' ')}\` failed: ${detail}`);
  }

  return result.stdout;
}

/** Runs a command with the parent's stdio, returning its exit code. */
export function runInherit(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error != null) {
    throw result.error;
  }

  return result.status ?? (process.exitCode as number | undefined) ?? 1;
}
