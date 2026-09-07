import type { SessionPlan } from '../../src/types';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRunArgs } from '../../src/docker/build-run-args';

function makePlan(overrides: Partial<SessionPlan> = {}): SessionPlan {
  return {
    agentId: 'claude',
    agentLabel: 'Claude Code',
    image: 'coding-agent-sandbox:test',
    containerName: 'coding-agent-sandbox-claude-demo-1234',
    repositoryRoot: path.resolve('repo'),
    worktreePath: path.resolve('repo.worktrees/demo-claude'),
    gitDirPath: path.resolve('repo/.git'),
    mountGit: true,
    skillsPath: path.resolve('skills'),
    volumes: [{ name: 'coding-agent-sandbox-auth-claude', target: '/agent-state' }],
    env: { SANDBOX_AGENT_ID: 'claude' },
    tty: true,
    network: 'strict',
    ...overrides,
  };
}

function mountFor(args: string[], target: string): string | undefined {
  return args.find((arg) => arg.endsWith(`:${target}`) || arg.endsWith(`:${target}:ro`));
}

describe('buildRunArgs', () => {
  it('should disable networking and image pulls when the mode is none', () => {
    const args = buildRunArgs(makePlan({ network: 'none' }));

    expect(args[args.indexOf('--network') + 1]).toBe('none');
    expect(args[args.indexOf('--pull') + 1]).toBe('never');
  });

  it.each(['strict', 'open'] as const)(
    'should join only the per-session internal network in %s mode',
    (network) => {
      const args = buildRunArgs(
        makePlan({ network, networkName: 'coding-agent-sandbox-net-abc123' }),
      );

      expect(args[args.indexOf('--network') + 1]).toBe(
        'coding-agent-sandbox-net-abc123',
      );
      expect(args).not.toContain('--pull');
    },
  );

  it('should not pin a network before the session network exists', () => {
    expect(buildRunArgs(makePlan({ networkName: undefined }))).not.toContain('--network');
  });

  it('should drop capabilities and privilege escalation in every mode', () => {
    for (const network of ['strict', 'open', 'none'] as const) {
      const args = buildRunArgs(makePlan({ network }));

      expect(args).toContain('--cap-drop=ALL');
      expect(args).toContain('--security-opt=no-new-privileges');
      expect(args[args.indexOf('--pids-limit') + 1]).toBe('512');
    }
  });

  it('should leave CPU and memory unconstrained unless asked', () => {
    const args = buildRunArgs(makePlan());

    expect(args).not.toContain('--cpus');
    expect(args).not.toContain('--memory');
  });

  it('should pass through explicit CPU and memory limits', () => {
    const args = buildRunArgs(makePlan({ cpus: '2', memory: '4g' }));

    expect(args[args.indexOf('--cpus') + 1]).toBe('2');
    expect(args[args.indexOf('--memory') + 1]).toBe('4g');
  });

  it('should not mount the skills source when provisioning is disabled', () => {
    const args = buildRunArgs(makePlan({ env: { SANDBOX_SKILLS_ENABLED: '0' } }));
    expect(mountFor(args, '/coding-agent-sandbox/skills')).toBeUndefined();
  });
  it('should mount the worktree read/write at /workspace', () => {
    const args = buildRunArgs(makePlan());

    expect(mountFor(args, '/workspace')).toBe(
      `${path.resolve('repo.worktrees/demo-claude')}:/workspace`,
    );
  });

  it('should mount the skills directory read-only', () => {
    const args = buildRunArgs(makePlan());

    expect(args).toContain(`${path.resolve('skills')}:/coding-agent-sandbox/skills:ro`);
  });

  it('should never mount the main checkout, the Docker socket or the host home', () => {
    const args = buildRunArgs(makePlan()).join(' ');

    expect(args).not.toContain('docker.sock');
    expect(args).not.toContain(`${path.resolve('repo')}:/`);
    expect(args).not.toContain(':/root');
    expect(args).not.toContain('.ssh');
  });

  it('should mount the shared .git directory when Git support is enabled', () => {
    expect(buildRunArgs(makePlan())).toContain(`${path.resolve('repo/.git')}:/repo/.git`);
  });

  it('should omit the .git mount when Git support is disabled', () => {
    const args = buildRunArgs(makePlan({ mountGit: false }));

    expect(args.some((arg) => arg.endsWith(':/repo/.git'))).toBe(false);
  });

  it('should label the container so concurrent sessions can be detected', () => {
    const args = buildRunArgs(makePlan());

    expect(args).toContain('com.pixpilot.sandbox=1');
    expect(args).toContain('com.pixpilot.sandbox.agent=claude');
    expect(args.some((arg) => arg.startsWith('com.pixpilot.sandbox.worktree='))).toBe(
      true,
    );
  });

  it('should remove the container on exit and start in /workspace', () => {
    const args = buildRunArgs(makePlan());

    expect(args).toContain('--rm');
    expect(args[args.indexOf('--workdir') + 1]).toBe('/workspace');
  });

  it('should allocate a TTY only when the terminal has one', () => {
    expect(buildRunArgs(makePlan({ tty: true }))).toContain('-it');
    expect(buildRunArgs(makePlan({ tty: false }))).toContain('-i');
  });

  it('should pass every env entry through', () => {
    const args = buildRunArgs(makePlan({ env: { A: '1', B: 'two words' } }));

    expect(args).toContain('A=1');
    expect(args).toContain('B=two words');
  });

  it('should end with the image so docker treats it as the run target', () => {
    expect(buildRunArgs(makePlan()).at(-1)).toBe('coding-agent-sandbox:test');
  });
});
