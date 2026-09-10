/**
 * Host temporary directories owned by this CLI. Every directory is named after
 * the package and tagged with the owning process id, so a leftover always names
 * its creator and can be swept once the session that made it is gone.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  EXIT_CODE_ERROR,
  TEMP_DIRECTORY_KEEP_MARKER,
  TEMP_DIRECTORY_PREFIX,
} from '../constants';
import { pathsEqual } from './normalize-path';

const SIGNAL_EXIT_CODES: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
};
const CLEANUP_SIGNALS = Object.keys(SIGNAL_EXIT_CODES) as NodeJS.Signals[];
/** `mkdtemp` appends six random characters to the requested prefix. */
const OWNER_PATTERN = /-(?<pid>\d+)-[\dA-Za-z]{6}$/u;
/** Directories left by CLI versions that did not tag their owner. */
const LEGACY_PREFIXES = ['agent-config-sync-', TEMP_DIRECTORY_PREFIX];
const ONE_DAY_MS = 86_400_000;

const tracked = new Set<string>();
let configuredRoot: string | undefined;
let installed = false;
let terminalHandoff = false;

/** Root every temporary directory of this session is created under. */
export function tempDirectoryRoot(): string {
  return configuredRoot ?? os.tmpdir();
}

/**
 * Points temporary directories at `requested`, creating it when missing. Every
 * directory this CLI creates is bind-mounted into the container, and Docker
 * Desktop grants bind mounts per path: a fixed root can be shared once instead
 * of approving a freshly named directory on every run. Returns whether the root
 * actually moved away from the OS temporary directory.
 */
export function setTempDirectoryRoot(requested: string | undefined): boolean {
  const trimmed = requested?.trim();

  if (trimmed == null || trimmed === '') {
    configuredRoot = undefined;
    return false;
  }

  const resolved = path.resolve(trimmed);

  try {
    fs.mkdirSync(resolved, { recursive: true });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Could not create --temp-dir ${resolved}: ${message}`);
  }

  configuredRoot = resolved;
  return !pathsEqual(resolved, os.tmpdir());
}

/** Names a temporary directory after this package and the session that owns it. */
export function tempDirectoryPrefix(purpose: string): string {
  return `${TEMP_DIRECTORY_PREFIX}${purpose}-${process.pid}-`;
}

/** Creates a temporary directory that is removed when this session ends. */
export function createTempDirectory(purpose: string): string {
  installTempDirectoryCleanup();
  const directory = fs.mkdtempSync(
    path.join(tempDirectoryRoot(), tempDirectoryPrefix(purpose)),
  );
  tracked.add(directory);
  return directory;
}

/** Adopts a directory created elsewhere so it shares this session's lifetime. */
export function trackTempDirectory(directory: string): void {
  installTempDirectoryCleanup();
  tracked.add(directory);
}

/** Removes one tracked directory immediately. */
export function removeTempDirectory(directory: string): void {
  tracked.delete(directory);
  fs.rmSync(directory, { recursive: true, force: true });
}

/** Leaves a directory on disk for manual recovery and exempts it from sweeps. */
export function keepTempDirectory(directory: string): void {
  tracked.delete(directory);
  try {
    fs.writeFileSync(path.join(directory, TEMP_DIRECTORY_KEEP_MARKER), '');
  } catch {
    // The directory survives either way; only the sweep exemption is lost.
  }
}

/**
 * Marks the window where the container owns the terminal. Ctrl+C belongs to the
 * agent then, and the session tears itself down through its own handlers.
 */
export function setTerminalHandoff(active: boolean): void {
  terminalHandoff = active;
}

/** Registers the exit and signal handlers that guarantee removal. Idempotent. */
export function installTempDirectoryCleanup(): void {
  if (installed) return;
  installed = true;
  process.on('exit', removeTrackedDirectories);

  for (const signal of CLEANUP_SIGNALS) {
    process.on(signal, createSignalHandler(signal));
  }
}

function createSignalHandler(signal: NodeJS.Signals): () => void {
  return () => {
    // A signalled session still exits normally, so `exit` does the removal.
    if (terminalHandoff) return;
    removeTrackedDirectories();
    process.exit(SIGNAL_EXIT_CODES[signal] ?? EXIT_CODE_ERROR);
  };
}

/** Removes leftovers from earlier sessions whose process is no longer running. */
export function removeStaleTempDirectories(): void {
  const root = tempDirectoryRoot();
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const directory = path.join(root, entry.name);
    if (entry.isDirectory() && isAbandoned(entry.name, directory)) {
      try {
        fs.rmSync(directory, { recursive: true, force: true });
      } catch {
        // Another session may be removing the same leftover; either is fine.
      }
    }
  }
}

function removeTrackedDirectories(): void {
  for (const directory of tracked) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // Nothing further can be done while the process is already exiting.
    }
  }
  tracked.clear();
}

function isAbandoned(name: string, directory: string): boolean {
  if (!LEGACY_PREFIXES.some((prefix) => name.startsWith(prefix))) return false;
  if (fs.existsSync(path.join(directory, TEMP_DIRECTORY_KEEP_MARKER))) return false;

  const owner = Number(OWNER_PATTERN.exec(name)?.groups?.['pid']);
  // Untagged directories predate owner tagging, so only age can prove them dead.
  if (!Number.isInteger(owner) || owner <= 0) return isOlderThanADay(directory);
  return owner !== process.pid && !isRunning(owner);
}

function isOlderThanADay(directory: string): boolean {
  try {
    return Date.now() - fs.statSync(directory).mtimeMs > ONE_DAY_MS;
  } catch {
    return false;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    // EPERM means the process exists but belongs to another user.
    return (cause as NodeJS.ErrnoException).code === 'EPERM';
  }
}
