import { Command } from 'commander';
import { listAgents } from '../agents/agent-registry';
import { DEFAULT_SKILLS_DIR } from '../constants';
import { parseBoolean } from './parse-boolean';

/** Builds the Commander program; kept separate so it can be unit tested. */
export function createProgram(version: string): Command {
  const agents = listAgents()
    .map((agent) => agent.id)
    .join(' | ');

  return new Command()
    .name('coding-agent-sandbox')
    .description('Run AI coding agents in Docker against a dedicated Git worktree')
    .version(version)
    .option('--agent <agent>', `Coding agent to run (${agents})`)
    .option(
      '--repo <path>',
      'Main Git repository path (defaults to the current repository)',
    )
    .option('--task <name>', 'Task name, used for the branch and worktree')
    .option(
      '--skills-dir <path>',
      `Centralized skills directory (default: ${DEFAULT_SKILLS_DIR})`,
    )
    .option(
      '--skills-repo <url>',
      'Repository to clone when setting up skills',
    )
    .option('--branch <name>', 'Override the ai/<agent>/<task> branch name')
    .option('--worktree <path>', 'Override the worktree location')
    .option('--base <ref>', 'Base ref for a newly created branch')
    .option('--image <tag>', 'Use an existing image instead of the bundled one')
    .option('--agent-args <args>', 'Trusted shell text appended to the agent command')
    .option(
      '--seed-files <path...>',
      'Extra home-relative placeholder files created before the skills sync',
    )
    .option(
      '--full-access <boolean>',
      'Let the agent act without approval prompts',
      parseBoolean,
      true,
    )
    .option('--no-install', 'Skip project dependency installation')
    .option(
      '--offline',
      'Disable networking; require cached image and CLI, skip setup/login',
    )
    .option('--no-skills', 'Skip skills/prompts provisioning')
    .option('--no-git-mount', 'Do not mount the shared .git directory')
    .option('--update-agent', 'Reinstall/upgrade the agent CLI in the container')
    .option('--rebuild-image', 'Rebuild the shared development image')
    .option('--login', 'Force the agent login flow before launching')
    .option('--dry-run', 'Print the docker run command without starting anything')
    .option('-y, --yes', 'Never prompt; fail when a required option is missing')
    .option('--list-agents', 'List the supported coding agents and exit');
}
