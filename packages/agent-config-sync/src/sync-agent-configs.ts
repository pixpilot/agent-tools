import type { AgentId, SyncAgentConfigsOptions, SyncAgentConfigsResult } from './types';
import { getAgentConfigPaths } from './agent-config-paths';
import { findConfigComponent, inspectConfigDirectory } from './config-directory';
import { syncManagedDirectory } from './sync-directory';
import { syncMcps } from './sync-mcps';
import { syncPrompts } from './sync-prompts';
import { syncRules } from './sync-rules';
import { CONFIG_COMPONENTS } from './types';

const DEFAULT_AGENTS: readonly AgentId[] = ['claude', 'codex', 'copilot'];

/** Synchronizes portable assets to one or all installed agent configuration targets. */
export function syncAgentConfigs(
  options: SyncAgentConfigsOptions,
): SyncAgentConfigsResult {
  const source = inspectConfigDirectory(options.configDirectory);
  const agents =
    options.agents?.length === 0 || options.agents == null
      ? DEFAULT_AGENTS
      : options.agents;
  const copied: string[] = [];

  const skillsSource = findConfigComponent(source.path, 'skills');
  if (skillsSource != null) {
    copied.push(
      ...syncManagedDirectory(
        skillsSource,
        getAgentConfigPaths(agents[0] as AgentId, options).skillsDirectory,
      ),
    );
  }

  for (const agent of agents) {
    const target = getAgentConfigPaths(agent, options);
    const promptsSource = findConfigComponent(source.path, 'prompts');
    if (promptsSource != null)
      copied.push(...syncPrompts(promptsSource, target.promptsDirectory, agent));

    const mcpSource = findConfigComponent(source.path, 'mcp');
    if (mcpSource != null) copied.push(syncMcps(mcpSource, target.mcpFile, agent));

    const rulesSource = findConfigComponent(source.path, 'rules');
    if (rulesSource != null)
      copied.push(syncRules(rulesSource, target.rulesFile, agent === 'copilot'));
  }

  return {
    copied,
    skipped: CONFIG_COMPONENTS.filter(
      (component) => !source.available.includes(component),
    ),
  };
}
