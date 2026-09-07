import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRemoteHosts } from '../../src/git/get-remote-hosts';

let repo: string;

function git(...args: string[]): void {
  execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cas-remote-'));
  git('init', '--quiet');
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('getRemoteHosts', () => {
  it('should allow the host of an HTTPS remote', () => {
    git('remote', 'add', 'origin', 'https://github.com/pixpilot/agent-tools.git');

    expect(getRemoteHosts(repo)).toEqual(['github.com']);
  });

  it('should collect every remote, not just origin', () => {
    git('remote', 'add', 'origin', 'https://github.com/pixpilot/agent-tools.git');
    git('remote', 'add', 'mirror', 'https://gitlab.com/pixpilot/agent-tools.git');

    expect(getRemoteHosts(repo)).toEqual(['github.com', 'gitlab.com']);
  });

  it('should ignore SSH remotes, which cannot traverse an HTTP proxy', () => {
    git('remote', 'add', 'origin', 'git@github.com:pixpilot/agent-tools.git');

    expect(getRemoteHosts(repo)).toEqual([]);
  });

  it('should ignore a local path remote', () => {
    git('remote', 'add', 'local', '../other-checkout');

    expect(getRemoteHosts(repo)).toEqual([]);
  });

  it('should drop credentials rather than leak them into the allowlist', () => {
    git('remote', 'add', 'origin', 'https://user:token@github.com/pixpilot/x.git');

    expect(getRemoteHosts(repo)).toEqual(['github.com']);
  });

  it('should skip a host the allowlist cannot express', () => {
    git('remote', 'add', 'origin', 'http://localhost:3000/x.git');

    expect(getRemoteHosts(repo)).toEqual([]);
  });

  it('should report nothing for a repository with no remotes', () => {
    expect(getRemoteHosts(repo)).toEqual([]);
  });

  it('should report nothing outside a repository instead of failing', () => {
    expect(getRemoteHosts(os.tmpdir())).toEqual([]);
  });
});
