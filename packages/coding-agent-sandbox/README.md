# @pixpilot/coding-agent-sandbox

Run AI coding agents — **Claude Code**, **OpenAI Codex**, **GitHub Copilot CLI** — inside Docker, against a **dedicated Git worktree**, with your centralized skills and prompts already provisioned.

The main checkout is never mounted. Each agent gets its own branch, its own worktree and its own persistent OAuth volume, so the same task can run under several agents at the same time without collisions.

## Quick start

Run it with no arguments for the guided setup — it asks what to do, then for the agent, repository, task and permissions:

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

| Question                                    | Default                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| What would you like to do?                  | Start a `strict`, `open` or no-network session — or prune unused cache volumes       |
| Which coding agent should run this task?    | Claude Code                                                                          |
| Which model should the agent use?           | _Only with an initial prompt_ — the `agents.jsonc` model, or the agent's own default |
| How much reasoning effort should it use?    | _Only with an initial prompt_ — the model’s `efforts` from `agents.jsonc`            |
| Main Git repository path                    | The repository containing the current directory                                      |
| Task name                                   | _(required)_                                                                         |
| Let the agent act without approval prompts? | Yes                                                                                  |
| Enable isolated Git history and commits?    | Yes                                                                                  |

The guided setup needs a terminal. Without one, use `--yes --task` and any other options instead.

`--prompt` or `--prompt-file` makes the agent start working the moment it opens, leaving no chance to switch models first — so the model and effort questions appear only then, and only for whichever of `--model`/`--effort` was left off. With `models` configured in `agents.jsonc` they are pickers over those entries; otherwise the model is free text. Either can be left as the agent default.

## What a session does

1. Validates the Git repository and resolves the **main** checkout.
2. Creates (or reuses) the branch `ai/<agent>/<task>`.
3. Creates (or reuses) the worktree at `<repo-parent>/<repo-name>.worktrees/<task>-<agent>`.
4. Refuses to start if another sandbox container is already using that worktree.
5. Builds the shared development image once, then reuses it.
6. Mounts the worktree read/write at `/workspace` and private session Git metadata.
7. Provisions skills, prompts, MCP servers and global rules with the bundled cross-platform synchronizer.
8. Installs project dependencies with [`@antfu/ni`](https://github.com/antfu-collective/ni).
9. Launches the agent interactively and hands you the terminal.

On exit the container is removed. Agent commits are safely imported into that worktree's branch; uncommitted changes remain in the worktree. Nothing is merged into your main branch or deleted.

The exit summary includes short Git status and separate staged/unstaged diff statistics. Untracked files appear in status; committed changes are not included in these statistics.

```text
Z:\github\roleclick                                        main checkout (never mounted)
Z:\github\roleclick.worktrees\fix-resume-generation-claude  -> /workspace  (read/write)
Z:\github\roleclick.worktrees\fix-resume-generation-codex   -> /workspace  (a second session)
portable configs directory                                  -> /coding-agent-sandbox/configs (read-only)
```

## CLI options

| Option                    | Description                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `--agent <agent>`         | `claude`, `codex` or `copilot`                                                               |
| `--repo <path>`           | Main Git repository path (default: the repository containing the CWD)                        |
| `--task <name>`           | Task name; drives the branch and worktree names                                              |
| `--configs-dir <path>`    | Directory containing optional `skills/`, `prompts/`, `mcp.jsonc`, `agents.jsonc`, and rules  |
| `--branch <name>`         | Override the `ai/<agent>/<task>` branch name                                                 |
| `--worktree <path>`       | Override the worktree location                                                               |
| `--base <ref>`            | Base ref for a newly created branch (default: the repository's HEAD)                         |
| `--image <tag>`           | Use an existing image instead of building the bundled one                                    |
| `--prompt <text>`         | Initial prompt passed safely to the selected agent                                           |
| `--prompt-file <path>`    | Read the initial prompt from a UTF-8 file; cannot be combined with `--prompt`                |
| `--model <name>`          | Model the agent should use; overrides `agents.jsonc`. Accepts a `<model>:<effort>` shorthand |
| `--effort <level>`        | Reasoning effort, e.g. `low`/`high`/`xhigh`/`max`; the levels are agent-specific             |
| `--agent-args <args>`     | Trusted shell text appended to the agent command                                             |
| `--full-access <boolean>` | Run the agent without approval prompts (default: `true`)                                     |
| `--no-install`            | Skip project dependency installation                                                         |
| `--no-configs`            | Skip skills, prompts, MCP and global-rules provisioning                                      |
| `--no-git-mount`          | Disable isolated Git support (Git stops working in-container)                                |
| `--update-agent`          | Reinstall/upgrade the agent CLI in the container                                             |
| `--rebuild-image`         | Rebuild the shared development image                                                         |
| `--login`                 | Force the agent login flow before launching                                                  |
| `--dry-run`               | Preview Docker arguments with environment values omitted                                     |
| `--allow-dirty`           | Create the worktree from committed HEAD even when the main checkout is dirty                 |
| `--network <mode>`        | Egress policy: `strict` (default), `open` or `none`                                          |
| `--allow-hosts <host...>` | Extra hosts allowed in `strict`, e.g. `cdn.playwright.dev`                                   |
| `--cpus <count>`          | Limit container CPUs (unconstrained by default)                                              |
| `--memory <size>`         | Limit container memory (unconstrained by default)                                            |
| `--pids-limit <count>`    | Limit container PIDs/threads (4096 by default; `--pids-limit=-1` for unlimited)              |
| `--offline`               | Deprecated alias for `--network none`                                                        |
| `-y, --yes`               | Never prompt; skip the guided setup and use defaults for anything unset                      |
| `--list-agents`           | List the supported agents and exit                                                           |

### Examples

```sh
# Same task, three agents, three isolated worktrees
npx @pixpilot/coding-agent-sandbox --agent claude  --repo Z:\github\roleclick --task "fix resume generation"
npx @pixpilot/coding-agent-sandbox --agent codex   --repo Z:\github\roleclick --task "fix resume generation"
npx @pixpilot/coding-agent-sandbox --agent copilot --repo Z:\github\roleclick --task "fix resume generation"

# Branch off a release line instead of HEAD
npx @pixpilot/coding-agent-sandbox --agent codex --task "hotfix login" --base release/2.4

# Start Codex with an initial task prompt
npx @pixpilot/coding-agent-sandbox --agent codex --task "fix login" \
  --prompt "Investigate and fix the login failure. Run relevant tests."

# Start Codex with a multi-line initial prompt from a file
npx @pixpilot/coding-agent-sandbox --agent codex --task "fix login" \
  --prompt-file .\prompt.md

# Keep approval prompts on, and pass an agent flag through
npx @pixpilot/coding-agent-sandbox --agent claude --task "risky refactor" \
  --full-access false --agent-args "--verbose"

# Pick the model for this session
npx @pixpilot/coding-agent-sandbox --agent codex --task "fix login" --model gpt-5.1-codex

# Pick the model and how hard it should think (equivalently: --model gpt-5.1-codex-max:high)
npx @pixpilot/coding-agent-sandbox --agent codex --task "fix login" \
  --model gpt-5.1-codex-max --effort high

# See exactly what would run, without creating a worktree or a container
npx @pixpilot/coding-agent-sandbox --agent claude --task "fix resume generation" --dry-run --yes
```

### Multi-line prompts on Windows

When launched with `npx` on Windows, `cmd.exe` truncates a multi-line `--prompt` before this CLI receives it. Put the prompt in a UTF-8 file and pass `--prompt-file <path>` instead; its trailing whitespace is removed, and the file is only read — never moved or deleted. Relative paths resolve from the current directory.

## Worktrees and branches

| Agent   | Branch                             | Worktree                                         |
| ------- | ---------------------------------- | ------------------------------------------------ |
| claude  | `ai/claude/fix-resume-generation`  | `<repo>.worktrees/fix-resume-generation-claude`  |
| codex   | `ai/codex/fix-resume-generation`   | `<repo>.worktrees/fix-resume-generation-codex`   |
| copilot | `ai/copilot/fix-resume-generation` | `<repo>.worktrees/fix-resume-generation-copilot` |

If the worktree already exists it is **reused**, never recreated. Before reuse it is checked against `git worktree list` and its branch is verified. A directory that exists but is not a registered worktree of the repository aborts the run rather than being overwritten.

### Uncommitted changes in the main checkout

A new worktree is created from committed history, so uncommitted work in the main checkout is not part of the agent's workspace. When creating one the CLI lists those changes and stops so the omission is never silent:

- Interactively, choose to re-check after committing or stashing, or bypass and continue from committed HEAD.
- Non-interactively (`--yes`, or no TTY) the run fails. Commit or stash the changes, or pass `--allow-dirty` to accept the same bypass up front.

`--allow-dirty` only waives the confirmation. It never copies, stashes or discards local changes — the main checkout is left untouched, and the worktree still starts from committed HEAD. Reusing an existing worktree skips the check entirely.

## Configuration provisioning

The sandbox never executes a script from your configuration directory. Pass `--configs-dir <path>` to mount portable assets read-only; a missing supplied path is an error. An incomplete directory never prompts and is never rejected: the selected agent’s own configuration supplies whatever the directory does not, and the supplied assets win wherever both provide the same component.

Without `--configs-dir`, the selected agent’s skills, prompts, MCP servers and global instructions are copied into a temporary portable snapshot. Credentials, agent state, and MCP token-like values are excluded. The snapshot is removed when the session exits.

Configuration is applied with the bundled `@pixpilot/agent-config-sync` CLI, using centrally defined Windows, macOS, and Linux targets. Provisioning fails closed; use `--no-configs` to opt out.

### `agents.jsonc`

An optional `agents.jsonc` (or `agents.json`) in `--configs-dir` sets per-agent launch defaults. Unlike the other components it is read on the host and shapes the agent command instead of being synced into the container, so it applies even with `--no-configs`.

```jsonc
{
  "$schema": "https://unpkg.com/@pixpilot/agent-config-sync/schemas/agents.schema.json",
  // Used by any agent without its own entry.
  "$defaults": { "model": "gpt-5.1-codex" },
  "claude": { "model": "opus" },
  "codex": {
    "model": "gpt-5.1-codex-max",
    "effort": "high",
    "models": [
      "gpt-5.1-codex-mini",
      {
        "name": "gpt-5.1-codex-max",
        "label": "Codex Max",
        "efforts": ["low", "medium", "high", "xhigh"],
        "effort": "high",
      },
    ],
  },
}
```

Precedence is `--model`/`--effort` > the agent’s own entry > `$defaults`. Model names are agent-specific and passed through unvalidated; `effort` is lower-cased and checked for shape only, then mapped onto whichever setting the agent CLI actually exposes.

`models` is an optional list for integrations (such as a model picker); it does not affect launch selection. Each entry is either a bare name or an object with `name` plus optional `label`, `efforts` (the levels to offer with it) and `effort` (the level to preselect).

### Shared prompt instructions

`prompt` holds instructions inline; `promptFile` names a file holding them, resolved against the settings file's own directory. Either one is appended to `--prompt`, separated by a blank line — so put long instructions in a file and keep them reviewable.

```jsonc
{
  // Appended to every agent's prompt, from <configs-dir>/prompt.md.
  "$defaults": { "promptFile": "./prompt.md" },
  "claude": { "prompt": "Prefer small, reviewable commits." },
}
```

They apply **only when the session starts with `--prompt` or `--prompt-file`**. An agent opened without one waits for its first instruction, and shared rules are not a task of their own.

The first entry naming either key wins as a whole: an agent's own instructions replace `$defaults` rather than adding to them, and within one entry `promptFile` wins over `prompt`. A file that is missing or empty fails the session rather than launching an agent without the rules the settings promised.

Keep that file out of `prompts/` — that directory is synced into the container as the agent's own prompt commands.

### Reasoning effort

Every CLI names its own levels and adds to them between releases, so a level is a free-form token passed through like a model name — anything the agent accepts works. Each agent gets it in its own spelling:

| Agent          | Mapped to                           |
| -------------- | ----------------------------------- |
| Claude Code    | `--effort <level>`                  |
| GitHub Copilot | `--effort <level>`                  |
| OpenAI Codex   | `-c model_reasoning_effort=<level>` |

An agent with no such setting warns and ignores the value rather than failing.

`--effort` and the `<model>:<effort>` shorthand are two spellings of one setting; the explicit flag wins. The shorthand splits only on `minimal`, `low`, `medium`, `high`, `xhigh`, `max` and `ultra`, so names that legitimately contain `:` or `/` — `vendor/model:latest`, `anthropic/claude-sonnet-4.5` — pass through untouched. Any other level still works through `--effort` or `agents.jsonc`.

## Authentication

Each agent gets its own persistent Docker volume — `coding-agent-sandbox-auth-claude`, `coding-agent-sandbox-auth-codex`, `coding-agent-sandbox-auth-copilot` — mounted at `/agent-state`. The agent's config directory is symlinked into it, so subscription logins **and** settings such as the selected model or thinking mode survive between sessions.

Writes to these settings and credentials persist immediately, including after a failed session; removing the container does not roll them back.

The first run signs you in through the agent's normal subscription OAuth flow. Later runs reuse the volume. Host credential stores are never mounted or copied; `~/.claude`, `~/.codex`, `~/.ssh` and `~` stay on the host.

Codex uses `codex login --device-auth`, so no callback port is published. Device-code login must be enabled in your ChatGPT security settings or workspace permissions. Port 1455 belongs to Codex's browser callback flow, not every agent. See [OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth#login-on-headless-devices).

## Networking and secrets

Every session runs behind its own egress proxy. The container joins a per-session
internal Docker network with no usable route off it; the only other member is a
proxy sidecar that also holds a normal bridge. The proxy resolves targets itself,
pins connections to public IPv4 addresses, and rejects private, link-local,
loopback and reserved destinations. The agent therefore cannot reach the LAN,
Docker host or `169.254.169.254` directly or through the proxy.

| `--network` | Egress                                                      | Bootstrap |
| ----------- | ----------------------------------------------------------- | --------- |
| `strict`    | the agent's provider plus the detected project's registries | full      |
| `open`      | any public hostname, every one of them logged               | full      |
| `none`      | nothing                                                     | skipped   |

`strict` is the default. The allowlist is composed from the selected agent's
`egressHosts`, the detected environment's `egressHosts`, the npm registry the
bootstrap itself needs, and **the hostnames of the repository's own HTTPS Git
remotes**, so `fetch`, `pull` and `push` keep working. Add anything else for one
session with `--allow-hosts`:

```sh
# a repo whose postinstall pulls prebuilt binaries, plus the GitHub API for gh
csbx --task fix-login --allow-hosts objects.githubusercontent.com api.github.com
```

Every session prints the hostnames its proxy actually saw when it ends, in all
modes — in `open` that audit trail is the whole point, and it is the intended way
to discover what a repository needs.

### What `strict` breaks

Measured with Claude Code against a real repository:

| Capability                        | Under `strict`                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------- |
| Model requests, `/login`          | work                                                                            |
| `WebSearch`                       | works — it runs server-side, so the container never connects                    |
| `WebFetch`                        | works only for allowlisted hosts, so in practice every documentation site fails |
| `git fetch`/`pull`/`push` (HTTPS) | work — the remote's host is allowlisted automatically                           |
| `git` over SSH                    | fails; `CONNECT` is restricted to port 443                                      |
| npm/pnpm/yarn installs            | work                                                                            |
| Postinstall binary downloads      | fail unless you add the CDN with `--allow-hosts`                                |

### MCP servers

MCP servers are ordinary child processes in the same container, so they inherit
the proxy environment and are subject to the same allowlist:

| Kind                                         | Under `strict`                                      |
| -------------------------------------------- | --------------------------------------------------- |
| stdio server launched with `npx -y <pkg>`    | installs and runs — the npm registry is allowlisted |
| stdio server that only touches the workspace | works; it needs no network                          |
| stdio server that calls a third-party API    | needs that API's host via `--allow-hosts`           |
| remote HTTP/SSE server                       | needs its host via `--allow-hosts`                  |
| a server that downloads a browser or binary  | needs its CDN via `--allow-hosts`                   |

Node-based servers do reach allowlisted hosts, including through `fetch`, because
the container sets `NODE_USE_ENV_PROXY=1`. Without it Node resolves DNS itself and
fails with `EAI_AGAIN`, so that variable is what makes both MCP servers and the
agent's `WebFetch` work at all.

Use `--network open` for research tasks, then read the printed hostnames to
decide what deserves a permanent entry.

TLS is never intercepted. In `strict` mode the proxy requires the TLS ClientHello
SNI to match the allowed `CONNECT` hostname before it opens the upstream socket,
closing the co-hosted-CDN bypass without decrypting OAuth or pinned traffic.

**Known limits.** `CONNECT` is restricted to port 443, so Git over SSH and tools
using raw sockets fail in every mode; HTTPS remotes work where the host is
permitted. IPv6-only destinations are currently refused so the proxy can enforce
its public-address policy. DNS-based exfiltration is out of scope. The goal is to
remove the easy outbound paths and make everything else auditable; the persistent
credential volume is still mounted and readable by the agent process.

If something fails only under `strict`, rerun with `--network open` when you
trust the operation, then read the printed hostnames to decide what to allow.

`--network none` also runs with `--pull never` and skips configuration
sync, dependency installs, CLI installs/updates and
authentication. A local image and installed CLI are required; prepare them with a
network first, or select a cached `--image`. It rejects `--login`,
`--update-agent` and `--rebuild-image`. Cloud-backed agents cannot make model
requests without a network. Existing mounted state remains available and writable.

Containers run with `--cap-drop=ALL`, `--security-opt=no-new-privileges` and a
`--pids-limit` of 4096, as non-root `node`. CPU and memory are unconstrained
unless you pass `--cpus` or `--memory`. No inbound ports or Docker socket are
published.

The PID limit counts Linux _threads_, not processes: an idle agent runtime
already holds several hundred tasks, and a monorepo build fans out one worker
per core on top of that. Too low a ceiling surfaces as `EAGAIN` /
`Resource temporarily unavailable (os error 11)` from `turbo`, `tsc`, `eslint`
or `pnpm`, not as an obvious limit error. Raise it with `--pids-limit` if a
build still hits the ceiling.

The CLI does not forward host API keys. Dry-run output omits all environment values, including agent commands. Never put secrets in `--agent-args`, repository URLs, paths or task names: arguments can appear in process listings or diagnostics. Terminal output uses inherited stdio and is **not sanitized**; an agent or subprocess may print sensitive data. Any future API-key mode must pass only the active agent's required variables without embedding their values in command arguments or logs.

## Removing unused caches

`csbx` is an alias for `coding-agent-sandbox`. Run `csbx prune --dry-run` to preview, then `csbx prune` to confirm deletion (`--yes` confirms non-interactively).

After every session, the CLI removes all unused labeled dependency volumes, including the worktree that just finished. The shared package download cache is retained, so a new or reopened worktree can still install without downloading packages again.

`csbx prune` removes all newly labeled unused dependency volumes and the shared home cache when no container references them. It preserves auth volumes, installed CLI storage, the shared package download cache, and volumes attached to running **or stopped** containers. Delete `coding-agent-sandbox-package-cache` explicitly with Docker if you need to reset downloaded packages or Corepack binaries. Older unlabeled volumes are deliberately left untouched. Deletion is permanent; dependencies and cache data must be rebuilt afterwards. "Unused" means no container reference, even if you intend to reuse that worktree later. [Docker's dangling-volume filter](https://docs.docker.com/reference/cli/docker/volume/ls/#dangling) defines this check.

## Docker image

One shared image for every agent and every project type: Node.js 24.15 (Debian slim), Git, Python 3, ripgrep, jq and common shell utilities, plus `@antfu/ni` and corepack. It runs as the unprivileged `node` user and is built from the bundled `docker/` context on first use, then cached; the tag is derived from the build context so edits trigger a rebuild.

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

A worktree's `.git` file points at a host path that does not exist in the container. For each session, the CLI creates a private no-hardlink clone, mounts it at `/repo/.git`, and replaces the worktree pointer with a read-only `gitdir: /repo/.git` file. Commits, diffs, branches and history therefore work in `/workspace` without exposing the host repository's objects, refs, hooks or config.

When the session ends, the CLI imports only commits that fast-forward from the recorded base into that worktree's branch. The host branch must still point at that base, and host hooks are disabled during the index refresh. If either condition fails, the private clone is retained for recovery and the host repository is left untouched. Use `--no-git-mount` to disable Git entirely inside the container.

Commit identity is passed as `GIT_AUTHOR_*`/`GIT_COMMITTER_*` environment variables read from the host repository config, so no host config file is mounted.

## Safety guarantees

- The main working tree and its `.git` directory are never mounted; only the dedicated worktree and private session Git metadata are writable.
- An existing worktree is never recreated, overwritten or reset.
- Nothing is ever merged, and no branch or worktree is ever deleted — including after a crash or Ctrl+C.
- Two active agent containers can never share a worktree.
- Configuration provisioning fails closed; the agent is not launched on failure.
- The Docker socket is never exposed, and no unrelated host directory is mounted.
- The portable configuration source is read-only for the whole session.
- Container cleanup only removes containers carrying this CLI's label, and reports failures instead of escalating — it can never delete host source code.

## Adding an agent

Adapter commands and `--agent-args` are trusted shell code inside the container. Do not populate them from task names, repository content or agent output. The configuration directory is treated as data and no source script is executed.

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
- Node.js 24.15+ on the host.
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
  configs: true,
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
