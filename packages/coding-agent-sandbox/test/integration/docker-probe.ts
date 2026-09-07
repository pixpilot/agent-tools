import { execFileSync } from 'node:child_process';
import process from 'node:process';

/** Small image with curl, ping and ip; only pulled for the opt-in Docker suite. */
export const PROBE_IMAGE = 'curlimages/curl:latest';

/** These tests create real Docker objects, so they never run unless asked for. */
export const DOCKER_TESTS_ENABLED = process.env['SANDBOX_DOCKER_TESTS'] === '1';

/** Runs a shell snippet in a throwaway container attached to `network`. */
export function probe(
  network: string,
  script: string,
  env: Record<string, string> = {},
): string {
  const args = ['run', '--rm', '--network', network];

  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }

  args.push('--entrypoint', 'sh', PROBE_IMAGE, '-c', script);
  return docker(args);
}

/** Runs a docker command, returning stdout and stderr whether or not it failed. */
export function docker(args: string[]): string {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    const failure = cause as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
  }
}

/** The gateway address a container on `network` routes through. */
export function gatewayOf(network: string): string {
  return docker([
    'network',
    'inspect',
    network,
    '-f',
    '{{(index .IPAM.Config 0).Gateway}}',
  ]).trim();
}
