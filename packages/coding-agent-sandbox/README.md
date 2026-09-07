# @pixpilot/coding-agent-sandbox

Run AI coding agents — **Claude Code**, **OpenAI Codex**, **GitHub Copilot CLI** — inside Docker, against a **dedicated Git worktree**, with your centralized skills and prompts already provisioned.

The main checkout is never mounted. Each agent gets its own branch, its own worktree and its own persistent OAuth volume, so the same task can run under several agents at the same time without collisions.

## Quick start

Run it with no arguments for the guided setup — it asks what to do, then for the agent, repository, task, skills directory and permissions:

```sh
npx @pixpilot/coding-agent-sandbox@latest
```

Flags prefill the guided setup and skip their matching questions. Add `-y` or `--yes` to skip every prompt; in that non-interactive mode, `--task` is mandatory:

```sh
npx @pixpilot/coding-agent-sandbox@latest --agent claude --task "fix resume generation" --yes
```

With no `--repo`, the repository containing the current directory is used. With no `--agent`, Claude Code is used.

### Guided setup

A bare invocation asks, in order:

| Question                                    | Default                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| What would you like to do?                  | Start a session with internet access — or start offline, or prune unused cache volumes |
| Which coding agent should run this task?    | Claude Code                                                                            |
| Main Git repository path                    | The repository containing the current directory                                        |
| Task name                                   | _(required)_                                                                           |
| Centralized skills/prompts directory        | `%USERPROFILE%\.coding-agent-sandbox\skills` — skipped for an offline session          |
| Let the agent act without approval prompts? | Yes                                                                                    |
| Allow writes to shared Git metadata?        | Yes                                                                                    |

The guided setup needs a terminal. Without one, use `--yes --task` and any other options instead.

## What a session does

1. Validates the Git repository and resolves the **main** checkout.
2. Creates (or reuses) the branch `ai/<agent>/<task>`.
3. Creates (or reuses) the worktree at `<repo-parent>/<repo-name>.worktrees/<task>-<agent>`.
4. Refuses to start if another sandbox container is already using that worktree.
5. Builds the shared development image once, then reuses it.
6. Mounts only the worktree read/write at `/workspace`.
7. Provisions your skills/prompts by running the skills repository's **own** sync utility.
8. Installs project dependencies with [`@antfu/ni`](https://github.com/antfu-collective/ni).
9. Launches the agent interactively and hands you the terminal.

On exit the container is removed and the branch, worktree and changes are left exactly as they are. Nothing is merged, reset or deleted.

The exit summary includes short Git status and separate staged/unstaged diff statistics. Untracked files appear in status; committed changes are not included in these statistics.

```text
Z:\github\roleclick                                        main checkout (never mounted)
Z:\github\roleclick.worktrees\fix-resume-generation-claude  -> /workspace  (read/write)
Z:\github\roleclick.worktrees\fix-resume-generation-codex   -> /workspace  (a second session)
%USERPROFILE%\.coding-agent-sandbox\skills                    -> /coding-agent-sandbox/skills (read-only)
```

## CLI options

| Option                    | Description                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `--agent <agent>`         | `claude`, `codex` or `copilot`                                                       |
| `--repo <path>`           | Main Git repository path (default: the repository containing the CWD)                |
| `--task <name>`           | Task name; drives the branch and worktree names                                      |
| `--skills-dir <path>`     | Centralized skills directory (default: `%USERPROFILE%\.coding-agent-sandbox\skills`) |
| `--skills-repo <url>`     | Repository to clone when setting up skills                                           |
| `--branch <name>`         | Override the `ai/<agent>/<task>` branch name                                         |
| `--worktree <path>`       | Override the worktree location                                                       |
| `--base <ref>`            | Base ref for a newly created branch (default: the repository's HEAD)                 |
| `--image <tag>`           | Use an existing image instead of building the bundled one                            |
| `--agent-args <args>`     | Trusted shell text appended to the agent command                                     |
| `--seed-files <path...>`  | Extra home-relative placeholder files created before the skills sync                 |
| `--full-access <boolean>` | Run the agent without approval prompts (default: `true`)                             |
| `--no-install`            | Skip project dependency installation                                                 |
| `--no-skills`             | Skip skills/prompts provisioning                                                     |
| `--no-git-mount`          | Do not mount the shared `.git` directory (Git stops working in-container)            |
| `--update-agent`          | Reinstall/upgrade the agent CLI in the container                                     |
| `--rebuild-image`         | Rebuild the shared development image                                                 |
| `--login`                 | Force the agent login flow before launching                                          |
| `--dry-run`               | Preview Docker arguments with environment values omitted                             |
| `--offline`               | Disable container networking; skip provisioning, installs and login                  |
| `-y, --yes`               | Never prompt; skip the guided setup and use defaults for anything unset              |
| `--list-agents`           | List the supported agents and exit                                                   |

### Examples

```sh
# Same task, three agents, three isolated worktrees
npx @pixpilot/coding-agent-sandbox --agent claude  --repo Z:\github\roleclick --task "fix resume generation"
npx @pixpilot/coding-agent-sandbox --agent codex   --repo Z:\github\roleclick --task "fix resume generation"
npx @pixpilot/coding-agent-sandbox --agent copilot --repo Z:\github\roleclick --task "fix resume generation"

# Branch off a release line instead of HEAD
npx @pixpilot/coding-agent-sandbox --agent codex --task "hotfix login" --base release/2.4

# Keep approval prompts on, and pass an agent flag through
npx @pixpilot/coding-agent-sandbox --agent claude --task "risky refactor" \
  --full-access false --agent-args "--model opus"

# See exactly what would run, without creating a worktree or a container
npx @pixpilot/coding-agent-sandbox --agent claude --task "fix resume generation" --dry-run --yes
```

## Worktrees and branches

| Agent   | Branch                             | Worktree                                         |
| ------- | ---------------------------------- | ------------------------------------------------ |
| claude  | `ai/claude/fix-resume-generation`  | `<repo>.worktrees/fix-resume-generation-claude`  |
| codex   | `ai/codex/fix-resume-generation`   | `<repo>.worktrees/fix-resume-generation-codex`   |
| copilot | `ai/copilot/fix-resume-generation` | `<repo>.worktrees/fix-resume-generation-copilot` |

If the worktree already exists it is **reused**, never recreated. Before reuse it is checked against `git worktree list` and its branch is verified. A directory that exists but is not a registered worktree of the repository aborts the run rather than being overwritten.

## Skills and prompts

The centralized skills repository is mounted **read-only** at `/coding-agent-sandbox/skills`. Inside the container it is copied to a writable location and the repository's **existing** sync utility is run — `npm run sync` when the repository defines that script, otherwise a root `sync.js`/`sync.mjs`/`sync.cjs`/`sync.ts`.

If the canonical directory is missing you are asked what to do:

```text
Canonical skills directory not found:
%USERPROFILE%\.coding-agent-sandbox\skills

How would you like to continue?

> Use another skills directory
  Cancel
```

Pass `--skills-repo <url>` to add a “clone the requested skills repository” option.

Provisioning **fails closed**: if the mount, the sync utility or the post-sync setup fails, the agent is never launched.

### Host-path shims

Sync utilities are usually written for a Windows host and hard-code paths like `C:\Users\<you>\.claude`. Two shims let them run unchanged in Linux without touching the canonical copy:

- **Profile redirect** — `<Drive>:/Users/<host user>` inside the work directory is symlinked to the container home, so host profile writes land in the right place.
- **Placeholder seeding** — sync utilities that merge into existing config files refuse to run when those files are missing. Empty `~/.claude.json`, `~/.codex/config.toml` and `~/AppData/Roaming/Code/User/mcp.json` placeholders are created first. Add more with `--seed-files`.

Anything a sync utility still writes to a Windows-shaped path is re-homed into the container home afterwards. No host file is ever read, copied or modified.

## Authentication

Each agent gets its own persistent Docker volume — `coding-agent-sandbox-auth-claude`, `coding-agent-sandbox-auth-codex`, `coding-agent-sandbox-auth-copilot` — mounted at `/agent-state`. The agent's config directory is symlinked into it, so subscription logins **and** settings such as the selected model or thinking mode survive between sessions.

Writes to these settings and credentials persist immediately, including after a failed session; removing the container does not roll them back.

The first run signs you in through the agent's normal subscription OAuth flow. Later runs reuse the volume. Host credential stores are never mounted or copied; `~/.claude`, `~/.codex`, `~/.ssh` and `~` stay on the host.

Codex uses `codex login --device-auth`, so no callback port is published. Device-code login must be enabled in your ChatGPT security settings or workspace permissions. Port 1455 belongs to Codex's browser callback flow, not every agent. See [OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth#login-on-headless-devices).

## Networking and secrets

Normal sessions use Docker's default networking with unrestricted outbound access, subject to host/network policy. No inbound ports or Docker socket are published. Agent processes, project scripts and skills sync code can send any data they can read—including mounted source and persistent credentials—to external services. Docker filesystem isolation does not prevent this exfiltration.

`--offline` runs with `--network none` and `--pull never`. It skips skills discovery/cloning/sync, dependency installs, CLI installs/updates and authentication. A local image and installed CLI are required; prepare them online first, or select a cached `--image`. It rejects `--login`, `--update-agent` and `--rebuild-image`. Cloud-backed agents cannot make model requests offline, and host or remote model servers are unreachable. Local tools and models running inside the container may still work. Existing mounted state remains available and writable.

The CLI does not forward host API keys. Dry-run output omits all environment values, including agent commands. Never put secrets in `--agent-args`, repository URLs, paths or task names: arguments can appear in process listings or diagnostics. Terminal output uses inherited stdio and is **not sanitized**; an agent or subprocess may print sensitive data. Any future API-key mode must pass only the active agent's required variables without embedding their values in command arguments or logs.

## Removing unused caches

`csbx` is an alias for `coding-agent-sandbox`. Run `csbx prune --dry-run` to preview, then `csbx prune` to confirm deletion (`--yes` confirms non-interactively).

After every session, the CLI removes all unused labeled dependency volumes, including the worktree that just finished. The shared package download cache is retained, so a new or reopened worktree can still install without downloading packages again.

`csbx prune` removes all newly labeled unused dependency volumes and the shared home cache when no container references them. It preserves auth volumes, installed CLI storage, the shared package download cache, and volumes attached to running **or stopped** containers. Delete `coding-agent-sandbox-package-cache` explicitly with Docker if you need to reset downloaded packages or Corepack binaries. Older unlabeled volumes are deliberately left untouched. Deletion is permanent; dependencies and cache data must be rebuilt afterwards. "Unused" means no container reference, even if you intend to reuse that worktree later. [Docker's dangling-volume filter](https://docs.docker.com/reference/cli/docker/volume/ls/#dangling) defines this check.

## Docker image

One shared image for every agent and every project type: Node.js 22 (Debian slim), Git, Python 3, ripgrep, jq and common shell utilities, plus `@antfu/ni` and corepack. It runs as the unprivileged `node` user and is built from the bundled `docker/` context on first use, then cached; the tag is derived from the build context so edits trigger a rebuild.

Agent CLIs are installed at session start into a shared `coding-agent-sandbox-npm-global` volume rather than baked into the image, so there is no per-agent image and no reinstall on every run.

### Volumes

| Volume                               | Mounted at                | Purpose                                                    |
| ------------------------------------ | ------------------------- | ---------------------------------------------------------- |
| `coding-agent-sandbox-auth-<agent>`  | `/agent-state`            | Agent credentials and settings                             |
| `coding-agent-sandbox-npm-global`    | `/home/node/.npm-global`  | Globally installed agent CLIs                              |
| `coding-agent-sandbox-cache-home`    | `/home/node/.cache`       | Home-directory tool caches                                 |
| `coding-agent-sandbox-package-cache` | `/cache`                  | Shared package downloads, pnpm store and Corepack binaries |
| `coding-agent-sandbox-deps-<hash>`   | `/workspace/node_modules` | Dependencies, kept out of the host worktree                |

Keeping `node_modules` in a named volume means Windows never sees a Linux dependency tree, and installs are not repeated on every session. Everything else the agent writes under `/workspace` lands in the host worktree and stays editable from Windows.

## Git inside the container

A worktree's `.git` file points at a path in the main repository, which does not exist inside the container. So the repository's shared `.git` **directory** is mounted at `/repo/.git` and Git is steered at the worktree with `GIT_DIR` and `GIT_WORK_TREE`. Commits, diffs, branches and history all work in `/workspace`.

This design shares writable Git metadata, including objects, refs, hooks, config and other worktree indexes. The agent can therefore affect repository history and metadata beyond its own branch, even though the main **working tree** files are not mounted. Hooks and config changes can also affect later host Git commands. Use `--no-git-mount` to withhold it entirely — Git then stops working inside the container. Stronger Git isolation would require a separate clone and an explicit commit-transfer workflow.

Commit identity is passed as `GIT_AUTHOR_*`/`GIT_COMMITTER_*` environment variables read from the host repository config, so no host config file is mounted.

## Safety guarantees

- The main working tree is never mounted; the dedicated worktree and, by default, shared Git metadata are writable.
- An existing worktree is never recreated, overwritten or reset.
- Nothing is ever merged, and no branch or worktree is ever deleted — including after a crash or Ctrl+C.
- Two active agent containers can never share a worktree.
- Skills provisioning fails closed; the agent is not launched on failure.
- The Docker socket is never exposed, and no unrelated host directory is mounted.
- The centralized skills source is read-only for the whole session.
- Container cleanup only removes containers carrying this CLI's label, and reports failures instead of escalating — it can never delete host source code.

## Adding an agent

Adapter commands and the skills sync utility execute trusted shell code inside the container. `--agent-args` is also raw shell text: quotes, substitutions and shell operators are evaluated. Never populate it from task names, repository content or agent output. Keep repository paths and task names in separate environment values or process arguments, not interpolated into commands. Only use skills repositories you trust; their sync code has access to the session's mounts and persistent credentials.

Agents are adapters. Subclass `AgentAdapter`, then add it to the registry:

```ts
import { AgentAdapter } from '@pixpilot/coding-agent-sandbox';

export class CursorAgent extends AgentAdapter {
  readonly id = 'cursor';
  readonly label = 'Cursor CLI';
  readonly binary = 'cursor-agent';
  readonly installCommand = 'npm install -g cursor-agent@latest';
  override readonly stateDirs = ['.cursor'];

  readonly auth = {
    probe: 'test -s "$HOME/.cursor/auth.json"',
    hint: 'Sign in with your Cursor subscription.',
  };

  launchCommand({ fullAccess }: { fullAccess: boolean }): string {
    return fullAccess ? 'cursor-agent --force' : 'cursor-agent';
  }
}
```

Project environments work the same way — subclass `EnvironmentAdapter` with a `detect()` and an `installCommand`, and register it in `src/environments/detect-environment.ts`. Only JavaScript/TypeScript ships today.

## Requirements

- Docker Desktop (Windows is the primary target; native Windows paths are passed through rather than translated).
- Node.js 22+ on the host.
- Git 2.31+.

## Programmatic use

```ts
import { runSandbox } from '@pixpilot/coding-agent-sandbox';

const exitCode = await runSandbox({
  agent: 'claude',
  repo: 'Z:\\github\\roleclick',
  task: 'fix resume generation',
  fullAccess: true,
  install: true,
  skills: true,
  gitMount: true,
  updateAgent: false,
  rebuildImage: false,
  login: false,
  dryRun: false,
  yes: true,
});
```

## License

MIT
