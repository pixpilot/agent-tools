import type { AgentAuthConfig, AgentLaunchOptions } from '../types';
import { AgentAdapter } from './agent-adapter';

/** GitHub Copilot CLI. */
export class CopilotAgent extends AgentAdapter {
  readonly id = 'copilot';
  readonly label = 'GitHub Copilot CLI';
  readonly binary = 'copilot';
  readonly installCommand = 'npm install -g @github/copilot@latest';
  override readonly stateDirs = ['.copilot', '.config/github-copilot'];

  readonly auth: AgentAuthConfig = {
    probe:
      'test -s "$HOME/.copilot/config.json" || test -s "$HOME/.config/github-copilot/apps.json"',
    hint: 'Run /login inside Copilot CLI to sign in with your GitHub Copilot subscription.',
  };

  launchCommand({ fullAccess, extraArgs }: AgentLaunchOptions): string {
    return this.buildCommand(
      ['copilot', fullAccess ? '--allow-all-tools' : undefined],
      extraArgs,
    );
  }

  override postSyncCommand(): string {
    return [
      'mkdir -p "$HOME/.agents/skills" "$HOME/.copilot"',
      'rm -rf "$HOME/.copilot/skills"',
      'ln -s "$HOME/.agents/skills" "$HOME/.copilot/skills"',
    ].join(' && ');
  }
}
