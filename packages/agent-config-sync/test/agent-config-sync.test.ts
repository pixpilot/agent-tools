import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentConfigSnapshot,
  extractCodexMcpServers,
  getAgentConfigPaths,
  getVsCodeUserDirectory,
  inspectConfigDirectory,
  mergeConfigDirectories,
  syncAgentConfigs,
} from '../src';
import { parseCliOptions } from '../src/cli';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-sync-test-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relativePath: string, contents: string): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe('getAgentConfigPaths', () => {
  it.each([
    ['win32', ['AppData', 'Roaming', 'Code', 'User']],
    ['darwin', ['Library', 'Application Support', 'Code', 'User']],
    ['linux', ['.config', 'Code', 'User']],
  ] as const)('should resolve VS Code paths on %s', (platform, expected) => {
    expect(getVsCodeUserDirectory('/home/tester', platform)).toBe(
      path.join('/home/tester', ...expected),
    );
  });

  it('should use shared skills and agent-specific paths from one resolver', () => {
    const paths = getAgentConfigPaths('codex', {
      homeDirectory: '/home/tester',
      platform: 'linux',
    });
    expect(paths.skillsDirectory).toBe(path.join('/home/tester', '.agents', 'skills'));
    expect(paths.promptsDirectory).toBe(path.join('/home/tester', '.codex', 'prompts'));
    expect(paths.rulesFile).toBe(path.join('/home/tester', '.codex', 'AGENTS.md'));
  });
});

describe('parseCliOptions', () => {
  it('should accept portable-source and target options without external dependencies', () => {
    expect(
      parseCliOptions([
        '--configs-dir',
        './configs',
        '--home-dir',
        '/tmp/home',
        '--agent',
        'codex',
      ]),
    ).toMatchObject({
      configDirectory: './configs',
      homeDirectory: '/tmp/home',
      agents: ['codex'],
      dryRun: false,
    });
  });

  it('should reject an unknown agent or option', () => {
    expect(() => parseCliOptions(['--agent', 'cursor'])).toThrow('Unsupported agent');
    expect(() => parseCliOptions(['--skills-dir', './configs'])).toThrow(
      'Unknown option',
    );
  });
});

describe('portable config directory', () => {
  it('should inspect and overlay only recognized components', () => {
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    fs.mkdirSync(path.join(source, 'skills'), { recursive: true });
    write('source/skills/example/SKILL.md', 'skill');
    write('source/ignored.txt', 'ignored');
    write('source/mcp.jsonc', '{ "server": { "command": "npx" } }');

    expect(inspectConfigDirectory(source).available).toEqual(['skills', 'mcp']);
    mergeConfigDirectories(source, target);
    expect(fs.readFileSync(path.join(target, 'skills/example/SKILL.md'), 'utf8')).toBe(
      'skill',
    );
    expect(fs.existsSync(path.join(target, 'ignored.txt'))).toBe(false);
  });

  it('should reject a missing explicit source directory', () => {
    expect(() => inspectConfigDirectory(path.join(root, 'missing'))).toThrow(
      'does not exist',
    );
  });
});

describe('syncAgentConfigs', () => {
  it('should sync all asset types, transform prompts, and remove MCP secrets', () => {
    const source = path.join(root, 'source');
    const home = path.join(root, 'home');
    write('source/skills/reviewer/SKILL.md', 'review');
    write('source/prompts/review.prompt.md', 'prompt');
    write(
      'source/mcp.jsonc',
      `// comment\n{ "files": { "command": "npx", "args": ["-y", "server", "--token", "secret"], "url": "https://example.test/mcp?token=secret", "headers": { "Authorization": "Bearer secret" }, "env": { "TOKEN": "secret" }, "apiKey": "secret" } }`,
    );
    write('source/GLOBAL-AI-RULES.md', 'Always be concise.');
    write(
      'home/.codex/config.toml',
      'model = "gpt-5"\n\n[mcp_servers.old]\ncommand = "old"\n',
    );
    write('home/.claude.json', '{ "theme": "dark" }');
    write('home/.claude/CLAUDE.md', 'Personal note');

    const result = syncAgentConfigs({
      configDirectory: source,
      agents: ['claude', 'codex', 'copilot'],
      homeDirectory: home,
      platform: 'linux',
    });

    expect(result.skipped).toEqual([]);
    expect(
      fs.readFileSync(path.join(home, '.agents/skills/reviewer/SKILL.md'), 'utf8'),
    ).toBe('review');
    expect(fs.readFileSync(path.join(home, '.claude/commands/review.md'), 'utf8')).toBe(
      'prompt',
    );
    expect(fs.readFileSync(path.join(home, '.codex/prompts/review.md'), 'utf8')).toBe(
      'prompt',
    );
    expect(
      fs.readFileSync(
        path.join(home, '.config/Code/User/prompts/review.prompt.md'),
        'utf8',
      ),
    ).toBe('prompt');

    const claude = JSON.parse(
      fs.readFileSync(path.join(home, '.claude.json'), 'utf8'),
    ) as {
      mcpServers: { files: Record<string, unknown> };
      theme: string;
    };
    expect(claude.theme).toBe('dark');
    expect(claude.mcpServers.files).toMatchObject({
      command: 'npx',
      args: ['-y', 'server'],
      url: 'https://example.test/mcp',
    });
    expect(claude.mcpServers.files).not.toHaveProperty('env');
    expect(claude.mcpServers.files).not.toHaveProperty('apiKey');
    expect(claude.mcpServers.files).not.toHaveProperty('headers');

    const codex = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
    expect(codex).toContain('model = "gpt-5"');
    expect(codex).toContain('[mcp_servers."files"]');
    expect(codex).not.toContain('mcp_servers.old');
    expect(codex).not.toContain('secret');
    expect(fs.readFileSync(path.join(home, '.claude/CLAUDE.md'), 'utf8')).toContain(
      'Personal note',
    );
    expect(fs.readFileSync(path.join(home, '.claude/CLAUDE.md'), 'utf8')).toContain(
      'Always be concise.',
    );
  });

  it('should remove stale managed skill entries without deleting user-owned entries', () => {
    const source = path.join(root, 'source');
    const home = path.join(root, 'home');
    write('source/skills/current/SKILL.md', 'current');
    const skillDirectory = path.join(home, '.agents/skills');
    write('home/.agents/skills/stale/SKILL.md', 'stale');
    write(
      'home/.agents/skills/.agent-config-sync.json',
      JSON.stringify({ entries: ['stale'] }),
    );
    write('home/.agents/skills/manual/SKILL.md', 'manual');

    syncAgentConfigs({ configDirectory: source, agents: ['codex'], homeDirectory: home });

    expect(fs.existsSync(path.join(skillDirectory, 'stale'))).toBe(false);
    expect(fs.readFileSync(path.join(skillDirectory, 'manual/SKILL.md'), 'utf8')).toBe(
      'manual',
    );
  });

  it('should apply a portable startup timeout to every supported client', () => {
    const source = path.join(root, 'source');
    const home = path.join(root, 'home');
    write(
      'source/mcp.jsonc',
      '{ "$defaults": { "startupTimeoutSec": 120 }, "files": { "command": "npx", "args": ["-y", "server"] } }',
    );
    write('home/.claude/settings.json', '{ "theme": "dark" }');

    syncAgentConfigs({
      configDirectory: source,
      agents: ['claude', 'codex', 'copilot'],
      homeDirectory: home,
      platform: 'linux',
    });

    const claudeSettings = JSON.parse(
      fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'),
    ) as { env: { MCP_TIMEOUT: string }; theme: string };
    expect(claudeSettings).toMatchObject({
      env: { MCP_TIMEOUT: '120000' },
      theme: 'dark',
    });

    const codex = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
    expect(codex).toContain('startup_timeout_sec = 120');
    expect(codex).not.toContain('mcp_optional_startup_grace_ms');

    const copilot = JSON.parse(
      fs.readFileSync(path.join(home, '.copilot/mcp-config.json'), 'utf8'),
    ) as { mcpServers: { files: { timeout: number } } };
    expect(copilot.mcpServers.files.timeout).toBe(120000);
  });

  it('should ignore JSON Schema metadata when syncing MCP servers', () => {
    const source = path.join(root, 'source');
    const home = path.join(root, 'home');
    write(
      'source/mcp.jsonc',
      '{ "$schema": "https://example.test/mcp.schema.json", "files": { "command": "npx" } }',
    );

    syncAgentConfigs({ configDirectory: source, agents: ['codex'], homeDirectory: home });

    const codex = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
    expect(codex).toContain('[mcp_servers."files"]');
    expect(codex).not.toContain('mcp_servers."$schema"');
  });

  it('should forward the sandbox proxy and npm cache to every Codex MCP server', () => {
    const source = path.join(root, 'source');
    const home = path.join(root, 'home');
    vi.stubEnv('HTTP_PROXY', 'http://sandbox-proxy:8888');
    vi.stubEnv('HTTPS_PROXY', 'http://sandbox-proxy:8888');
    vi.stubEnv('NO_PROXY', 'localhost,127.0.0.1');
    vi.stubEnv('NODE_USE_ENV_PROXY', '1');
    vi.stubEnv('NPM_CONFIG_CACHE', '/cache/npm');
    write(
      'source/mcp.jsonc',
      '{ "files": { "command": "npx", "args": ["-y", "server"] } }',
    );

    syncAgentConfigs({ configDirectory: source, agents: ['codex'], homeDirectory: home });

    const codex = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
    expect(codex).toContain('"HTTP_PROXY" = "http://sandbox-proxy:8888"');
    expect(codex).toContain('"HTTPS_PROXY" = "http://sandbox-proxy:8888"');
    expect(codex).toContain('"NO_PROXY" = "localhost,127.0.0.1"');
    expect(codex).toContain('"NODE_USE_ENV_PROXY" = "1"');
    expect(codex).toContain('"NPM_CONFIG_CACHE" = "/cache/npm"');
  });

  it('should omit the Codex env table outside a proxied sandbox', () => {
    const source = path.join(root, 'source');
    const home = path.join(root, 'home');
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NPM_CONFIG_CACHE']) {
      vi.stubEnv(key, '');
    }
    vi.stubEnv('NODE_USE_ENV_PROXY', '');
    write(
      'source/mcp.jsonc',
      '{ "files": { "command": "npx", "args": ["-y", "server"] } }',
    );

    syncAgentConfigs({ configDirectory: source, agents: ['codex'], homeDirectory: home });

    expect(fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8')).not.toContain(
      'env =',
    );
  });

  it('should drop a pinned optional startup grace left by an earlier sync', () => {
    const source = path.join(root, 'source');
    const home = path.join(root, 'home');
    write('source/mcp.jsonc', '{ "files": { "command": "npx" } }');
    write(
      'home/.codex/config.toml',
      'mcp_optional_startup_grace_ms = 0\n\nmodel = "gpt-5"\n\n[tui]\nmcp_optional_startup_grace_ms = 0\n',
    );

    syncAgentConfigs({ configDirectory: source, agents: ['codex'], homeDirectory: home });

    const codex = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8');
    // The pin and the blank line under it are gone, so the file now opens with model.
    expect(codex).toMatch(/^model = "gpt-5"/u);
    // Only the top-level pin is ours to remove; a table's own key stays put.
    expect(codex).toContain('[tui]\nmcp_optional_startup_grace_ms = 0');
  });
});

describe('createAgentConfigSnapshot', () => {
  it('should copy only selected agent configuration and strip credentials', () => {
    const home = path.join(root, 'home');
    write('home/.agents/skills/reviewer/SKILL.md', 'review');
    write('home/.agents/skills/reviewer/.env', 'TOKEN=must-not-copy');
    write(
      'home/.agents/skills/reviewer/credentials.json',
      '{ "token": "must-not-copy" }',
    );
    write('home/.agents/skills/reviewer/api-key.txt', 'must-not-copy');
    write('home/.codex/prompts/plan.md', 'plan');
    write(
      'home/.codex/AGENTS.md',
      '<!-- GLOBAL-AI-RULES:START -->\nBe terse.\n<!-- GLOBAL-AI-RULES:END -->',
    );
    write(
      'home/.codex/config.toml',
      '[mcp_servers.local]\ncommand = "npx"\nargs = ["-y", "local"]\nenv = { TOKEN = "secret" }\nheaders = { Authorization = "Bearer must-not-copy" }\n',
    );
    write('home/.codex/auth.json', '{ "token": "must-not-copy" }');
    write('home/.claude/commands/other.md', 'not selected');

    const snapshot = createAgentConfigSnapshot('codex', {
      homeDirectory: home,
      platform: 'linux',
    });
    try {
      expect(snapshot.available).toEqual(['skills', 'prompts', 'mcp', 'rules']);
      expect(
        fs.readFileSync(path.join(snapshot.path, 'prompts/plan.prompt.md'), 'utf8'),
      ).toBe('plan');
      expect(
        fs.readFileSync(path.join(snapshot.path, 'mcp.jsonc'), 'utf8'),
      ).not.toContain('secret');
      expect(fs.existsSync(path.join(snapshot.path, 'auth.json'))).toBe(false);
      expect(fs.existsSync(path.join(snapshot.path, 'skills/reviewer/.env'))).toBe(false);
      expect(
        fs.existsSync(path.join(snapshot.path, 'skills/reviewer/credentials.json')),
      ).toBe(false);
      expect(fs.existsSync(path.join(snapshot.path, 'skills/reviewer/api-key.txt'))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(snapshot.path, 'prompts/other.prompt.md'))).toBe(
        false,
      );
    } finally {
      snapshot.cleanup();
    }
  });

  it('should parse quoted Codex server names and common values', () => {
    expect(
      extractCodexMcpServers(
        '[mcp_servers."local tools"]\ncommand = "npx"\nargs = ["-y", "tool"]\n',
      ),
    ).toEqual({ 'local tools': { command: 'npx', args: ['-y', 'tool'] } });
  });
});
