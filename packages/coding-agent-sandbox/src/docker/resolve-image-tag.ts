import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_REPOSITORY, PROXY_IMAGE_REPOSITORY } from '../constants';
import { shortHash } from '../utils/short-hash';

const TAG_HASH_LENGTH = 12;

/** Build-context files that belong to the proxy image rather than the agent image. */
const PROXY_CONTEXT_FILES = new Set(['Dockerfile.proxy', 'proxy-server.mjs']);

/** Image tag derived from the agent build context, so edits trigger a rebuild. */
export function resolveImageTag(contextDirectory: string): string {
  return `${IMAGE_REPOSITORY}:${hashContext(
    contextDirectory,
    (file) => !PROXY_CONTEXT_FILES.has(file),
  )}`;
}

/**
 * Tag for the proxy image. Hashed over the proxy files alone so that editing
 * the proxy never forces a rebuild of the much heavier agent image.
 */
export function resolveProxyImageTag(contextDirectory: string): string {
  return `${PROXY_IMAGE_REPOSITORY}:${hashContext(contextDirectory, (file) =>
    PROXY_CONTEXT_FILES.has(file),
  )}`;
}

function hashContext(
  contextDirectory: string,
  include: (file: string) => boolean,
): string {
  const files = collectContextFiles(contextDirectory)
    .filter((file) => include(file.split('/')[0] as string))
    .map((file) => `${file}:${fs.readFileSync(path.join(contextDirectory, file), 'utf-8')}`)
    .join('\n');

  return shortHash(files, TAG_HASH_LENGTH);
}

/** Collects build-context files recursively so bundled tools update the image tag. */
function collectContextFiles(directory: string, prefix = ''): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = `${prefix}${entry.name}`;
      return entry.isDirectory()
        ? collectContextFiles(path.join(directory, entry.name), `${relativePath}/`)
        : [relativePath];
    })
    .sort();
}
