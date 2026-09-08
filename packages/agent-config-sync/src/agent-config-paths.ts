import type { AgentConfigPaths, AgentId } from './types';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/** Resolves the one shared skills location used by every supported agent. */
export function getSharedSkillsDirectory(homeDirectory: string = os.homedir()): string {
  return path.join(homeDirectory, '.agents', 'skills');
}

/** Resolves VS Code's user configuration directory on every supported OS. */
export function getVsCodeUserDirectory(
  homeDirectory: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return path.join(homeDirectory, 'AppData', 'Roaming', 'Code', 'User');
  }

  if (platform === 'darwin') {
    return path.join(homeDirectory, 'Library', 'Application Support', 'Code', 'User');
  }

  return path.join(homeDirectory, '.config', 'Code', 'User');
}

/**
 * Centralizes every host and container configuration target. Consumers pass a
 * different home directory instead of reimplementing OS-specific paths.
 */
export function getAgentConfigPaths(
  agent: AgentId,
  options: {
    homeDirectory?: string | undefined;
    platform?: NodeJS.Platform | undefined;
  } = {},
): AgentConfigPaths {
  const homeDirectory = options.homeDirectory ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const skillsDirectory = getSharedSkillsDirectory(homeDirectory);

  if (agent === 'claude') {
    return {
      skillsDirectory,
      promptsDirectory: path.join(homeDirectory, '.claude', 'commands'),
      mcpFile: path.join(homeDirectory, '.claude.json'),
      rulesFile: path.join(homeDirectory, '.claude', 'CLAUDE.md'),
    };
  }

  if (agent === 'codex') {
    return {
      skillsDirectory,
      promptsDirectory: path.join(homeDirectory, '.codex', 'prompts'),
      mcpFile: path.join(homeDirectory, '.codex', 'config.toml'),
      rulesFile: path.join(homeDirectory, '.codex', 'AGENTS.md'),
    };
  }

  const vscodeUserDirectory = getVsCodeUserDirectory(homeDirectory, platform);
  return {
    skillsDirectory,
    promptsDirectory: path.join(vscodeUserDirectory, 'prompts'),
    mcpFile: path.join(vscodeUserDirectory, 'mcp.json'),
    rulesFile: path.join(
      vscodeUserDirectory,
      'prompts',
      'global-ai-rules.instructions.md',
    ),
  };
}
