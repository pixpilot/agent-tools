import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { PACKAGE_CACHE_VOLUME } from '../../src/constants';
import { NodeEnvironment } from '../../src/environments/node-environment';
import { buildContainerName } from '../../src/session/build-container-name';
import { buildSessionVolumes } from '../../src/session/build-session-volumes';

const worktree = path.resolve('repo.worktrees/fix-resume-claude');

describe('buildSessionVolumes', () => {
  it('should persist agent state in the agent auth volume', () => {
    const volumes = buildSessionVolumes(getAgent('claude'), undefined, worktree);

    expect(volumes).toContainEqual({
      name: 'coding-agent-sandbox-auth-claude',
      target: '/agent-state',
    });
  });

  it('should share the npm global and package cache volumes across sessions', () => {
    const targets = buildSessionVolumes(getAgent('claude'), undefined, worktree).map(
      (volume) => volume.target,
    );

    expect(targets).toContain('/home/node/.npm-global');
    expect(targets).toContain('/home/node/.cache');
    expect(targets).toContain('/cache');
    expect(buildSessionVolumes(getAgent('codex'), undefined, worktree)).toContainEqual({
      name: PACKAGE_CACHE_VOLUME,
      target: '/cache',
    });
  });

  it('should keep node_modules out of the host worktree', () => {
    const volumes = buildSessionVolumes(
      getAgent('claude'),
      new NodeEnvironment(),
      worktree,
    );

    expect(volumes.some((volume) => volume.target === '/workspace/node_modules')).toBe(
      true,
    );
  });

  it('should give each worktree its own dependency volume', () => {
    const first = buildSessionVolumes(
      getAgent('claude'),
      new NodeEnvironment(),
      worktree,
    );
    const second = buildSessionVolumes(
      getAgent('codex'),
      new NodeEnvironment(),
      path.resolve('repo.worktrees/fix-resume-codex'),
    );
    const nameFor = (volumes: typeof first): string | undefined =>
      volumes.find((volume) => volume.target === '/workspace/node_modules')?.name;

    expect(nameFor(first)).not.toBe(nameFor(second));
  });

  it('should produce Docker-safe volume names', () => {
    for (const volume of buildSessionVolumes(
      getAgent('claude'),
      new NodeEnvironment(),
      worktree,
    )) {
      expect(volume.name).toMatch(/^[a-zA-Z0-9][\w.-]*$/u);
    }
  });
});

describe('buildContainerName', () => {
  it('should produce a Docker-safe name', () => {
    expect(buildContainerName('claude', 'fix-resume', worktree)).toMatch(
      /^[a-zA-Z0-9][\w.-]*$/u,
    );
  });

  it('should differ per agent and per worktree', () => {
    const a = buildContainerName('claude', 'fix-resume', worktree);
    const b = buildContainerName('codex', 'fix-resume', worktree);
    const c = buildContainerName('claude', 'fix-resume', path.resolve('other'));

    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('should stay stable for the same session', () => {
    expect(buildContainerName('claude', 'fix-resume', worktree)).toBe(
      buildContainerName('claude', 'fix-resume', worktree),
    );
  });
});
