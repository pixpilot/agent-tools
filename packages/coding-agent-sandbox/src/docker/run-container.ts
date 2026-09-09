import type { SessionPlan } from '../types';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTerminalHandoff } from '../utils/temp-directories';
import { buildRunArgs } from './build-run-args';
import { removeContainer } from './remove-container';

const INTERRUPT_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const SIGNAL_EXIT_CODES: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};

/**
 * Runs the session container in the foreground with the real terminal, so the
 * agent gets working input, colors, Ctrl+C and resizing. Resolves with the
 * container's exit code once it stops.
 */
export async function runContainer(plan: SessionPlan): Promise<number> {
  const child = spawn('docker', buildRunArgs(plan), {
    stdio: 'inherit',
    windowsHide: true,
  });

  // The agent now owns the terminal, so process-wide handlers must not exit on
  // its behalf; this run tears itself down and lets the normal exit path clean up.
  setTerminalHandoff(true);
  let interrupted: NodeJS.Signals | undefined;
  // Interactive Ctrl+C belongs to the agent. Other signals must stop Docker
  // and reach the cleanup below, including when only the parent was signalled.
  const handlers = INTERRUPT_SIGNALS.map((signal): [NodeJS.Signals, () => void] => {
    const handler = (): void => {
      if (signal === 'SIGINT' && plan.tty) {
        return;
      }
      interrupted = signal;
      removeContainer(plan.containerName);
      child.kill(signal);
    };
    process.on(signal, handler);
    return [signal, handler];
  });

  try {
    return await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => {
        const termination = interrupted ?? signal;
        resolve(
          termination == null ? (code ?? 1) : (SIGNAL_EXIT_CODES[termination] ?? 1),
        );
      });
    });
  } finally {
    setTerminalHandoff(false);
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
    // `--rm` normally handles this; the guarded removal covers crashes.
    removeContainer(plan.containerName);
  }
}
