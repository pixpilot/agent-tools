import type { AgentAuthConfig, AgentLaunchOptions } from '../types';
import { AgentAdapter } from './agent-adapter';

/** Anthropic Claude Code. */
export class ClaudeAgent extends AgentAdapter {
  readonly id = 'claude';
  readonly label = 'Claude Code';
  readonly binary = 'claude';
  readonly installCommand = 'npm install -g @anthropic-ai/claude-code@latest';
  // console/platform/claude.ai carry the subscription OAuth flow, not the API.
  override readonly egressHosts = [
    'api.anthropic.com',
    'console.anthropic.com',
    'platform.claude.com',
    'claude.ai',
    'statsig.anthropic.com',
  ];

  override readonly stateDirs = ['.claude'];
  override readonly stateFiles = ['.claude.json'];

  readonly auth: AgentAuthConfig = {
    probe: 'test -s "$HOME/.claude/.credentials.json"',
    hint: 'Claude Code starts its OAuth login on launch - sign in with the account holding your subscription.',
  };

  launchCommand(options: AgentLaunchOptions): string {
    return this.buildCommand(
      ['claude', options.fullAccess ? '--dangerously-skip-permissions' : undefined],
      options,
    );
  }

  // The config synchronizer writes shared skills to ~/.agents/skills.
  override postSyncCommand(): string {
    return [
      'mkdir -p "$HOME/.agents/skills" "$HOME/.claude"',
      'rm -rf "$HOME/.claude/skills"',
      'ln -s "$HOME/.agents/skills" "$HOME/.claude/skills"',
    ].join(' && ');
  }
}
