import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readAgentSettings } from '../../src/configs/read-agent-settings';

const directories: string[] = [];

function configsDir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-settings-'));
  directories.push(root);
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), contents);
  }
  return root;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('readAgentSettings', () => {
  it('should return nothing when no directory was supplied', () => {
    expect(readAgentSettings(undefined, 'codex')).toEqual({});
    expect(readAgentSettings('   ', 'codex')).toEqual({});
  });

  it('should return nothing when the directory has no settings file', () => {
    expect(readAgentSettings(configsDir({}), 'codex')).toEqual({});
  });

  it('should read the model for the selected agent only', () => {
    const root = configsDir({
      'agents.jsonc': `{
        // per-agent model names
        "codex": { "model": "gpt-5.1-codex" },
        "claude": { "model": "opus" },
      }`,
    });

    expect(readAgentSettings(root, 'codex')).toEqual({ model: 'gpt-5.1-codex' });
    expect(readAgentSettings(root, 'claude')).toEqual({ model: 'opus' });
    expect(readAgentSettings(root, 'copilot')).toEqual({});
  });

  it('should fall back to $defaults when the agent has no entry', () => {
    const root = configsDir({
      'agents.json':
        '{ "$defaults": { "model": "shared" }, "codex": { "model": "own" } }',
    });

    expect(readAgentSettings(root, 'copilot')).toEqual({ model: 'shared' });
    expect(readAgentSettings(root, 'codex')).toEqual({ model: 'own' });
  });

  it('should prefer agents.jsonc over agents.json', () => {
    const root = configsDir({
      'agents.jsonc': '{ "codex": { "model": "from-jsonc" } }',
      'agents.json': '{ "codex": { "model": "from-json" } }',
    });

    expect(readAgentSettings(root, 'codex')).toEqual({ model: 'from-jsonc' });
  });

  it('should reject a malformed settings file', () => {
    expect(() => readAgentSettings(configsDir({ 'agents.json': '[]' }), 'codex')).toThrow(
      /must contain an object/u,
    );
    expect(() =>
      readAgentSettings(
        configsDir({ 'agents.json': '{ "codex": { "model": 5 } }' }),
        'codex',
      ),
    ).toThrow(/"model" must be a non-empty string/u);
    expect(() =>
      readAgentSettings(configsDir({ 'agents.json': '{ "codex": "opus" }' }), 'codex'),
    ).toThrow(/"codex" must contain an object/u);
  });
});
