import type { NetworkMode } from '../network/network-mode';
import type { RawCliOptions } from './resolve-cli-options';
import { confirm, input, select } from '@inquirer/prompts';
import { listAgents } from '../agents/agent-registry';
import { DEFAULT_AGENT } from '../constants';
import { DEFAULT_NETWORK_MODE } from '../network/network-mode';
import { detectDefaultRepo } from './detect-default-repo';

/** What the guided setup decided to do. */
export type WizardResult =
  | { action: 'prune' }
  | { action: 'session'; options: RawCliOptions };

/**
 * Collects only missing session settings. Command-line values are preserved and
 * the answers take the same defaulting path as a non-interactive invocation.
 */
export async function runWizard(initial: RawCliOptions = {}): Promise<WizardResult> {
  const requestedMode = resolveRequestedMode(initial);
  const action =
    requestedMode ??
    (await select<NetworkMode | 'prune'>({
      message: 'What would you like to do?',
      choices: [
        {
          name: 'Start a session (strict: provider and package registries only)',
          value: 'strict',
        },
        {
          name: 'Start a session with open network access (every hostname is logged)',
          value: 'open',
        },
        {
          name: 'Start with no network (installed CLI/image required; cloud agents cannot connect)',
          value: 'none',
        },
        {
          name: 'Prune unused dependency/cache volumes (asks before deleting)',
          value: 'prune',
        },
      ],
      default: DEFAULT_NETWORK_MODE,
    }));

  if (action === 'prune') {
    return { action: 'prune' };
  }

  const network: NetworkMode = action;

  const agent =
    initial.agent ??
    (await select({
      message: 'Which coding agent should run this task?',
      choices: listAgents().map((candidate) => ({
        name: candidate.label,
        value: candidate.id,
      })),
      default: DEFAULT_AGENT,
    }));

  const requestedRepo = initial.repo?.trim();
  const repo =
    requestedRepo != null && requestedRepo !== ''
      ? requestedRepo
      : await input({
          message: 'Main Git repository path',
          default: detectDefaultRepo(),
          required: true,
        });

  const requestedTask = initial.task?.trim();
  const task =
    requestedTask != null && requestedTask !== ''
      ? requestedTask
      : await input({
          message: 'Task name (used for the ai/<agent>/<task> branch and the worktree)',
          required: true,
        });

  const requestedPrompt = initial.prompt?.trim();
  const prompt =
    requestedPrompt != null && requestedPrompt !== ''
      ? initial.prompt ?? ''
      : await input({
          message: 'Initial prompt for the agent (optional)',
        });

  const fullAccess =
    initial.fullAccess ??
    (await confirm({
      message:
        'Let the agent act without approval prompts? (mounted data remains writable)',
      default: true,
    }));

  const gitMount =
    initial.gitMount ??
    (await select({
      message: 'Enable isolated Git history and commits inside the container?',
      choices: [
        {
          name: 'Enable Git with private metadata (commits are imported on exit)',
          value: true,
        },
        {
          name: 'Disable Git inside the container',
          value: false,
        },
      ],
      default: true,
    }));

  return {
    action: 'session',
    options: {
      ...initial,
      ...(prompt.trim() === '' ? {} : { prompt }),
      agent,
      repo,
      task,
      fullAccess,
      gitMount,
      network,
    },
  };
}

/** The mode already chosen on the command line, including the `--offline` alias. */
function resolveRequestedMode(initial: RawCliOptions): NetworkMode | undefined {
  return initial.offline === true ? 'none' : initial.network;
}
