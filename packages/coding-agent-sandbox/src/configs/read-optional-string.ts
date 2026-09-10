/**
 * Reads a settings value that must be a non-empty string. Shared by the
 * settings readers so every key reports a malformed value the same way.
 */
export function readOptionalString(
  value: unknown,
  file: string,
  key: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`"${key}" must be a non-empty string: ${file}`);
  }
  return value.trim();
}
