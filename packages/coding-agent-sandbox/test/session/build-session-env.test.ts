import type { ConfigSourceInfo, SandboxOptions } from '../../src/types';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAgent } from '../../src/agents/agent-registry';
import { NodeEnvironment } from '../../src/environments/node-environment';
import {
  buildSessionEnv,
  installsDependencies,
} from '../../src/session/build-session-env';

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
    allowDirty: false,
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
  // Written in both states: omitting it would hand the decision back to the
  // agent's own default, which enables the gateway for claude.ai accounts.
  it('should switch the provider MCP gateway off by default', () => {
    expect(build()['ENABLE_CLAUDEAI_MCP_SERVERS']).toBe('false');
  });

  it('should switch the provider MCP gateway on when the session allows it', () => {
    expect(build({ allowProviderMcp: true })['ENABLE_CLAUDEAI_MCP_SERVERS']).toBe('true');
  });

  it('should not set a gateway variable for an agent without one', () => {
    expect(build({ allowProviderMcp: true }, 'codex')).not.toHaveProperty(
      'ENABLE_CLAUDEAI_MCP_SERVERS',
    );
  });

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

  it('should pass a safely quoted initial prompt to the agent command', () => {
    expect(build({ prompt: "Fix O'Reilly login" })['SANDBOX_AGENT_CMD']).toBe(
      "claude --dangerously-skip-permissions 'Fix O'\\''Reilly login'",
    );
  });

  it('should disable configuration provisioning when asked', () => {
    expect(build({ configs: false })['SANDBOX_CONFIGS_ENABLED']).toBe('0');
  });

  describe('npm registry auth', () => {
    const npmAuth = [
      { host: 'npm.pkg.github.com', envVar: 'GH_PACKAGES_TOKEN' },
      { host: 'npm.example.com', envVar: 'EXAMPLE_TOKEN' },
    ];

    function buildWithAuth(overrides: Partial<SandboxOptions> = {}) {
      return buildSessionEnv({
        agent: getAgent('claude'),
        environment: new NodeEnvironment(),
        repository,
        worktree,
        configs,
        options: makeOptions(overrides),
        npmAuth,
      });
    }

    it('should name each registry and its variable, never the token', () => {
      expect(buildWithAuth()['SANDBOX_NPM_AUTH']).toBe(
        'npm.pkg.github.com=GH_PACKAGES_TOKEN\nnpm.example.com=EXAMPLE_TOKEN',
      );
    });

    it.each([{ install: false }, { network: 'none' as const }])(
      'should drop registry auth when nothing is installed (%o)',
      (overrides) => {
        expect(buildWithAuth(overrides)).not.toHaveProperty('SANDBOX_NPM_AUTH');
      },
    );

    it('should omit registry auth when none was requested', () => {
      expect(build()).not.toHaveProperty('SANDBOX_NPM_AUTH');
    });
  });

  describe('installsDependencies', () => {
    it('should install only with an environment, --install and a network', () => {
      const node = new NodeEnvironment();

      expect(installsDependencies(node, { install: true, network: 'strict' })).toBe(true);
      expect(installsDependencies(node, { install: true, network: 'open' })).toBe(true);
      expect(installsDependencies(node, { install: false, network: 'strict' })).toBe(
        false,
      );
      expect(installsDependencies(node, { install: true, network: 'none' })).toBe(false);
      expect(installsDependencies(undefined, { install: true, network: 'strict' })).toBe(
        false,
      );
    });
  });

  it('should never leak host credentials or home paths into the container', () => {
    const values = Object.values(build()).join(' ');
    expect(values).not.toContain(repository.root);
    expect(values.toLowerCase()).not.toContain('.ssh');
    expect(values).not.toContain('OPENAI_API_KEY');
  });
});
