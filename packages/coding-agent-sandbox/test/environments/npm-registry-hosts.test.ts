import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeEnvironment } from '../../src/environments/node-environment';
import {
  readNpmrcRegistries,
  readNpmrcRegistryHosts,
  readNpmrcTokenVars,
  withDownloadHosts,
} from '../../src/environments/npm-registry-hosts';

let sandbox: string;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-npmrc-'));
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

function writeNpmrc(contents: string): void {
  fs.writeFileSync(path.join(sandbox, '.npmrc'), contents);
}

describe('readNpmrcRegistryHosts', () => {
  it('should return nothing without an .npmrc', () => {
    expect(readNpmrcRegistryHosts(sandbox)).toEqual([]);
  });

  it('should read default and scoped registries', () => {
    writeNpmrc(
      [
        'registry=https://registry.example.com/',
        '@acme:registry = https://NPM.Acme.dev/api/npm/',
        '',
      ].join('\r\n'),
    );

    expect(readNpmrcRegistryHosts(sandbox)).toEqual([
      'npm.acme.dev',
      'registry.example.com',
    ]);
  });

  it('should add the download host GitHub Packages redirects tarballs to', () => {
    writeNpmrc('@pixpilot-private:registry=https://npm.pkg.github.com/\n');

    expect(readNpmrcRegistryHosts(sandbox)).toEqual([
      'npm.pkg.github.com',
      'pkg-npm.githubusercontent.com',
    ]);
  });

  it('should ignore comments, auth lines and hosts the allowlist cannot express', () => {
    writeNpmrc(
      [
        '# registry=https://commented.example.com/',
        '; registry=https://also-commented.example.com/',
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}',
        'registry=http://127.0.0.1:4873/',
        '@local:registry=http://localhost:4873/',
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '@env:registry=${REGISTRY_URL}',
        'link-workspace-packages=true',
      ].join('\n'),
    );

    expect(readNpmrcRegistryHosts(sandbox)).toEqual([]);
  });
});

describe('readNpmrcRegistries', () => {
  it('should list registry hosts without their download hosts', () => {
    writeNpmrc('@pixpilot-private:registry=https://npm.pkg.github.com/\n');

    expect(readNpmrcRegistries(sandbox)).toEqual(['npm.pkg.github.com']);
  });
});

describe('readNpmrcTokenVars', () => {
  const file = (): string => path.join(sandbox, '.npmrc');

  it('should map each registry host to the variable its auth line names', () => {
    writeNpmrc(
      [
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}',
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '//GitLab.example.com/api/v4/packages/npm/:_authToken = ${GITLAB_TOKEN?}',
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '//npm.pkg.github.com/:_authToken=${SHADOWED_TOKEN}',
      ].join('\r\n'),
    );

    expect(readNpmrcTokenVars(file())).toEqual(
      new Map([
        ['npm.pkg.github.com', 'GH_PACKAGES_TOKEN'],
        ['gitlab.example.com', 'GITLAB_TOKEN'],
      ]),
    );
  });

  it('should never read a token written into the file', () => {
    writeNpmrc(
      [
        '//registry.npmjs.org/:_authToken=npm_literalSecretValue',
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '//npm.example.com/:_authToken=prefix-${TOKEN}',
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '# //npm.pkg.github.com/:_authToken=${COMMENTED}',
        // eslint-disable-next-line no-template-curly-in-string -- npmrc syntax
        '//npm.pkg.github.com/:_password=${PASSWORD}',
      ].join('\n'),
    );

    expect(readNpmrcTokenVars(file())).toEqual(new Map());
  });

  it('should return nothing for a missing file', () => {
    expect(readNpmrcTokenVars(file())).toEqual(new Map());
  });
});

describe('withDownloadHosts', () => {
  it('should leave other registries alone', () => {
    expect(withDownloadHosts('registry.example.com')).toEqual(['registry.example.com']);
  });

  it('should normalise before looking up download hosts', () => {
    expect(withDownloadHosts(' NPM.pkg.github.com ')).toEqual([
      'npm.pkg.github.com',
      'pkg-npm.githubusercontent.com',
    ]);
  });
});

describe('nodeEnvironment.projectEgressHosts', () => {
  it('should expose the registries from .npmrc', () => {
    writeNpmrc('@acme:registry=https://npm.acme.dev/\n');

    expect(new NodeEnvironment().projectEgressHosts(sandbox)).toEqual(['npm.acme.dev']);
  });
});
