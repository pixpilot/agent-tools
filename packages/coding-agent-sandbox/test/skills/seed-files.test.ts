import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED_EMPTY,
  DEFAULT_SEED_JSON,
  partitionSeedFiles,
} from '../../src/skills/seed-files';

describe('partitionSeedFiles', () => {
  it('should always include the built-in placeholders', () => {
    const seeds = partitionSeedFiles([]);

    expect(seeds.json).toEqual([...DEFAULT_SEED_JSON]);
    expect(seeds.empty).toEqual([...DEFAULT_SEED_EMPTY]);
  });

  it('should seed extra .json files with an empty object', () => {
    expect(partitionSeedFiles(['.config/tool/settings.json']).json).toContain(
      '.config/tool/settings.json',
    );
  });

  it('should seed other extra files empty', () => {
    expect(partitionSeedFiles(['.config/tool/config.toml']).empty).toContain(
      '.config/tool/config.toml',
    );
  });

  it('should not duplicate a built-in placeholder', () => {
    const seeds = partitionSeedFiles(['.claude.json', '.claude.json']);

    expect(seeds.json.filter((entry) => entry === '.claude.json')).toHaveLength(1);
  });
});
