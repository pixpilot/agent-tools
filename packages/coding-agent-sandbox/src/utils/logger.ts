/**
 * Minimal ANSI logger. Writes through `process.stdout`/`stderr` so it never
 * competes with the inherited terminal handed to the agent.
 */
import process from 'node:process';

const RESET = '\u001B[0m';
const DIM = '\u001B[90m';
const CYAN = '\u001B[36m';
const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const RED = '\u001B[31m';

function write(stream: NodeJS.WriteStream, color: string, text: string): void {
  stream.write(`${color}${text}${RESET}\n`);
}

/** Section heading for a step of the session setup. */
export function step(message: string): void {
  write(process.stdout, CYAN, `> ${message}`);
}

/** Secondary detail attached to the previous step. */
export function detail(message: string): void {
  write(process.stdout, DIM, `  ${message}`);
}

/** Confirmation that something completed. */
export function success(message: string): void {
  write(process.stdout, GREEN, `+ ${message}`);
}

/** Recoverable problem the user should know about. */
export function warn(message: string): void {
  write(process.stderr, YELLOW, `! ${message}`);
}

/** Fatal problem; the caller is responsible for aborting. */
export function error(message: string): void {
  write(process.stderr, RED, `x ${message}`);
}

/** Uncoloured line, used for summaries and plans. */
export function plain(message = ''): void {
  process.stdout.write(`${message}\n`);
}
