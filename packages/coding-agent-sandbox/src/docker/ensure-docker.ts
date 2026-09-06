import { runCapture } from '../utils/run-command';

/** Fails fast with an actionable message when Docker is unusable. */
export function ensureDocker(): void {
  let result;

  try {
    result = runCapture('docker', ['version', '--format', '{{.Server.Version}}']);
  } catch {
    throw new Error('Docker CLI not found on PATH. Install Docker Desktop and retry.');
  }

  if (result.status !== 0) {
    throw new Error(
      `Docker is installed but not responding. Start Docker Desktop and retry.\n${result.stderr}`,
    );
  }
}
