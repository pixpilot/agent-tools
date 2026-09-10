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
  setTempDirectoryRoot,
  tempDirectoryPrefix,
  tempDirectoryRoot,
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
  setTempDirectoryRoot(undefined);
});

afterEach(() => {
  setTempDirectoryRoot(undefined);

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

describe('setTempDirectoryRoot', () => {
  it('should fall back to the OS temporary directory when no root is given', () => {
    expect(setTempDirectoryRoot(undefined)).toBe(false);
    expect(setTempDirectoryRoot('   ')).toBe(false);
    expect(tempDirectoryRoot()).toBe(os.tmpdir());
  });

  it('should report no move when the root is the OS temporary directory', () => {
    expect(setTempDirectoryRoot(os.tmpdir())).toBe(false);
  });

  it('should create a missing root and report that it moved', () => {
    const root = path.join(os.tmpdir(), `sandbox-root-${process.pid}`, 'nested');
    created.push(path.dirname(root));

    expect(setTempDirectoryRoot(root)).toBe(true);
    expect(tempDirectoryRoot()).toBe(root);
    expect(fs.existsSync(root)).toBe(true);
  });

  it('should create every temporary directory under the configured root', () => {
    const root = path.join(os.tmpdir(), `sandbox-root-mount-${process.pid}`);
    created.push(root);
    setTempDirectoryRoot(root);

    const directory = createTempDirectory('git');

    expect(path.dirname(directory)).toBe(root);
    removeTempDirectory(directory);
  });

  it('should sweep leftovers inside the configured root', () => {
    const root = path.join(os.tmpdir(), `sandbox-root-sweep-${process.pid}`);
    const stale = path.join(root, 'coding-agent-sandbox-git-2147485-abc123');
    fs.mkdirSync(stale, { recursive: true });
    created.push(root);
    setTempDirectoryRoot(root);

    removeStaleTempDirectories();

    expect(fs.existsSync(stale)).toBe(false);
  });
});
