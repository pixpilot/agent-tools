import type { AgentAuthConfig, AgentLaunchOptions } from '../types';
import { AgentAdapter } from './agent-adapter';

/** OpenAI Codex CLI. */
export class CodexAgent extends AgentAdapter {
  readonly id = 'codex';
  readonly label = 'OpenAI Codex';
  readonly binary = 'codex';
  readonly installCommand = 'npm install -g @openai/codex@latest';
  override readonly stateDirs = ['.codex'];

  readonly auth: AgentAuthConfig = {
    probe: 'test -s "$HOME/.codex/auth.json"',
    loginCommand: 'codex login --device-auth',
    hint: 'Enable device-code login in your ChatGPT security settings or workspace permissions, then follow the printed link and code.',
  };

  launchCommand({ fullAccess, extraArgs }: AgentLaunchOptions): string {
    return this.buildCommand(
      ['codex', fullAccess ? '--dangerously-bypass-approvals-and-sandbox' : undefined],
      extraArgs,
    );
  }

  // Codex reads ~/.codex/AGENTS.md, which the sync utility writes directly.
  override postSyncCommand(): string {
    return [
      'mkdir -p "$HOME/.agents/skills" "$HOME/.codex"',
      'rm -rf "$HOME/.codex/skills"',
      'ln -s "$HOME/.agents/skills" "$HOME/.codex/skills"',
    ].join(' && ');
  }
}
