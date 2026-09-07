import type { NetworkMode } from '../network/network-mode';
import { detail, step } from '../utils/logger';
import { runCapture, runInherit } from '../utils/run-command';
import { resolveDockerContext } from './resolve-docker-context';
import { resolveImageTag } from './resolve-image-tag';

/**
 * Builds the single shared development image on first use, then reuses it.
 * Returns the tag the session should run.
 */
export function ensureImage(
  options: {
    image?: string | undefined;
    rebuild?: boolean | undefined;
    network?: NetworkMode | undefined;
  } = {},
): string {
  if (options.network === 'none') {
    const tag =
      options.image != null && options.image !== ''
        ? options.image
        : resolveImageTag(resolveDockerContext());
    if (runCapture('docker', ['image', 'inspect', tag]).status !== 0) {
      throw new Error(
        '--network none requires a cached image. Run with a network first, or select a local --image.',
      );
    }
    return tag;
  }
  if (options.image != null && options.image !== '') {
    return options.image;
  }

  const context = resolveDockerContext();
  const tag = resolveImageTag(context);
  const exists = runCapture('docker', ['image', 'inspect', tag]).status === 0;

  if (exists && options.rebuild !== true) {
    return tag;
  }

  step(`Building the shared sandbox image ${tag}`);
  detail(`context: ${context}`);
  const status = runInherit('docker', ['build', '-t', tag, context]);

  if (status !== 0) {
    throw new Error(`docker build failed with exit code ${status}`);
  }

  return tag;
}
