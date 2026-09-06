import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTEXT_CANDIDATES = ['../docker', '../../docker'];

/**
 * Locates the bundled Docker build context, which sits next to `dist/` both in
 * the repository and in the published package.
 */
export function resolveDockerContext(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));

  for (const candidate of CONTEXT_CANDIDATES) {
    const directory = path.resolve(here, candidate);
    if (fs.existsSync(path.join(directory, 'Dockerfile'))) {
      return directory;
    }
  }

  throw new Error(
    'Could not locate the bundled Docker build context (docker/Dockerfile).',
  );
}
