/** Docker's own sentinel for "no PID cap at all". */
const UNLIMITED = -1;
/** Below this the agent runtime's own thread pools cannot start reliably. */
const MINIMUM = 512;

/**
 * Parses `--pids-limit`. Every Linux thread counts against the cgroup `pids`
 * controller, so a value that looks generous in processes is not: an agent
 * runtime idles at several hundred tasks before a build fans out.
 */
export function parsePidsLimit(value: string): string {
  const normalized = value.trim();

  if (!/^-?\d+$/u.test(normalized)) {
    throw new Error(`Expected an integer PID limit, received "${value}".`);
  }

  const parsed = Number(normalized);

  if (parsed === UNLIMITED) {
    return String(UNLIMITED);
  }

  if (parsed < MINIMUM) {
    throw new Error(
      `--pids-limit must be at least ${MINIMUM} (or -1 for unlimited); received "${value}".`,
    );
  }

  return String(parsed);
}
