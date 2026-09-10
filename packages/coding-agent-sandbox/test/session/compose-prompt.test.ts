import { describe, expect, it } from 'vitest';
import { composePrompt } from '../../src/session/compose-prompt';

describe('composePrompt', () => {
  it('should append the shared instructions to a prompt', () => {
    expect(composePrompt('Fix the flaky test.', 'Always run the linter.')).toBe(
      'Fix the flaky test.\n\nAlways run the linter.',
    );
  });

  it('should trim both parts before joining them', () => {
    expect(composePrompt('  Fix it.\n', '\n  Run the linter.  ')).toBe(
      'Fix it.\n\nRun the linter.',
    );
  });

  it('should leave a session without a prompt untouched', () => {
    expect(composePrompt(undefined, 'Always run the linter.')).toBeUndefined();
    expect(composePrompt('', 'Always run the linter.')).toBe('');
    expect(composePrompt('   ', 'Always run the linter.')).toBe('   ');
  });

  it('should return the prompt unchanged when there are no instructions', () => {
    expect(composePrompt('Fix the flaky test.', undefined)).toBe('Fix the flaky test.');
    expect(composePrompt('Fix the flaky test.', '  ')).toBe('Fix the flaky test.');
  });
});
