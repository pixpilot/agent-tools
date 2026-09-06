import type { SkillsInfo } from '../types';
import fs from 'node:fs';
import path from 'node:path';

const SYNC_ENTRY_FILES = ['sync.js', 'sync.mjs', 'sync.cjs', 'sync.ts'];
const STRUCTURE_MARKERS = ['skills', 'prompts', 'rules'];

/**
 * Confirms a directory really is a centralized skills/prompts repository and
 * identifies the sync utility it already ships. Throws with the exact reason.
 */
export function validateSkillsDirectory(directory: string): SkillsInfo {
  const resolved = path.resolve(directory);

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Skills directory does not exist: ${resolved}`);
  }

  const hasStructure = STRUCTURE_MARKERS.some((marker) =>
    fs.existsSync(path.join(resolved, marker)),
  );

  if (!hasStructure) {
    throw new Error(
      `${resolved} does not look like a skills repository ` +
        `(expected one of: ${STRUCTURE_MARKERS.join(', ')}).`,
    );
  }

  const syncCommand = findSyncCommand(resolved);

  if (syncCommand == null) {
    throw new Error(
      `No sync utility found in ${resolved} ` +
        `(expected a "sync" npm script or one of: ${SYNC_ENTRY_FILES.join(', ')}).`,
    );
  }

  return { path: resolved, syncCommand };
}

/** Prefers the repository's own npm `sync` script, then a root sync entry file. */
function findSyncCommand(directory: string): string | undefined {
  const packageJsonPath = path.join(directory, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, string>;
    };

    if (parsed.scripts?.['sync'] != null) {
      return 'npm run sync';
    }
  }

  const entry = SYNC_ENTRY_FILES.find((file) =>
    fs.existsSync(path.join(directory, file)),
  );
  return entry == null ? undefined : `node ${entry}`;
}
