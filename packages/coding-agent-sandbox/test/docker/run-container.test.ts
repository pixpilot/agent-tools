import type { SessionPlan } from '../../src/types';
import { EventEmitter } from 'node:events';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeContainer } from '../../src/docker/remove-container';
import { runContainer } from '../../src/docker/run-container';

const { child, spawn } = vi.hoisted(() => ({
  child: {
    current: undefined as (EventEmitter & { kill: ReturnType<typeof vi.fn> }) | undefined,
  },
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({ spawn }));
vi.mock('../../src/docker/remove-container', () => ({ removeContainer: vi.fn() }));

const plan: SessionPlan = {
  agentId: 'claude',
  agentLabel: 'Claude',
  image: 'test',
  containerName: 'test-session',
  repositoryRoot: '/repo',
  worktreePath: '/worktree',
  gitDirPath: '/repo/.git',
  mountGit: true,
  skillsPath: '/skills',
  volumes: [],
  env: {},
  tty: true,
  network: 'strict',
};

beforeEach(() => {
  child.current = Object.assign(new EventEmitter(), { kill: vi.fn() });
  spawn.mockReturnValue(child.current);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runContainer', () => {
  it.each(['SIGTERM', 'SIGHUP'] as const)(
    'should forward %s and clean up the container',
    async (signal) => {
      const listeners = process.listenerCount(signal);
      const result = runContainer(plan);
      process.emit(signal);
      expect(child.current?.kill).toHaveBeenCalledWith(signal);
      expect(removeContainer).toHaveBeenCalledWith(plan.containerName);
      child.current?.emit('close', null, signal);
      expect(await result).toBe(signal === 'SIGTERM' ? 143 : 129);
      expect(removeContainer).toHaveBeenCalledWith(plan.containerName);
      expect(process.listenerCount(signal)).toBe(listeners);
    },
  );

  it('should leave interactive Ctrl+C with the agent', async () => {
    const result = runContainer(plan);
    process.emit('SIGINT');
    expect(child.current?.kill).not.toHaveBeenCalled();
    child.current?.emit('close', 0, null);
    expect(await result).toBe(0);
  });

  it('should forward Ctrl+C without a terminal', async () => {
    const result = runContainer({ ...plan, tty: false });
    process.emit('SIGINT');
    expect(child.current?.kill).toHaveBeenCalledWith('SIGINT');
    child.current?.emit('close', 0, null);
    expect(await result).toBe(130);
  });

  it('should clean up and preserve spawn errors', async () => {
    const listeners = process.listenerCount('SIGTERM');
    const result = runContainer(plan);
    const error = new Error('spawn failed');
    child.current?.emit('error', error);
    await expect(result).rejects.toThrow(error);
    expect(removeContainer).toHaveBeenCalledWith(plan.containerName);
    expect(process.listenerCount('SIGTERM')).toBe(listeners);
  });
});
