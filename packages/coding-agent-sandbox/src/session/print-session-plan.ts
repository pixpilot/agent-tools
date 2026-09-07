import type { SessionPlan } from '../types';
import { buildRunArgs } from '../docker/build-run-args';
import { plain, step } from '../utils/logger';

const VALUE_FLAGS = new Set([
  '--name',
  '--label',
  '--workdir',
  '--network',
  '--pull',
  '--pids-limit',
  '--cpus',
  '--memory',
  '-v',
  '-e',
]);

/** Prints the Docker plan without environment values, which may contain secrets. */
export function printSessionPlan(plan: SessionPlan): void {
  plain();
  step('Dry run - Docker plan (environment values omitted; not a runnable command)');
  plain();
  plain(`docker ${formatArgs(buildRunArgs(plan))}`);
  plain();
}

/** Renders one flag/value pair per line so long mount and env lists stay readable. */
function formatArgs(args: string[]): string {
  const lines: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    const next = args[index + 1];

    if (VALUE_FLAGS.has(arg) && next != null) {
      const value = arg === '-e' ? `${next.split('=')[0]}=<omitted>` : next;
      lines.push(`${arg} ${quote(value)}`);
      index += 1;
    } else {
      lines.push(quote(arg));
    }
  }

  return lines.join(' \\\n  ');
}

function quote(value: string): string {
  return /[\s"']/u.test(value) ? `"${value.replace(/"/gu, '\\"')}"` : value;
}
