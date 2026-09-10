import { Command } from 'commander';
import { listAgents } from '../agents/agent-registry';
import { KNOWN_EFFORTS, parseReasoningEffort } from '../agents/reasoning-effort';
import { NETWORK_MODES, parseNetworkMode } from '../network/network-mode';
import { parseBoolean } from './parse-boolean';
import { parsePidsLimit } from './parse-pids-limit';

/** Builds the Commander program; kept separate so it can be unit tested. */
export function createProgram(version: string): Command {
  const agents = listAgents()
    .map((agent) => agent.id)
    .join(' | ');

  return new Command()
    .name('coding-agent-sandbox')
    .description(
      'Run AI coding agents in Docker against a dedicated Git worktree. Run without any flags for the guided setup.',
    )
    .version(version)
    .option('--agent <agent>', `Coding agent to run (${agents})`)
    .option(
      '--repo <path>',
      'Main Git repository path (defaults to the current repository)',
    )
    .option('--task <name>', 'Task name, used for the branch and worktree')
    .option(
      '--configs-dir <path>',
      'Portable directory containing skills, prompts, MCP servers and global rules',
    )
    .option('--branch <name>', 'Override the ai/<agent>/<task> branch name')
    .option('--worktree <path>', 'Override the worktree location')
    .option(
      '--temp-dir <path>',
      'Root for the temporary directories bind-mounted into the container (defaults to the OS temporary directory)',
    )
    .option('--base <ref>', 'Base ref for a newly created branch')
    .option('--image <tag>', 'Use an existing image instead of the bundled one')
    .option('--prompt <text>', 'Initial prompt passed safely to the agent')
    .option('--prompt-file <path>', 'Read the initial prompt from a UTF-8 file')
    .option(
      '--model <name>',
      'Model the agent should use; overrides agents.jsonc in --configs-dir. Accepts a <model>:<effort> shorthand',
    )
    .option(
      '--effort <level>',
      `Reasoning effort, e.g. ${KNOWN_EFFORTS.join(' | ')}; the levels are agent-specific`,
      parseReasoningEffort,
    )
    .option('--agent-args <args>', 'Trusted shell text appended to the agent command')
    .option(
      '--full-access <boolean>',
      'Let the agent act without approval prompts',
      parseBoolean,
      true,
    )
    .option('--no-install', 'Skip project dependency installation')
    .option(
      '--network <mode>',
      `Egress policy (${NETWORK_MODES.join(' | ')})`,
      parseNetworkMode,
    )
    .option(
      '--allow-hosts <host...>',
      'Extra hosts to allow in strict mode, e.g. cdn.playwright.dev',
    )
    .option('--cpus <count>', 'Limit container CPUs (unconstrained by default)')
    .option('--memory <size>', 'Limit container memory (unconstrained by default)')
    .option(
      '--pids-limit <count>',
      'Limit container PIDs/threads (4096 by default; --pids-limit=-1 for unlimited)',
      parsePidsLimit,
    )
    .option('--offline', 'Deprecated alias for --network none')
    .option('--no-configs', 'Skip skills, prompts, MCP and global-rules provisioning')
    .option('--no-git-mount', 'Disable isolated Git support inside the container')
    .option('--update-agent', 'Reinstall/upgrade the agent CLI in the container')
    .option('--rebuild-image', 'Rebuild the shared development image')
    .option('--login', 'Force the agent login flow before launching')
    .option('--dry-run', 'Print the docker run command without starting anything')
    .option(
      '--allow-dirty',
      'Create the worktree from committed HEAD even when the main checkout has uncommitted changes',
    )
    .option(
      '-y, --yes',
      'Never prompt; skip the guided setup and use defaults for anything unset',
    )
    .option('--list-agents', 'List the supported coding agents and exit');
}
