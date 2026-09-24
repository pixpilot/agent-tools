/* eslint-disable no-template-curly-in-string -- npmrc `${VAR}` syntax */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  discoverNpmAuth,
  hostUserNpmrcPath,
} from '../../src/environments/discover-npm-auth';

let sandbox: string;
let project: string;
let userConfig: string;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-npm-auth-'));
  project = path.join(sandbox, 'project');
  userConfig = path.join(sandbox, 'user.npmrc');
  fs.mkdirSync(project);
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

function write(file: string, lines: string[]): void {
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

describe('discoverNpmAuth', () => {
  it('should find the user config variable for a project registry', () => {
    write(path.join(project, '.npmrc'), [
      '@pixpilot-private:registry=https://npm.pkg.github.com/',
    ]);
    write(userConfig, ['//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}']);

    expect(
      discoverNpmAuth(project, { userConfig, env: { GH_PACKAGES_TOKEN: 'ghp_x' } }),
    ).toEqual({
      found: [
        { host: 'npm.pkg.github.com', envVar: 'GH_PACKAGES_TOKEN', source: userConfig },
      ],
      missing: [],
    });
  });

  it('should prefer the project file, as npm does', () => {
    const projectNpmrc = path.join(project, '.npmrc');
    write(projectNpmrc, [
      '@acme:registry=https://npm.pkg.github.com/',
      '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}',
    ]);
    write(userConfig, ['//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}']);

    const { found } = discoverNpmAuth(project, {
      userConfig,
      env: { NODE_AUTH_TOKEN: 'a', GH_PACKAGES_TOKEN: 'b' },
    });

    expect(found).toEqual([
      { host: 'npm.pkg.github.com', envVar: 'NODE_AUTH_TOKEN', source: projectNpmrc },
    ]);
  });

  it('should report a named variable that is not set', () => {
    write(path.join(project, '.npmrc'), ['@acme:registry=https://npm.pkg.github.com/']);
    write(userConfig, ['//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}']);

    expect(discoverNpmAuth(project, { userConfig, env: {} })).toEqual({
      found: [],
      missing: [
        { host: 'npm.pkg.github.com', envVar: 'GH_PACKAGES_TOKEN', source: userConfig },
      ],
    });
  });

  it('should ignore tokens for registries the project does not use', () => {
    write(path.join(project, '.npmrc'), ['@acme:registry=https://npm.pkg.github.com/']);
    write(userConfig, ['//npm.other.example.com/:_authToken=${OTHER_TOKEN}']);

    expect(discoverNpmAuth(project, { userConfig, env: { OTHER_TOKEN: 'x' } })).toEqual({
      found: [],
      missing: [],
    });
  });

  it('should skip literal tokens and reserved variables', () => {
    write(path.join(project, '.npmrc'), [
      '@a:registry=https://npm.a.example.com/',
      '@b:registry=https://npm.b.example.com/',
    ]);
    write(userConfig, [
      '//npm.a.example.com/:_authToken=npm_literalSecretValue',
      '//npm.b.example.com/:_authToken=${HOME}',
    ]);

    expect(discoverNpmAuth(project, { userConfig, env: { HOME: '/home/me' } })).toEqual({
      found: [],
      missing: [],
    });
  });

  it('should find nothing without a project .npmrc', () => {
    write(userConfig, ['//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}']);

    expect(
      discoverNpmAuth(project, { userConfig, env: { GH_PACKAGES_TOKEN: 'x' } }),
    ).toEqual({ found: [], missing: [] });
  });
});

describe('hostUserNpmrcPath', () => {
  it('should honour NPM_CONFIG_USERCONFIG', () => {
    expect(hostUserNpmrcPath({ NPM_CONFIG_USERCONFIG: ' /custom/npmrc ' })).toBe(
      '/custom/npmrc',
    );
  });

  it('should default to .npmrc in the home directory', () => {
    expect(hostUserNpmrcPath({})).toBe(path.join(os.homedir(), '.npmrc'));
  });
});
