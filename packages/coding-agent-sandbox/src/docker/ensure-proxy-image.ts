import path from 'node:path';
import { PROXY_DOCKERFILE } from '../constants';
import { detail, step } from '../utils/logger';
import { runCapture, runInherit } from '../utils/run-command';
import { resolveDockerContext } from './resolve-docker-context';
import { resolveProxyImageTag } from './resolve-image-tag';

/**
 * Builds the per-session egress proxy image on first use, then reuses it.
 * Separate from the agent image so a proxy change is a cheap rebuild.
 */
export function ensureProxyImage(options: { rebuild?: boolean | undefined } = {}): string {
  const context = resolveDockerContext();
  const tag = resolveProxyImageTag(context);

  if (options.rebuild !== true && runCapture('docker', ['image', 'inspect', tag]).status === 0) {
    return tag;
  }

  step(`Building the session egress proxy image ${tag}`);
  detail(`context: ${context}`);
  const status = runInherit('docker', [
    'build',
    '-f',
    path.join(context, PROXY_DOCKERFILE),
    '-t',
    tag,
    context,
  ]);

  if (status !== 0) {
    throw new Error(`docker build failed for the proxy image with exit code ${status}`);
  }

  return tag;
}
