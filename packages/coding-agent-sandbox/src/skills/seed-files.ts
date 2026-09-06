/**
 * Placeholder configuration files created in the container before the skills
 * sync runs.
 *
 * Sync utilities are normally written against a fully set-up host machine and
 * refuse to run when the files they merge into are missing. A fresh container
 * has none of them, so empty placeholders are seeded first. Existing files are
 * never touched, and no host file is read or copied.
 */

/** Home-relative files seeded with `{}` when absent. */
export const DEFAULT_SEED_JSON: readonly string[] = [
  '.claude.json',
  'AppData/Roaming/Code/User/mcp.json',
];

/** Home-relative files seeded empty when absent. */
export const DEFAULT_SEED_EMPTY: readonly string[] = ['.codex/config.toml'];

/** Splits extra `--seed-file` paths by extension into the two seed lists. */
export function partitionSeedFiles(paths: readonly string[]): {
  json: string[];
  empty: string[];
} {
  const json = [...DEFAULT_SEED_JSON];
  const empty = [...DEFAULT_SEED_EMPTY];

  for (const candidate of paths) {
    const target = candidate.endsWith('.json') ? json : empty;
    if (!target.includes(candidate)) {
      target.push(candidate);
    }
  }

  return { json, empty };
}
