import type { AgentId } from '@pixpilot/agent-config-sync';
import type { AgentAdapter } from '../agents/agent-adapter';
import type { ReasoningEffort } from '../agents/reasoning-effort';
import type { AgentSettings, ModelChoice } from '../configs/read-agent-settings';
import type { NetworkMode } from '../network/network-mode';
import type { RawCliOptions } from './resolve-cli-options';
import { confirm, input, select } from '@inquirer/prompts';
import { getAgent, listAgents } from '../agents/agent-registry';
import { parseModelSpec } from '../agents/parse-model-spec';
import { KNOWN_EFFORTS } from '../agents/reasoning-effort';
import { readAgentSettings } from '../configs/read-agent-settings';
import { DEFAULT_AGENT } from '../constants';
import { DEFAULT_NETWORK_MODE } from '../network/network-mode';
import { detectDefaultRepo } from './detect-default-repo';
import { resolveInitialPrompt } from './resolve-initial-prompt';

/** What the guided setup decided to do. */
export type WizardResult =
  | { action: 'prune' }
  | { action: 'session'; options: RawCliOptions };

/** Answer that leaves the choice to `agents.jsonc` and the agent's own default. */
const AGENT_DEFAULT = '';

/**
 * Collects only missing session settings. Command-line values are preserved and
 * the answers take the same defaulting path as a non-interactive invocation.
 */
export async function runWizard(initial: RawCliOptions = {}): Promise<WizardResult> {
  const prompt = resolveInitialPrompt(initial);
  const { prompt: _prompt, promptFile: _promptFile, ...rest } = initial;
  const resolvedInitial: RawCliOptions = {
    ...rest,
    ...(prompt == null ? {} : { prompt }),
  };
  const requestedMode = resolveRequestedMode(resolvedInitial);
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
    resolvedInitial.agent ??
    (await select({
      message: 'Which coding agent should run this task?',
      choices: listAgents().map((candidate) => ({
        name: candidate.label,
        value: candidate.id,
      })),
      default: DEFAULT_AGENT,
    }));

  // An initial prompt makes the agent start work the moment it opens, so the
  // guided setup is the last chance to choose how it runs. Anything already
  // given on the command line is left alone.
  const { effort, model } = await askModelSettings(agent, resolvedInitial);

  const requestedRepo = resolvedInitial.repo?.trim();
  const repo =
    requestedRepo != null && requestedRepo !== ''
      ? requestedRepo
      : await input({
          message: 'Main Git repository path',
          default: detectDefaultRepo(),
          required: true,
        });

  const requestedTask = resolvedInitial.task?.trim();
  const task =
    requestedTask != null && requestedTask !== ''
      ? requestedTask
      : await input({
          message: 'Task name (used for the ai/<agent>/<task> branch and the worktree)',
          required: true,
        });

  const fullAccess =
    resolvedInitial.fullAccess ??
    (await confirm({
      message:
        'Let the agent act without approval prompts? (mounted data remains writable)',
      default: true,
    }));

  const gitMount =
    resolvedInitial.gitMount ??
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
      ...resolvedInitial,
      agent,
      repo,
      task,
      fullAccess,
      gitMount,
      network,
      ...(model == null ? {} : { model }),
      ...(effort == null ? {} : { effort }),
    },
  };
}

/**
 * Asks for the model and the reasoning effort the command line left open, but
 * only when an initial prompt will start the session unattended. Either answer
 * may stay unset, in which case `agents.jsonc` still applies.
 */
async function askModelSettings(
  agentId: string,
  initial: RawCliOptions,
): Promise<{ model?: string | undefined; effort?: ReasoningEffort | undefined }> {
  if ((initial.prompt?.trim() ?? '') === '') {
    return {};
  }

  const agent = getAgent(agentId);
  const settings = readAgentSettings(initial.configsDir, agent.id as AgentId);
  const model = initial.model ?? (await askModel(settings));
  // `--model gpt-x:high` already carries an effort, so asking again would be noise.
  const spec = parseModelSpec(model);
  const effort =
    initial.effort ?? spec.effort ?? (await askEffort(agent, settings, spec.model));

  return {
    ...(model == null ? {} : { model }),
    ...(effort == null ? {} : { effort }),
  };
}

async function askModel(settings: AgentSettings): Promise<string | undefined> {
  const choices = modelChoices(settings);

  if (choices.length === 0) {
    const answer = (
      await input({ message: 'Model (blank for the agent default)' })
    ).trim();
    return answer === '' ? undefined : answer;
  }

  const answer = await select({
    message: 'Which model should the agent use?',
    choices: [
      ...choices.map((choice) => ({
        name: choice.label ?? choice.name,
        value: choice.name,
      })),
      { name: 'Agent default', value: AGENT_DEFAULT },
    ],
    default: settings.model ?? AGENT_DEFAULT,
  });

  return answer === AGENT_DEFAULT ? undefined : answer;
}

async function askEffort(
  agent: AgentAdapter,
  settings: AgentSettings,
  model: string | undefined,
): Promise<ReasoningEffort | undefined> {
  // Asking an agent without the setting would only produce an ignored answer.
  if (!agent.supportsEffort) {
    return undefined;
  }

  const entry = modelChoices(settings).find((choice) => choice.name === model);
  // Only `agents.jsonc` knows what this model accepts; the shorthand levels are
  // a serviceable guess when it says nothing.
  const levels = entry?.efforts ?? KNOWN_EFFORTS;
  const answer = await select({
    message: `How much reasoning effort should ${agent.label} use?`,
    choices: [
      ...levels.map((level) => ({ name: level, value: String(level) })),
      { name: 'Agent default', value: AGENT_DEFAULT },
    ],
    default: entry?.effort ?? settings.effort ?? AGENT_DEFAULT,
  });

  return answer === AGENT_DEFAULT ? undefined : answer;
}

/** The picker entries, with the configured default first when it is not listed. */
function modelChoices(settings: AgentSettings): readonly ModelChoice[] {
  const listed = settings.models ?? [];

  if (settings.model == null || listed.some((choice) => choice.name === settings.model)) {
    return listed;
  }

  return [
    {
      name: settings.model,
      ...(settings.effort == null ? {} : { effort: settings.effort }),
    },
    ...listed,
  ];
}

/** The mode already chosen on the command line, including the `--offline` alias. */
function resolveRequestedMode(initial: RawCliOptions): NetworkMode | undefined {
  return initial.offline === true ? 'none' : initial.network;
}
