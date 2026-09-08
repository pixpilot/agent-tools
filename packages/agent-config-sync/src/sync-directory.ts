import fs from 'node:fs';
import path from 'node:path';

const JSON_INDENT_SPACES = 2;
const MANIFEST_NAME = '.agent-config-sync.json';

/** Mirrors top-level entries while deleting only entries this synchronizer owns. */
export function syncManagedDirectory(source: string, target: string): string[] {
  const sourceEntries = fs.readdirSync(source, { withFileTypes: true }).map((entry) => entry.name);
  fs.mkdirSync(target, { recursive: true });

  for (const entry of readManagedEntries(target)) {
    if (!sourceEntries.includes(entry)) {
      fs.rmSync(path.join(target, entry), { recursive: true, force: true });
    }
  }

  for (const entry of sourceEntries) {
    fs.cpSync(path.join(source, entry), path.join(target, entry), {
      recursive: true,
      force: true,
      dereference: true,
    });
  }

  fs.writeFileSync(
    path.join(target, MANIFEST_NAME),
    `${JSON.stringify({ entries: sourceEntries }, null, JSON_INDENT_SPACES)}\n`,
  );
  return sourceEntries.map((entry) => path.join(target, entry));
}

/** Mirrors a selected list of files while preserving unrelated files. */
export function syncManagedFiles(
  source: string,
  target: string,
  fileNames: readonly string[],
): string[] {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of readManagedEntries(target)) {
    if (!fileNames.includes(entry)) fs.rmSync(path.join(target, entry), { force: true });
  }
  for (const fileName of fileNames) {
    fs.copyFileSync(path.join(source, fileName), path.join(target, fileName));
  }
  fs.writeFileSync(
    path.join(target, MANIFEST_NAME),
    `${JSON.stringify({ entries: fileNames }, null, JSON_INDENT_SPACES)}\n`,
  );
  return fileNames.map((fileName) => path.join(target, fileName));
}

function readManagedEntries(directory: string): string[] {
  const manifestPath = path.join(directory, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { entries?: unknown };
    return Array.isArray(parsed.entries)
      ? parsed.entries.filter(
          (entry): entry is string =>
            typeof entry === 'string' && path.basename(entry) === entry && entry !== MANIFEST_NAME,
        )
      : [];
  } catch {
    return [];
  }
}
