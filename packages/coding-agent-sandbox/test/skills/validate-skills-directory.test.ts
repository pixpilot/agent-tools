import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateSkillsDirectory } from '../../src/skills/validate-skills-directory';

let sandbox: string;

function makeSkillsDir(files: Record<string, string>, directories: string[]): string {
  const root = path.join(sandbox, 'skills');
  fs.mkdirSync(root, { recursive: true });

  for (const directory of directories) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }

  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), contents);
  }

  return root;
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-skills-'));
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('validateSkillsDirectory', () => {
  it('should prefer the repository npm sync script', () => {
    const root = makeSkillsDir(
      {
        'package.json': JSON.stringify({ scripts: { sync: 'node sync.js' } }),
        'sync.js': '',
      },
      ['skills'],
    );

    expect(validateSkillsDirectory(root)).toEqual({
      path: path.resolve(root),
      syncCommand: 'npm run sync',
    });
  });

  it('should fall back to a root sync entry file', () => {
    const root = makeSkillsDir({ 'sync.js': '' }, ['prompts']);

    expect(validateSkillsDirectory(root).syncCommand).toBe('node sync.js');
  });

  it('should reject a directory that does not exist', () => {
    expect(() => validateSkillsDirectory(path.join(sandbox, 'nope'))).toThrow(
      /does not exist/u,
    );
  });

  it('should reject a directory with no skills structure', () => {
    const root = makeSkillsDir({ 'sync.js': '' }, []);

    expect(() => validateSkillsDirectory(root)).toThrow(
      /does not look like a skills repository/u,
    );
  });

  it('should reject a directory with no identifiable sync utility', () => {
    const root = makeSkillsDir({ 'package.json': '{}' }, ['skills']);

    expect(() => validateSkillsDirectory(root)).toThrow(/No sync utility found/u);
  });
});
