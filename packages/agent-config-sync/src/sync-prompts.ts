import type { AgentId } from './types.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncManagedFiles } from './sync-directory.ts';

/** Synchronizes prompts in the filename format understood by one agent. */
export function syncPrompts(source: string, target: string, agent: AgentId): string[] {
  const sourceFiles = fs
    .readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  if (agent === 'copilot') {
    return syncManagedFiles(source, target, sourceFiles);
  }

  const promptFiles = sourceFiles.filter((fileName) => fileName.endsWith('.prompt.md'));
  const temporarySource = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agent-config-sync-prompts-'),
  );
  try {
    const targetFiles = promptFiles.map((fileName) =>
      fileName.replace(/\.prompt\.md$/u, '.md'),
    );
    for (const [index, targetFile] of targetFiles.entries()) {
      fs.copyFileSync(
        path.join(source, promptFiles[index] as string),
        path.join(temporarySource, targetFile),
      );
    }
    return syncManagedFiles(temporarySource, target, targetFiles);
  } finally {
    fs.rmSync(temporarySource, { recursive: true, force: true });
  }
}
