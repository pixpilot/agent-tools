import { describe, expect, it } from 'vitest';
import { createProgram } from '../../src/cli/create-program';
import {
  getExplicitOptions,
  hasExplicitOptions,
} from '../../src/cli/has-explicit-options';

function parse(argv: readonly string[]): boolean {
  const program = createProgram('0.0.0');
  program.action(() => {});
  program.parse(['node', 'cli', ...argv]);
  return hasExplicitOptions(program);
}

describe('hasExplicitOptions', () => {
  it('should expose prompt options and configs-dir, but not the legacy skills-dir option', () => {
    const options = createProgram('0.0.0').options.map((option) => option.long);
    expect(options).toContain('--prompt');
    expect(options).toContain('--prompt-file');
    expect(options).toContain('--configs-dir');
    expect(options).not.toContain('--skills-dir');
    expect(createProgram('0.0.0').helpInformation()).toContain(
      'Read the initial prompt from a UTF-8 file',
    );
  });

  it('should report false for a bare invocation', () => {
    expect(parse([])).toBe(false);
  });

  it.each([['--task', 'fix login'], ['--agent', 'codex'], ['--offline']])(
    'should keep the guided setup for %s',
    (...argv) => {
      expect(parse(argv)).toBe(false);
    },
  );

  it.each([['--yes'], ['-y']])('should select non-interactive mode for %s', (flag) => {
    expect(parse([flag])).toBe(true);
  });

  it('should not count an option that only has its default value', () => {
    const program = createProgram('0.0.0');
    program.action(() => {});
    program.parse(['node', 'cli']);

    expect(program.opts<{ fullAccess: boolean }>().fullAccess).toBe(true);
    expect(hasExplicitOptions(program)).toBe(false);
  });

  it('should return only options explicitly passed on the command line', () => {
    const program = createProgram('0.0.0');
    program.action(() => {});
    program.parse(['node', 'cli', '--configs-dir', '/configs', '--no-git-mount']);

    expect(getExplicitOptions(program)).toStrictEqual({
      configsDir: '/configs',
      gitMount: false,
    });
  });
});
