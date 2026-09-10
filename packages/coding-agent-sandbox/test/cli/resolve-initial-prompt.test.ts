import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { resolveCliOptions } from '../../src/cli/resolve-cli-options';

const directories: string[] = [];

/** Creates a UTF-8 prompt file that is removed after its test. */
function createPromptFile(contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-prompt-'));
  directories.push(directory);
  const file = path.join(directory, 'prompt.md');
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

describe('resolveCliOptions prompt files', () => {
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should read UTF-8 content and trim its trailing whitespace', () => {
    const file = createPromptFile(
      '- O’Brien – review the résumé\n- Then run tests\n\n  \t',
    );

    expect(resolveCliOptions({ task: 'prompt file', promptFile: file })).toMatchObject({
      prompt: '- O’Brien – review the résumé\n- Then run tests',
    });
  });

  it('should reject a missing prompt file before resolving a session', () => {
    const file = path.join(os.tmpdir(), 'sandbox-prompt-file-that-does-not-exist.md');

    expect(() => resolveCliOptions({ task: 'prompt file', promptFile: file })).toThrow(
      `Could not read --prompt-file ${file}`,
    );
  });

  it('should reject using both prompt sources together', () => {
    const file = createPromptFile('Fix the login flow.');

    expect(() =>
      resolveCliOptions({ task: 'prompt file', prompt: 'Fix it.', promptFile: file }),
    ).toThrow('--prompt and --prompt-file cannot be used together.');
  });

  it('should preserve multi-line prompts in the safely quoted agent command', () => {
    const prompt = '- line one\n- line two\n\npath/to/file.md';
    const file = createPromptFile(`${prompt}\n`);
    const options = resolveCliOptions({ task: 'prompt file', promptFile: file });

    expect(
      getAgent('codex').launchCommand({ fullAccess: false, prompt: options.prompt }),
    ).toBe(`codex -- '${prompt}'`);
  });
});
