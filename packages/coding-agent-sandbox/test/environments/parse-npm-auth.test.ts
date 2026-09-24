import { describe, expect, it } from 'vitest';
import {
  findMissingNpmTokens,
  parseNpmAuth,
  parseNpmAuthList,
} from '../../src/environments/parse-npm-auth';

describe('parseNpmAuth', () => {
  it('should split a registry host from its token variable', () => {
    expect(parseNpmAuth('npm.pkg.github.com=GH_PACKAGES_TOKEN')).toEqual({
      host: 'npm.pkg.github.com',
      envVar: 'GH_PACKAGES_TOKEN',
    });
  });

  it('should normalise the host and trim both sides', () => {
    expect(parseNpmAuth(' NPM.Pkg.GitHub.com = token_1 ')).toEqual({
      host: 'npm.pkg.github.com',
      envVar: 'token_1',
    });
  });

  it.each([
    'npm.pkg.github.com',
    '=GH_PACKAGES_TOKEN',
    'npm.pkg.github.com=',
    'https://npm.pkg.github.com=TOKEN',
    'npm.pkg.github.com/path=TOKEN',
    '*.github.com=TOKEN',
    'localhost=TOKEN',
    'npm.pkg.github.com=1TOKEN',
    'npm.pkg.github.com=GH-TOKEN',
    'npm.pkg.github.com=$(id)',
  ])('should reject %j', (spec) => {
    expect(() => parseNpmAuth(spec)).toThrow(/Expected <host>=<ENV_VAR>/u);
  });

  it.each([
    'PATH',
    'home',
    'NODE_OPTIONS',
    'SANDBOX_NPM_AUTH',
    'NPM_CONFIG_USERCONFIG',
    'GIT_DIR',
    'https_proxy',
  ])('should refuse to forward the reserved variable %s', (envVar) => {
    expect(() => parseNpmAuth(`npm.pkg.github.com=${envVar}`)).toThrow(
      /the sandbox relies on that variable/u,
    );
  });
});

describe('parseNpmAuthList', () => {
  it('should return nothing when no entries were given', () => {
    expect(parseNpmAuthList()).toEqual([]);
  });

  it('should reject a registry named twice', () => {
    expect(() =>
      parseNpmAuthList(['npm.pkg.github.com=A_TOKEN', 'NPM.pkg.github.com=B_TOKEN']),
    ).toThrow(/names npm\.pkg\.github\.com more than once/u);
  });
});

describe('findMissingNpmTokens', () => {
  it('should report unset and blank variables only', () => {
    const entries = parseNpmAuthList([
      'a.example.com=SET_TOKEN',
      'b.example.com=BLANK_TOKEN',
      'c.example.com=UNSET_TOKEN',
    ]);

    expect(
      findMissingNpmTokens(entries, { SET_TOKEN: 'ghp_x', BLANK_TOKEN: '  ' }),
    ).toEqual(['BLANK_TOKEN', 'UNSET_TOKEN']);
  });
});
