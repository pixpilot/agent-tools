import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  pathKey,
  pathsEqual,
  toMountSource,
  toPosixPath,
} from '../../src/utils/normalize-path';

const isWindows = process.platform === 'win32';

describe('toPosixPath', () => {
  it('should use forward slashes', () => {
    expect(toPosixPath(path.join('a', 'b', 'c'))).toContain('a/b/c');
  });

  it('should drop a trailing separator', () => {
    expect(toPosixPath(`${path.resolve('a')}${path.sep}`)).toBe(toPosixPath('a'));
  });
});

describe('pathsEqual', () => {
  it('should ignore separator style', () => {
    expect(pathsEqual(path.resolve('a/b'), path.resolve('a', 'b'))).toBe(true);
  });

  it('should treat different paths as different', () => {
    expect(pathsEqual(path.resolve('a/b'), path.resolve('a/c'))).toBe(false);
  });

  it.runIf(isWindows)('should ignore case on Windows', () => {
    expect(pathsEqual('Z:/Github/Demo', 'z:/github/demo')).toBe(true);
  });
});

describe('toMountSource', () => {
  it('should keep the native path shape Docker Desktop accepts', () => {
    const resolved = toMountSource(path.resolve('a', 'b'));

    expect(resolved).toBe(path.resolve('a', 'b'));
  });
});

describe('pathKey', () => {
  it('should produce a label-safe forward-slash key', () => {
    expect(pathKey(path.resolve('a', 'b'))).not.toContain('\\');
  });

  it('should be stable for the same path written differently', () => {
    expect(pathKey(path.resolve('a/b'))).toBe(pathKey(path.resolve('a', 'b')));
  });
});
