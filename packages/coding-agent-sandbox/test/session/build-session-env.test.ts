import type { SandboxOptions, SkillsInfo } from '../../src/types';
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

const skills: SkillsInfo = { path: path.resolve('skills'), syncCommand: 'npm run sync' };

function makeOptions(overrides: Partial<SandboxOptions> = {}): SandboxOptions {
  return {
    agent: 'claude',
    repo: repository.root,
    task: 'Fix resume',
    fullAccess: true,
    install: true,
    skills: true,
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

function build(
  overrides: Partial<SandboxOptions> = {},
  agentId = 'claude',
  skillsInfo = skills,
) {
  return buildSessionEnv({
    agent: getAgent(agentId),
    environment: new NodeEnvironment(),
    repository,
    worktree,
    skills: skillsInfo,
    options: makeOptions({ agent: agentId, ...overrides }),
  });
}

describe('buildSessionEnv', () => {
  it('should disable provisioning and dependency installation offline', () => {
    const env = build({ network: 'none' });
    expect(env['SANDBOX_OFFLINE']).toBe('1');
    expect(env['SANDBOX_SKILLS_ENABLED']).toBe('0');
    expect(env['SANDBOX_DEPS_INSTALL']).toBeUndefined();
  });
  it('should describe the agent the entrypoint has to launch', () => {
    const env = build();

    expect(env['SANDBOX_AGENT_BIN']).toBe('claude');
    expect(env['SANDBOX_AGENT_CMD']).toBe('claude --dangerously-skip-permissions');
    expect(env['SANDBOX_AUTH_VOLUME']).toBe('coding-agent-sandbox-auth-claude');
  });

  it('should drop the unattended flag when full access is refused', () => {
    expect(build({ fullAccess: false })['SANDBOX_AGENT_CMD']).toBe('claude');
  });

  it('should pass the agent state paths as newline-separated lists', () => {
    const env = build();

    expect(env['SANDBOX_STATE_DIRS']).toBe('.claude');
    expect(env['SANDBOX_STATE_FILES']).toBe('.claude.json');
  });

  it('should only set a login command for agents that have one', () => {
    expect(build({}, 'codex')['SANDBOX_LOGIN_CMD']).toBe('codex login --device-auth');
    expect(build()['SANDBOX_LOGIN_CMD']).toBeUndefined();
  });

  it('should include the skills sync command and seed placeholders', () => {
    const env = build();

    expect(env['SANDBOX_SKILLS_SYNC_CMD']).toBe('npm run sync');
    expect(env['SANDBOX_SEED_JSON']).toContain('.claude.json');
    expect(env['SANDBOX_SEED_EMPTY']).toContain('.codex/config.toml');
  });

  it('should add extra seed files requested on the command line', () => {
    expect(build({ seedFiles: ['.config/extra.json'] })['SANDBOX_SEED_JSON']).toContain(
      '.config/extra.json',
    );
  });

  it('should disable skills provisioning when asked', () => {
    expect(build({ skills: false })['SANDBOX_SKILLS_ENABLED']).toBe('0');
  });

  it('should disable skills provisioning when it was skipped in the setup prompt', () => {
    expect(
      build({}, 'claude', { ...skills, disabled: true })['SANDBOX_SKILLS_ENABLED'],
    ).toBe('0');
  });

  it('should install project dependencies only when enabled', () => {
    expect(build()['SANDBOX_DEPS_INSTALL']).toBe('ni');
    expect(build({ install: false })['SANDBOX_DEPS_INSTALL']).toBeUndefined();
  });

  it('should steer Git at the private session directory', () => {
    const env = build();

    expect(env['GIT_DIR']).toBe('/repo/.git');
    expect(env['GIT_WORK_TREE']).toBe('/workspace');
  });

  it('should leave Git unconfigured when the .git mount is disabled', () => {
    const env = build({ gitMount: false });

    expect(env['GIT_DIR']).toBeUndefined();
    expect(env['GIT_WORK_TREE']).toBeUndefined();
  });

  it('should never leak host credentials or home paths into the container', () => {
    const values = Object.values(build()).join(' ');

    expect(values).not.toContain(repository.root);
    expect(values.toLowerCase()).not.toContain('.ssh');
    expect(values).not.toContain('ANTHROPIC_API_KEY');
    expect(values).not.toContain('OPENAI_API_KEY');
  });
});
