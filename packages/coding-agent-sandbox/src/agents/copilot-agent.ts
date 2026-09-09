import type { AgentAuthConfig, AgentLaunchOptions } from '../types';
import { AgentAdapter } from './agent-adapter';

/** GitHub Copilot CLI. */
export class CopilotAgent extends AgentAdapter {
  readonly id = 'copilot';
  readonly label = 'GitHub Copilot CLI';
  readonly binary = 'copilot';
  readonly installCommand = 'npm install -g @github/copilot@latest';
  // github.com serves the device-flow login; api.githubcopilot.com the completions.
  override readonly egressHosts = [
    'api.github.com',
    'api.githubcopilot.com',
    'github.com',
  ];

  override readonly stateDirs = ['.copilot', '.config/github-copilot'];

  readonly auth: AgentAuthConfig = {
    probe:
      'test -s "$HOME/.copilot/config.json" || test -s "$HOME/.config/github-copilot/apps.json"',
    hint: 'Run /login inside Copilot CLI to sign in with your GitHub Copilot subscription.',
  };

  launchCommand(options: AgentLaunchOptions): string {
    return this.buildCommand(
      ['copilot', options.fullAccess ? '--allow-all-tools' : undefined],
      options,
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
