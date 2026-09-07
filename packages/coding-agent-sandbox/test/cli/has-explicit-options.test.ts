import { describe, expect, it } from 'vitest';
import { createProgram } from '../../src/cli/create-program';
import { hasExplicitOptions } from '../../src/cli/has-explicit-options';

function parse(argv: readonly string[]): boolean {
  const program = createProgram('0.0.0');
  program.action(() => {});
  program.parse(['node', 'cli', ...argv]);
  return hasExplicitOptions(program);
}

describe('hasExplicitOptions', () => {
  it('should report no flags for a bare invocation', () => {
    expect(parse([])).toBe(false);
  });

  it.each([
    ['--task', 'fix login'],
    ['--agent', 'codex'],
  ])('should detect %s', (...argv) => {
    expect(parse(argv)).toBe(true);
  });

  it.each([['--offline'], ['--yes'], ['-y'], ['--dry-run'], ['--no-git-mount']])(
    'should detect the boolean flag %s',
    (flag) => {
      expect(parse([flag])).toBe(true);
    },
  );

  it('should not count an option that only has its default value', () => {
    const program = createProgram('0.0.0');
    program.action(() => {});
    program.parse(['node', 'cli']);

    expect(program.opts<{ fullAccess: boolean }>().fullAccess).toBe(true);
    expect(hasExplicitOptions(program)).toBe(false);
  });
});
