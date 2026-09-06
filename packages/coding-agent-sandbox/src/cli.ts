#!/usr/bin/env node

/**
 * CLI entry point. Scaffoldfy owns the front-door prompts; this binary owns the
 * Git worktree, the Docker lifecycle and the interactive agent session.
 */
import type { RawCliOptions } from './cli/resolve-cli-options';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { listAgents } from './agents/agent-registry';
import { createProgram } from './cli/create-program';
import { resolveCliOptions } from './cli/resolve-cli-options';
import { EXIT_CODE_ERROR } from './constants';
import { pruneVolumes } from './docker/prune-volumes';
import { runSandbox } from './session/run-sandbox';
import { error, plain } from './utils/logger';

const AGENT_ID_COLUMN_WIDTH = 10;

function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const contents = fs.readFileSync(path.join(here, '..', 'package.json'), 'utf-8');
    return (JSON.parse(contents) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main(): Promise<void> {
  const program = createProgram(readVersion());
  let pruning = false;
  program.action(() => {});
  program
    .command('prune')
    .description(
      'Remove unused labeled dependency/cache volumes; preserve auth and installed CLIs',
    )
    .option('--dry-run', 'List candidate volumes without removing them')
    .option('-y, --yes', 'Confirm permanent deletion without prompting')
    .action(async (options: { dryRun?: boolean; yes?: boolean }) => {
      pruning = true;
      await pruneVolumes(options);
    });
  await program.parseAsync(process.argv);
  if (pruning) {
    return;
  }
  const raw = program.opts<RawCliOptions & { listAgents?: boolean }>();

  if (raw.listAgents === true) {
    for (const agent of listAgents()) {
      plain(`${agent.id.padEnd(AGENT_ID_COLUMN_WIDTH)}${agent.label}`);
    }
    return;
  }

  const exitCode = await runSandbox(await resolveCliOptions(raw));
  process.exitCode = exitCode;
}

main().catch((cause: unknown) => {
  error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = EXIT_CODE_ERROR;
});
