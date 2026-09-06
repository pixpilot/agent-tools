import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectEnvironment,
  listEnvironments,
} from '../../src/environments/detect-environment';

let sandbox: string;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-env-'));
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('detectEnvironment', () => {
  it('should detect a JavaScript/TypeScript project from package.json', () => {
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{}');

    expect(detectEnvironment(sandbox)?.id).toBe('node');
  });

  it('should install dependencies with ni so the project package manager wins', () => {
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{}');

    expect(detectEnvironment(sandbox)?.installCommand).toBe('ni');
  });

  it('should return nothing for an unrecognised project', () => {
    expect(detectEnvironment(sandbox)).toBeUndefined();
  });
});

describe('listEnvironments', () => {
  it('should expose the registered environments', () => {
    expect(listEnvironments().map((environment) => environment.id)).toEqual(['node']);
  });
});
