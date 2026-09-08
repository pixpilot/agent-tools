/** Supported coding-agent configuration targets. */
export const AGENT_IDS = ['claude', 'codex', 'copilot'] as const;

/** A coding agent supported by the config synchronizer. */
export type AgentId = (typeof AGENT_IDS)[number];

/** Portable configuration components a source directory can provide. */
export const CONFIG_COMPONENTS = ['skills', 'prompts', 'mcp', 'rules'] as const;

/** A portable configuration component. */
export type ConfigComponent = (typeof CONFIG_COMPONENTS)[number];

/** Home-relative destinations used by a supported agent. */
export interface AgentConfigPaths {
  skillsDirectory: string;
  promptsDirectory: string;
  mcpFile: string;
  rulesFile: string;
}

/** The available configuration assets in a portable source directory. */
export interface ConfigDirectoryInfo {
  path: string;
  available: readonly ConfigComponent[];
}

/** Inputs that control a configuration sync. */
export interface SyncAgentConfigsOptions {
  configDirectory: string;
  agents?: readonly AgentId[] | undefined;
  homeDirectory?: string | undefined;
  platform?: NodeJS.Platform | undefined;
}

/** Files changed by one configuration sync. */
export interface SyncAgentConfigsResult {
  copied: readonly string[];
  skipped: readonly ConfigComponent[];
}

/** A temporary, sanitized snapshot of an installed agent configuration. */
export interface ConfigSnapshot extends ConfigDirectoryInfo {
  /** Removes the temporary snapshot directory. */
  cleanup: () => void;
}
