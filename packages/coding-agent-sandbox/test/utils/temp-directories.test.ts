import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEMP_DIRECTORY_KEEP_MARKER } from '../../src/constants';
import {
  createTempDirectory,
  keepTempDirectory,
  removeStaleTempDirectories,
  removeTempDirectory,
  tempDirectoryPrefix,
} from '../../src/utils/temp-directories';

const created: string[] = [];

function makeDirectory(name: string): string {
  const directory = path.join(os.tmpdir(), name);
  fs.mkdirSync(directory, { recursive: true });
  created.push(directory);
  return directory;
}

beforeEach(() => {
  created.length = 0;
});

afterEach(() => {
  for (const directory of created) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('tempDirectoryPrefix', () => {
  it('should name the package and the owning process', () => {
    expect(tempDirectoryPrefix('configs')).toBe(
      `coding-agent-sandbox-configs-${process.pid}-`,
    );
  });
});

describe('createTempDirectory', () => {
  it('should create a directory named after the package and remove it on request', () => {
    const directory = createTempDirectory('git');
    created.push(directory);

    expect(path.basename(directory)).toMatch(
      new RegExp(`^coding-agent-sandbox-git-${process.pid}-`, 'u'),
    );
    expect(fs.existsSync(directory)).toBe(true);

    removeTempDirectory(directory);
    expect(fs.existsSync(directory)).toBe(false);
  });
});

describe('removeStaleTempDirectories', () => {
  it('should remove leftovers whose owning process is gone', () => {
    const stale = makeDirectory('coding-agent-sandbox-git-2147483-abc123');
    removeStaleTempDirectories();
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('should keep leftovers owned by a running process', () => {
    const live = makeDirectory(`coding-agent-sandbox-git-${process.pid}-abc123`);
    removeStaleTempDirectories();
    expect(fs.existsSync(live)).toBe(true);
  });

  it('should keep a directory preserved for recovery', () => {
    const preserved = makeDirectory('coding-agent-sandbox-git-2147484-abc123');
    keepTempDirectory(preserved);

    removeStaleTempDirectories();
    expect(fs.existsSync(preserved)).toBe(true);
    expect(fs.existsSync(path.join(preserved, TEMP_DIRECTORY_KEEP_MARKER))).toBe(true);
  });

  it('should keep recent untagged directories from older CLI versions', () => {
    const recent = makeDirectory('agent-config-sync-abc123');
    removeStaleTempDirectories();
    expect(fs.existsSync(recent)).toBe(true);
  });

  it('should remove day-old untagged directories from older CLI versions', () => {
    const old = makeDirectory('agent-config-sync-def456');
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(old, twoDaysAgo, twoDaysAgo);

    removeStaleTempDirectories();
    expect(fs.existsSync(old)).toBe(false);
  });

  it('should ignore directories this CLI did not create', () => {
    const other = makeDirectory('some-other-tool-2147485-abc123');
    removeStaleTempDirectories();
    expect(fs.existsSync(other)).toBe(true);
  });
});
