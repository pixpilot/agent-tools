import type { RawCliOptions } from './resolve-cli-options';
import { confirm, input, select } from '@inquirer/prompts';
import { listAgents } from '../agents/agent-registry';
import { DEFAULT_AGENT, DEFAULT_SKILLS_DIR } from '../constants';
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
  const action = initial.offline
    ? 'offline'
    : await select({
        message: 'What would you like to do?',
        choices: [
          { name: 'Start a session with internet access', value: 'online' },
          {
            name: 'Start offline (installed CLI/image required; cloud agents cannot connect)',
            value: 'offline',
          },
          {
            name: 'Prune unused dependency/cache volumes (asks before deleting)',
            value: 'prune',
          },
        ],
        default: 'online',
      });

  if (action === 'prune') {
    return { action: 'prune' };
  }

  const offline = action === 'offline';

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

  // Skills are provisioned over the network, so an offline session never uses them.
  const requestedSkillsDir = initial.skillsDir?.trim();
  let skillsDir: string | undefined;
  if (!offline && initial.skills !== false) {
    skillsDir =
      requestedSkillsDir != null && requestedSkillsDir !== ''
        ? requestedSkillsDir
        : await input({
            message: 'Centralized skills/prompts directory',
            default: DEFAULT_SKILLS_DIR,
            required: true,
          });
  }

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
      message: 'Allow writes to shared Git metadata (refs, hooks and config)?',
      choices: [
        { name: 'Allow Git commits and history in the container', value: true },
        {
          name: 'Withhold Git metadata (Git will not work in the container)',
          value: false,
        },
      ],
      default: true,
    }));

  return {
    action: 'session',
    options: { ...initial, agent, repo, task, skillsDir, fullAccess, gitMount, offline },
  };
}
