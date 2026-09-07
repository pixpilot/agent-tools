import type { Command } from 'commander';
import type { RawCliOptions } from './resolve-cli-options';

/**
 * True when the caller opted into the non-interactive mode.
 */
export function hasExplicitOptions(program: Command): boolean {
  return program.getOptionValueSource('yes') === 'cli';
}

/** Returns only values supplied on the command line, excluding Commander defaults. */
export function getExplicitOptions(program: Command): RawCliOptions {
  const options = program.opts<Record<string, unknown>>();

  return Object.fromEntries(
    program.options
      .map((option) => option.attributeName())
      .filter((name) => program.getOptionValueSource(name) === 'cli')
      .map((name) => [name, options[name]]),
  );
}
