#!/usr/bin/env node

import type { AgentId } from './types.ts';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { inspectConfigDirectory } from './config-directory.ts';
import { syncAgentConfigs } from './sync-agent-configs.ts';
import { AGENT_IDS } from './types.ts';

const CLI_ARGUMENT_START_INDEX = 2;

interface CliOptions {
  configDirectory: string;
  agents: AgentId[];
  homeDirectory?: string;
  dryRun: boolean;
  help: boolean;
}

/** Runs the standalone cross-platform configuration-sync CLI. */
export function runCli(argv: readonly string[]): void {
  const options = parseCliOptions(argv);
  if (options.help) return;
  const source = inspectConfigDirectory(options.configDirectory);

  if (options.dryRun) {
    process.stdout.write(
      `Would sync ${source.available.join(', ') || 'no available components'} from ${source.path}\n`,
    );
    return;
  }

  const result = syncAgentConfigs({
    configDirectory: source.path,
    agents: options.agents.length === 0 ? undefined : options.agents,
    homeDirectory: options.homeDirectory,
  });
  process.stdout.write(`Synced ${result.copied.length} configuration target(s).\n`);
}

/** Parses dependency-free CLI options so the binary can run in the sandbox image. */
export function parseCliOptions(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    configDirectory: process.cwd(),
    agents: [],
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exitCode = 0;
      options.help = true;
      return options;
    }
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--configs-dir') {
      options.configDirectory = readValue(argv, ++index, argument);
    } else if (argument === '--home-dir') {
      options.homeDirectory = readValue(argv, ++index, argument);
    } else if (argument === '--agent') {
      options.agents.push(parseAgent(readValue(argv, ++index, argument)));
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function readValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (value == null || value.startsWith('-'))
    throw new Error(`${option} requires a value.`);
  return value;
}

function parseAgent(value: string): AgentId {
  if ((AGENT_IDS as readonly string[]).includes(value)) return value as AgentId;
  throw new Error(`Unsupported agent "${value}". Use: ${AGENT_IDS.join(', ')}.`);
}

function printHelp(): void {
  process.stdout.write(`Usage: agent-config-sync [options]\n\n`);
  process.stdout.write(
    `  --configs-dir <path>  Portable source directory (default: current directory)\n`,
  );
  process.stdout.write(
    `  --agent <agent>       claude, codex or copilot; repeat to target several\n`,
  );
  process.stdout.write(
    `  --home-dir <path>     Home directory to configure (default: current user)\n`,
  );
  process.stdout.write(
    `  --dry-run             List available components without writing\n`,
  );
}

if (process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(CLI_ARGUMENT_START_INDEX));
}
