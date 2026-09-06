import { SANDBOX_LABEL } from '../constants';
import { warn } from '../utils/logger';
import { runCapture } from '../utils/run-command';

/**
 * Force-removes a container, but only when it carries this CLI's label.
 * Never touches volumes, worktrees or branches; failures are reported, not
 * escalated, so a stuck container can never risk source code.
 */
export function removeContainer(name: string): void {
  const inspect = runCapture('docker', [
    'inspect',
    '--format',
    `{{index .Config.Labels "${SANDBOX_LABEL}"}}`,
    name,
  ]);

  if (inspect.status !== 0) {
    return;
  }

  if (inspect.stdout !== '1') {
    warn(`Container ${name} is not owned by this CLI - leaving it alone.`);
    return;
  }

  const removed = runCapture('docker', ['rm', '-f', name]);

  if (removed.status !== 0) {
    warn(`Could not remove container ${name}: ${removed.stderr}`);
    warn('Your worktree and branch are untouched. Remove the container manually.');
  }
}
