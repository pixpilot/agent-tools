import { createHash } from 'node:crypto';

const DEFAULT_LENGTH = 10;

/** Short, stable hex digest used to make Docker object names unique. */
export function shortHash(value: string, length = DEFAULT_LENGTH): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}
