import type { SandboxOptions } from '../types';
import process from 'node:process';
import { input, select } from '@inquirer/prompts';
import { listAgents } from '../agents/agent-registry';
import { detectDefaultRepo } from './detect-default-repo';

/** Raw option bag produced by Commander. */
export interface RawCliOptions extends Partial<
  Omit<SandboxOptions, 'agent' | 'repo' | 'task'>
> {
  agent?: string | undefined;
  repo?: string | undefined;
  task?: string | undefined;
}

/**
 * Fills in anything Scaffoldfy or the flags did not provide. Prompts only when
 * a terminal is attached; otherwise missing values are a hard error.
 */
export async function resolveCliOptions(raw: RawCliOptions): Promise<SandboxOptions> {
  const interactive = process.stdin.isTTY === true && raw.yes !== true;

  const agent =
    raw.agent ??
    (await askOrFail(interactive, '--agent', async () =>
      select({
        message: 'Which coding agent should run this task?',
        choices: listAgents().map((candidate) => ({
          name: candidate.label,
          value: candidate.id,
        })),
      }),
    ));

  const repo =
    raw.repo ??
    (await askOrFail(interactive, '--repo', async () =>
      input({ message: 'Main Git repository path', default: detectDefaultRepo() }),
    ));

  const task =
    raw.task ??
    (await askOrFail(interactive, '--task', async () =>
      input({ message: 'Task name', required: true }),
    ));

  return {
    ...raw,
    agent,
    repo,
    task,
    fullAccess: raw.fullAccess ?? true,
    install: raw.install ?? true,
    skills: raw.skills ?? true,
    gitMount: raw.gitMount ?? true,
    updateAgent: raw.updateAgent ?? false,
    rebuildImage: raw.rebuildImage ?? false,
    login: raw.login ?? false,
    dryRun: raw.dryRun ?? false,
    yes: raw.yes ?? false,
  };
}

async function askOrFail<T>(
  interactive: boolean,
  flag: string,
  ask: () => Promise<T>,
): Promise<T> {
  if (!interactive) {
    throw new Error(`${flag} is required when running without a terminal.`);
  }

  return ask();
}
