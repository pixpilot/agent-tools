import type { ConfigSourceInfo, SandboxOptions } from '../../src/types';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { NodeEnvironment } from '../../src/environments/node-environment';
import { buildSessionEnv } from '../../src/session/build-session-env';

const repository = {
  root: path.resolve('repo'),
  gitDir: path.resolve('repo/.git'),
  name: 'repo',
  parent: path.resolve('.'),
  headRef: 'main',
};
const worktree = {
  taskSlug: 'fix-resume',
  branch: 'ai/claude/fix-resume',
  path: path.resolve('repo.worktrees/fix-resume-claude'),
  created: true,
  gitDirRelative: 'worktrees/fix-resume-claude',
};
const configs: ConfigSourceInfo = {
  path: path.resolve('configs'),
  available: ['skills'],
};

function makeOptions(overrides: Partial<SandboxOptions> = {}): SandboxOptions {
  return {
    agent: 'claude',
    repo: repository.root,
    task: 'Fix resume',
    fullAccess: true,
    install: true,
    configs: true,
    gitMount: true,
    updateAgent: false,
    rebuildImage: false,
    login: false,
    dryRun: false,
    yes: false,
    network: 'strict',
    ...overrides,
  };
}

function build(overrides: Partial<SandboxOptions> = {}, agentId = 'claude') {
  return buildSessionEnv({
    agent: getAgent(agentId),
    environment: new NodeEnvironment(),
    repository,
    worktree,
    configs,
    options: makeOptions({ agent: agentId, ...overrides }),
  });
}

describe('buildSessionEnv', () => {
  it('should disable configuration and dependency installation offline', () => {
    const env = build({ network: 'none' });
    expect(env['SANDBOX_OFFLINE']).toBe('1');
    expect(env['SANDBOX_CONFIGS_ENABLED']).toBe('0');
    expect(env['SANDBOX_DEPS_INSTALL']).toBeUndefined();
  });

  it('should describe the agent and portable source consumed by the entrypoint', () => {
    const env = build();
    expect(env['SANDBOX_AGENT_CMD']).toBe('claude --dangerously-skip-permissions');
    expect(env['SANDBOX_CONFIGS_ENABLED']).toBe('1');
    expect(env['SANDBOX_CONFIGS_SRC']).toBe('/coding-agent-sandbox/configs');
    expect(env['SANDBOX_POST_SYNC_CMD']).toContain('.agents/skills');
  });

  it('should disable configuration provisioning when asked', () => {
    expect(build({ configs: false })['SANDBOX_CONFIGS_ENABLED']).toBe('0');
  });

  it('should never leak host credentials or home paths into the container', () => {
    const values = Object.values(build()).join(' ');
    expect(values).not.toContain(repository.root);
    expect(values.toLowerCase()).not.toContain('.ssh');
    expect(values).not.toContain('OPENAI_API_KEY');
  });
});
