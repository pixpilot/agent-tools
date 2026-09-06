/**
 * Path helpers. Windows is the primary host platform, so path comparison and
 * Docker mount formatting are centralised here.
 */
import path from 'node:path';
import process from 'node:process';

/** Absolute path with forward slashes and no trailing separator. */
export function toPosixPath(value: string): string {
  const absolute = path.resolve(value).replace(/\\/gu, '/');
  return absolute.length > 1 ? absolute.replace(/\/+$/u, '') : absolute;
}

/** Case-insensitive on Windows, exact elsewhere. */
export function pathsEqual(left: string, right: string): boolean {
  const a = toPosixPath(left);
  const b = toPosixPath(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Source string for a `docker run -v` bind mount. Docker Desktop accepts native
 * Windows paths, so they are resolved but never translated.
 */
export function toMountSource(hostPath: string): string {
  return path.resolve(hostPath);
}

/** Stable key for a path, used for Docker labels and volume names. */
export function pathKey(value: string): string {
  const posix = toPosixPath(value);
  return process.platform === 'win32' ? posix.toLowerCase() : posix;
}
