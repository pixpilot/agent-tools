import type { Command } from 'commander';

/**
 * True when the invocation carried at least one `--flag`. A bare run gets the
 * guided setup; anything else is driven purely by the flags and their defaults.
 */
export function hasExplicitOptions(program: Command): boolean {
  return program.options.some(
    (option) => program.getOptionValueSource(option.attributeName()) === 'cli',
  );
}
