const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

/** Parses a CLI boolean, so Scaffoldfy can pass `--full-access {{answer}}`. */
export function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`Expected a boolean value, received "${value}".`);
}
