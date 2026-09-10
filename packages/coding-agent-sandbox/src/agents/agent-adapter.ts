import type { AgentAuthConfig, AgentLaunchOptions } from '../types';
import type { ReasoningEffort } from './reasoning-effort';

/**
 * Contract every coding agent implements. Adding an agent means adding one
 * subclass and registering it - nothing else in the CLI needs to change.
 */
export abstract class AgentAdapter {
  /** Stable id used in branch names, volume names and `--agent`. */
  abstract readonly id: string;
  /** Human-readable name shown in prompts and logs. */
  abstract readonly label: string;
  /** Executable name inside the container, used to skip redundant installs. */
  abstract readonly binary: string;
  /** Shell command that installs the agent CLI inside the container. */
  abstract readonly installCommand: string;
  /** How the agent proves it is signed in. */
  abstract readonly auth: AgentAuthConfig;

  /**
   * Provider hosts this agent must reach in `strict` network mode, including
   * its OAuth login flow. Signing in reaches more hosts than a running session,
   * so verify these in `open` mode against a fresh, unauthenticated volume.
   */
  readonly egressHosts: readonly string[] = [];

  /** Home-relative directories persisted in the agent's Docker auth volume. */
  readonly stateDirs: readonly string[] = [];
  /** Home-relative files persisted in the agent's Docker auth volume. */
  readonly stateFiles: readonly string[] = [];

  /** Shell command that launches the agent interactively in `/workspace`. */
  abstract launchCommand(options: AgentLaunchOptions): string;

  /** Shell command run after config sync, e.g. to link the shared skills directory. */
  postSyncCommand(): string {
    return '';
  }

  /**
   * Flags that select the reasoning effort, or `undefined` when this agent's
   * CLI has no equivalent. Most spell it `--effort`, but not all, so it cannot
   * be passed straight through the way `--model` is.
   */
  effortArgs(_effort: ReasoningEffort): string | undefined {
    return undefined;
  }

  /** True when this agent has a reasoning-effort setting to map onto. */
  get supportsEffort(): boolean {
    return this.effortArgs('medium') != null;
  }

  /** Docker volume holding this agent's credentials and settings. */
  get authVolume(): string {
    return `coding-agent-sandbox-auth-${this.id}`;
  }

  /** Segment used in the `ai/<segment>/<task>` branch name. */
  get branchSegment(): string {
    return this.id;
  }

  /** Joins the base command with trusted flags and a safely quoted initial prompt. */
  protected buildCommand(
    parts: Array<string | undefined>,
    { effort, extraArgs, model, prompt }: AgentLaunchOptions,
  ): string {
    const initialPrompt = prompt?.trim();
    const selectedModel = model?.trim();

    return [
      ...parts,
      // Every supported CLI spells this the same way; the name itself is
      // agent-specific and passed through untouched.
      selectedModel == null || selectedModel === ''
        ? undefined
        : `--model ${quoteShellArgument(selectedModel)}`,
      // Silently dropped when the agent has no effort flag; `runSandbox` warns.
      effort == null ? undefined : this.effortArgs(effort),
      extraArgs,
      // The prompt is positional, so one starting with `-` is parsed as an
      // unknown flag; `--` ends option parsing before it is read.
      initialPrompt?.startsWith('-') === true ? '--' : undefined,
      initialPrompt == null || initialPrompt === ''
        ? undefined
        : quoteShellArgument(initialPrompt),
    ]
      .filter((part): part is string => part != null && part.trim() !== '')
      .join(' ');
  }
}

/** Wraps a value in single quotes so the container shell treats it as one literal argument. */
export function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
