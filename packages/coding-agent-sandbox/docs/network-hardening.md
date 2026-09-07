# Network Hardening for an AI Coding Agent Sandbox — Decision Guide

> Describes an existing tool, the security gap being closed, and the decisions
> taken. Sections 4-8 are the specification.

---

## 1. What the tool is

`@pixpilot/coding-agent-sandbox` (npm, published, v1.2.0) is a Node/TypeScript CLI
that runs a third-party AI coding agent inside a Docker container, pointed at a
dedicated Git worktree rather than your working checkout.

Supported agents, all of which are **cloud** agents that call a remote API:

| Agent              | Provider endpoint |
| ------------------ | ----------------- |
| Claude Code        | Anthropic API     |
| OpenAI Codex       | OpenAI API        |
| GitHub Copilot CLI | GitHub API        |

The point of the tool is to let an agent run **unattended** — approval prompts
off — without it being able to damage the main checkout. It is a _filesystem_
sandbox today. It is not a network sandbox. That is the gap.

Host platform in practice: Windows 10 + Docker Desktop. Should stay portable to
Linux and macOS.

---

## 2. Current architecture

### 2.1 Session lifecycle

1. Validate the Git repository, resolve the **main** checkout.
2. Create or reuse branch `ai/<agent>/<task>`.
3. Create or reuse a worktree at `<repo-parent>/<repo-name>.worktrees/<task>-<agent>`.
4. Refuse to start if another sandbox container already holds that worktree.
5. Build one shared image (tag = content hash of the build context), then reuse it.
6. Mount **only** the worktree read/write at `/workspace`. The main checkout is never mounted.
7. Provision a centralized skills/prompts repo by running that repo's own sync script.
8. Install project dependencies (`@antfu/ni` for Node).
9. Launch the agent interactively and hand over the terminal.
10. On exit: remove the container, leave branch/worktree/changes untouched, prune stale volumes.

### 2.2 The actual `docker run`

Verbatim from a dry run. Only the `--network` / `--pull` line is conditional:

```
docker run --rm -it
  --name coding-agent-sandbox-claude-smoke-test-7f5c1cc0
  --label com.pixpilot.sandbox=1
  --label com.pixpilot.sandbox.agent=claude
  --label com.pixpilot.sandbox.worktree=<path>
  --label com.pixpilot.sandbox.repo=<path>
  --workdir /workspace
  [--network none --pull never]          # ONLY when --offline is passed
  -v <worktree>:/workspace                                   # read/write
  -v <repo>/.git:/repo/.git                                  # read/write, unless --no-git-mount
  -v <skills>:/coding-agent-sandbox/skills:ro                # read-only
  -v coding-agent-sandbox-auth-claude:/agent-state           # persistent OAuth tokens
  -v coding-agent-sandbox-npm-global:/home/node/.npm-global
  -v coding-agent-sandbox-cache-home:/home/node/.cache
  -v coding-agent-sandbox-package-cache:/cache
  -v coding-agent-sandbox-deps-<hash>:/workspace/node_modules
  -e <session env>
  <image>
```

Image: `node:22-bookworm-slim`, custom entrypoint, runs as `USER node` (non-root).

### 2.3 Current security posture — honest assessment

**Filesystem: reasonable.** Main checkout never mounted. Worktree read/write.
Shared `.git` read/write. Skills read-only.

**Network: none whatsoever.** When not offline, no `--network` flag is passed at
all. The container lands on Docker's default bridge, which gives it:

- unrestricted outbound to any host on the internet
- the host gateway / `host.docker.internal`
- the LAN (router, NAS, other machines)
- other containers on the default bridge
- the cloud metadata address `169.254.169.254`

**Container hardening: none.** No `--cap-drop`, no `--security-opt
no-new-privileges`, no `--read-only`, no `--pids-limit`, no `--memory`, no
`--cpus`. Non-root `USER node` is the only real control in place.

**Amplifier:** the `--full-access` flag defaults to **true**, which disables the
agent's own approval prompts. The agent executes commands unattended with
unrestricted egress. The network perimeter currently does none of the work that
the disabled approval prompts used to do.

### 2.4 The `--offline` flag is broken and will be replaced

`--offline` currently does two unrelated things at once:

- **(a)** skips network-dependent setup: skills sync, dependency install, image pull, login
- **(b)** adds `--network none`

(b) makes every supported agent non-functional, since all three are cloud agents
that cannot answer a single prompt without reaching their API. (a) is genuinely
useful but unreachable, because it is welded to (b). An expected outcome of this
work is replacing the boolean with a tri-state network mode.

### 2.5 The extension seam that matters

Language support is pluggable:

```ts
abstract class EnvironmentAdapter {
  abstract readonly id: string; // 'node'
  abstract readonly label: string; // 'JavaScript / TypeScript'
  abstract detect(worktreePath: string): boolean;
  abstract readonly installCommand: string; // 'ni'
  readonly volumePaths: readonly string[] = []; // ['/workspace/node_modules']
}
```

Only `NodeEnvironment` exists today. Go, Rust, Python and others are expected.
This class is the natural place to hang per-language egress rules.

---

## 3. What we are trying to solve

### Threat model

| #   | Threat                                                                                                                                                                           | Assessment                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| T1  | **Prompt injection into exfiltration.** Agent reads a malicious issue, README, dependency or web page containing instructions to POST source code or tokens to an attacker host. | Primary threat. High.                         |
| T2  | **Malicious dependency.** `npm` postinstall, `go generate`, build scripts — arbitrary code with full egress.                                                                     | High.                                         |
| T3  | **LAN pivot / metadata theft.** Container reaches the router, NAS, other containers, or `169.254.169.254`.                                                                       | Medium. Trivially preventable.                |
| T4  | **Credential theft.** The persistent `/agent-state` OAuth volume and the writable shared `.git` (remotes, credentials) are readable and exfiltratable.                           | High — and it is what T1 and T2 would target. |

### Why this is not a solved problem

- **Multi-language.** Each ecosystem has different registries. Go is the worst case: by default `go get` can fetch from _any_ VCS host on the internet.
- **Agents legitimately need to browse.** Web search and URL fetch mean arbitrary GET to arbitrary hosts. This directly contradicts an allowlist.
- **Concurrency is an advertised feature.** Running Claude, Codex and Copilot against the same task simultaneously is documented and supported.
- **HTTPS limits inspection.** A non-MITM proxy sees only the hostname (via `CONNECT` / SNI). It cannot see method or path, so "allow GET anywhere, block POST to unknown hosts" is not achievable without terminating TLS.
- **Windows / Docker Desktop** is the primary host, so anything requiring Linux-host-specific networking is a portability risk.

### Explicit non-goal

Preventing determined, sophisticated exfiltration. Data fits in a DNS label, a
URL path, or a query string. The realistic goal is: **remove the easy paths, and
make everything else auditable.**

---

## 4. Decided direction

Section 5 records the decisions and their rationale. This section is now the
specification, not a strawman.

### 4.1 Topology

```
agent container
  └── coding-agent-sandbox-net-<session>          (--internal + inhibit_ipv4)
        └── proxy sidecar (tinyproxy)
              └── coding-agent-sandbox-egress-<session>   (normal bridge)
                    └── internet
```

Everything is per session: one internal network, one egress network, one proxy
container, one statically rendered proxy configuration — created at session start
and removed at session end.

- The agent container joins **only** the internal network, created with
  `--internal` **and** `--opt com.docker.network.bridge.inhibit_ipv4=true`. It
  has no usable path to the internet, the LAN, the host or `169.254.169.254`.

> **`--internal` alone is not sufficient, and this was measured, not assumed.**
> An `--internal` network still has a gateway IP, the container still has a
> default route to it, and that gateway is the Docker host. Verified on Docker
> Desktop: a container on a plain `--internal` network reached a host process
> listening on `0.0.0.0` through the gateway address. On Linux Docker Engine the
> gateway is the developer's actual machine, so the exposure is worse — every
> service bound to `0.0.0.0`, including dev servers and databases.
>
> `inhibit_ipv4=true` stops Docker assigning the gateway address to the bridge
> interface, so there is nothing on-link to reach. Verified after the change:
> the host listener is unreachable, while Docker's embedded DNS (127.0.0.11) and
> container-to-container traffic to the proxy both still work.

- The proxy is the only member of both networks, and the only egress path.
- The egress network is per session rather than the shared default bridge, so the
  proxy's listener is unreachable from any other container. This costs one extra
  `network create`/`network rm` pair and removes the "open proxy sitting on the
  default bridge" problem outright, with no subnet arithmetic and no client ACL.
- No `NET_ADMIN`, no iptables inside the agent container, no host firewall, no
  daemon configuration, no compose file.
- Anything that ignores `HTTP_PROXY`/`HTTPS_PROXY` fails closed. External DNS
  also fails closed on the internal network; well-behaved clients do not resolve
  names themselves when a proxy is configured, they pass the hostname in
  `CONNECT`.

The claim that `--internal` closes every host and gateway path is **not** asserted
on trust. Section 8 defines the integration tests that verify it, and they are
part of this change.

### 4.2 Network modes, replacing `--offline`

| Mode     | Agent container network | Egress                                              | Bootstrap steps                   |
| -------- | ----------------------- | --------------------------------------------------- | --------------------------------- |
| `strict` | internal + proxy        | agent provider hosts + active adapter `egressHosts` | full                              |
| `open`   | internal + proxy        | any hostname, every hostname logged                 | full                              |
| `none`   | `--network none`        | nothing                                             | skipped (the old `--offline` (a)) |

`strict` is the default. `none` is exactly the old `--offline`: `--network none`,
`--pull never`, and the entrypoint's existing `SANDBOX_OFFLINE=1` path that skips
skills sync, dependency install, CLI install and login. The old flag's two jobs
stop being welded together because the useful half is no longer needed once a
network is present — `strict` and `open` run the full bootstrap.

`--offline` is kept as a deprecated alias for `--network none`, and warns.

In both proxying modes `ConnectPort 443` is the only permitted `CONNECT` port.
`open` widens the host set, not the port set.

### 4.3 Allowlist composition

In `strict`:

```
allowed = bootstrap hosts
        + AgentAdapter.egressHosts        (the selected agent's provider)
        + EnvironmentAdapter.egressHosts  (the detected project environment)
        + the repository's own HTTPS Git remote hosts
        + --allow-hosts                   (per session, never persisted)
```

`egressHosts` is a new readonly field on both adapter base classes, defaulting to
`[]`. Bootstrap hosts are a constant covering what the entrypoint needs before the
agent starts — the npm registry, because all three agent CLIs and the skills
repository install through npm.

| Source                      | Hosts                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| bootstrap                   | `registry.npmjs.org`                                                  |
| Claude Code                 | `api.anthropic.com`, `console.anthropic.com`, `statsig.anthropic.com` |
| OpenAI Codex                | `api.openai.com`, `auth.openai.com`, `chatgpt.com`                    |
| GitHub Copilot CLI          | `api.github.com`, `api.githubcopilot.com`, `github.com`               |
| Node environment            | `registry.npmjs.org`                                                  |
| Go environment (future)     | `proxy.golang.org`, `sum.golang.org`                                  |
| Rust environment (future)   | `index.crates.io`, `static.crates.io`                                 |
| Python environment (future) | `pypi.org`, `files.pythonhosted.org`                                  |

> The provider host lists above are a starting point and **must be verified
> empirically per agent** before release. The intended method: run each agent once
> in `open` mode and read the hostnames out of the proxy log. That is also the
> supported way for a user to discover what to widen for their own setup.

> **Added after the first real session.** The repository's own Git remote was
> missing, so `strict` broke `fetch`, `pull` and `push` in a tool whose whole
> point is committing to that repository. The remote host is now derived from
> `git config remote.*.url`, which is more principled than hardcoding a forge:
> it allows exactly the host this repository already talks to. SSH remotes are
> skipped, since they cannot traverse an HTTP proxy either way.
>
> The same session answered **D2**: Claude Code's `WebSearch` runs server-side
> and survives `strict` intact, but `WebFetch` runs client-side and fails for any
> host not on the allowlist - which is every documentation site. `strict` stays
> the default; `open` is the documented answer for research, and `--allow-hosts`
> covers the narrower case of one repository needing one extra CDN.

Go is solved by configuration rather than by a longer list: the Go adapter sets
`GOPROXY=https://proxy.golang.org` **without** `,direct`, plus
`GOSUMDB=sum.golang.org`. That collapses "any VCS host on the internet" to two
hosts.

### 4.4 Container hardening, same change

Applied to both the agent container and the proxy container:

- `--cap-drop=ALL`
- `--security-opt=no-new-privileges`
- `--pids-limit` (512 for the agent, 64 for the proxy)

Both are close to no-ops for a process already running as non-root `node` with no
file capabilities available — which is exactly why they are cheap to add and worth
having as defence in depth.

CPU and memory limits are **supported but unset by default**: new `--cpus` and
`--memory` options pass straight through to `docker run` only when the user
provides them. Build tools and test suites are the workload; silently capping them
would be a regression.

`--read-only` is **not** adopted. The workload writes to `/workspace`, the npm
global prefix and several caches, so it would require a tmpfs list that is
maintenance this change does not need.

### 4.5 Deliberately rejected

- **TLS MITM / certificate injection.** Would allow method and path rules, but
  requires decrypting the agent's own API traffic and breaks certificate-pinning
  tools.
- **A shared proxy across sessions.** Its allowlist becomes the union of every
  concurrent session, defeating per-environment `egressHosts`, and it needs
  runtime ACL multiplexing plus cross-session lifecycle management. Per-session
  static configuration is both smaller and tighter.
- **A third-party proxy image from Docker Hub.** A new supply-chain dependency on
  a security-critical component. Tinyproxy is installed from Debian packages
  through the tool's own controlled build path instead.
- **A hand-maintained global domain allowlist.** Breaks on every new language and
  every research task. A list that must be constantly patched looks like security
  without being it.
- **`NET_ADMIN` / iptables in the agent entrypoint**, host firewall rules, Docker
  daemon configuration, Docker Compose, and any manual host setup.
- **Complex preflight networking checks.** See D5.

### 4.6 Explicitly out of scope

- **DNS-based exfiltration and covert channels.** Data fits in a DNS label. The
  goal is to remove the easy outbound paths and make the rest auditable, not to
  provide data-loss prevention.
- **Credential isolation (T4).** The persistent `/agent-state` OAuth volume is
  **not** redesigned, removed or made conditional here. Every supported agent
  requires authentication to do anything, so removing the volume removes the
  product. Reduced credential exposure and Git credential scoping are a separate
  follow-up.
- **SSH.** No SSH proxying, no port-22 handling. HTTPS Git remotes keep working
  wherever their host is permitted.
- **Worktrees, Git mounts, the agent execution model.** The existing filesystem
  isolation model is preserved unchanged.

---

## 5. Decisions

**D1 — Topology. Decided: internal network + per-session proxy sidecar.** Chosen
over iptables-in-entrypoint (which needs `NET_ADMIN` inside the very container
being confined) and over userspace filters (per-tool, easy to skip). The agent has
no route off the internal network, so the proxy cannot be bypassed rather than
merely being the configured default. Docker Desktop runs the same Linux engine
inside its VM, so `--internal` is expected to behave identically on Windows and
macOS — expected, not assumed: §8 verifies it on each platform.

**D2 — Default mode. Decided: `strict`.** Safe-by-default is the right posture for
a tool whose `--full-access` default is `true`. `open` is one flag away and is the
documented answer for research tasks and for discovering a missing host. Whether
each agent's web search runs server-side (and so survives `strict` intact) is
measured per agent during implementation and written into the README; it does not
change the default.

**D3 — Shared or per-session proxy. Decided: per session.** N extra containers is
the cheaper problem. Each proxy gets a static, session-specific configuration
rendered once at start and never mutated. No runtime ACL multiplexing, no shared
lifecycle management.

**D4 — Build or pull the proxy image. Decided: build.** Tinyproxy from Debian
packages, via a second Dockerfile in the existing `docker/` build context, reusing
the existing content-hash build path. Self-contained, with no new registry
dependency on a security component, at the cost of one first-run build.

**D5 — Known breakages. Decided: fail clearly, no preflight detection.** Git over
SSH and raw-socket tools fail closed. No probing, no capability matrix, no warning
heuristics. Instead: `strict` prints its resolved allowed-host list once at session
start, and a non-zero session exit in `strict` prints

> This operation may require a host or protocol blocked by strict network mode.
> Retry with `--network open` if you trust this operation.

**D6 — Perimeter versus blast radius. Decided: both, sequenced.** The critique is
correct that a perimeter around a container holding a long-lived provider token
solves half the problem. It is still the half that stops T1 and T2 from reaching an
attacker host, and it closes T3 outright. Credential work is deferred to a
follow-up rather than dropped, and is not conditionally hacked into this change.

**D7 — Container hardening. Decided: same change.** `--cap-drop=ALL`,
`--security-opt=no-new-privileges` and `--pids-limit` are three lines in the same
argument builder this change already rewrites. Resource limits ship as options,
unconstrained by default.

---

## 6. Constraints any proposal must respect

- Everything driven by `docker` CLI calls from the Node CLI. No manual host setup,
  no compose file, no daemon reconfiguration.
- Works on Windows with Docker Desktop; portable to Linux Docker Engine and macOS
  with Docker Desktop.
- Must not break concurrent sessions. Every session gets its own internal network,
  egress network, proxy container and proxy configuration, named deterministically
  from the existing session identity.
- Networks and proxy containers carry the existing labels and are removed by the
  existing cleanup model, so stale resources stay detectable and prunable.
- Must not require the user to install anything beyond Docker.

---

## 7. Implementation plan

Deliberately small: one new adapter field, one new lifecycle module pair, a
rewritten argument builder, a second Dockerfile. No networking framework, no
abstraction layer over Docker.

### 7.1 Naming and labels

Derived from the existing `buildContainerName` session identity, so names are
deterministic, collision-free per agent/worktree pair, and greppable:

```
<session>      = the existing container-name hash suffix
net-internal     coding-agent-sandbox-net-<session>
net-egress       coding-agent-sandbox-egress-<session>
proxy            coding-agent-sandbox-proxy-<session>
```

All three carry `com.pixpilot.sandbox=1` plus the existing `.agent`, `.worktree`
and `.repo` labels, matching the agent container. Determinism means a crashed
session leaves objects that the next run of the same session removes before
recreating, so a stale proxy can never be adopted with a wrong allowlist.

### 7.2 Docker CLI sequence

Create, connect, then start — so the proxy never runs without its egress leg, and
there is no readiness race to poll for:

```
docker network create --internal --label … <net-internal>
docker network create            --label … <net-egress>
docker create --name <proxy> --network <net-internal> --label …
       --cap-drop=ALL --security-opt=no-new-privileges --pids-limit 64
       -e SANDBOX_PROXY_MODE=<mode>
       -e SANDBOX_PROXY_ALLOW=<newline-separated hosts>
       <proxy-image>
docker network connect <net-egress> <proxy>
docker start <proxy>
   … existing docker run, with --network <net-internal> …
docker rm -f <proxy>
docker network rm <net-egress> <net-internal>
```

Teardown runs in the same `finally` block that already prunes volumes, and is
best-effort with a warning, matching `pruneStaleVolumes`.

### 7.3 Proxy image and configuration

`docker/Dockerfile.proxy` — `FROM debian:bookworm-slim`, `apt-get install
tinyproxy ca-certificates`, copy the entrypoint, `USER tinyproxy`. Tinyproxy
listens on 8888, above 1024, so no capability is needed to bind, and the config
omits `User`/`Group` (dropping privileges would need `CAP_SETUID`, which is
dropped).

`docker/proxy-entrypoint.sh` renders the configuration once from environment
variables, then `exec`s tinyproxy. Environment-rendered rather than bind-mounted:
no host path translation on Windows, no CRLF or permission problems, and it
matches the existing `SANDBOX_*` entrypoint contract. The rendered file is static
for the container's life.

```
Port 8888
Timeout 600
ConnectPort 443          # CONNECT to 443 only — no SSH, no arbitrary ports
LogLevel Connect         # hostname per connection, to stdout (no LogFile under -d)
DisableViaHeader Yes
# strict mode only:
FilterDefaultDeny Yes
FilterExtended On
FilterCaseSensitive Off
FilterURLs Off
Filter /tmp/tinyproxy.filter
```

Filter entries are **anchored** regexes generated from the host list —
`^registry\.npmjs\.org$`, never bare `registry.npmjs.org`, which would also match
`registry.npmjs.org.attacker.example`. Hosts are validated against a conservative
pattern and their dots escaped before rendering; an entry that fails validation is
a hard error, not a silently dropped line. An optional leading `*.` in an adapter's
list renders as `^([a-z0-9-]+\.)+example\.com$`.

`open` mode omits the whole filter block and keeps `LogLevel Connect`, so every
hostname is still recorded.

Image tagging: `resolveImageTag` currently hashes every file in the flat `docker/`
context. Split it so the agent image hashes the non-proxy files and the proxy image
hashes only `Dockerfile.proxy` and `proxy-entrypoint.sh` — four lines, and it stops
a proxy tweak from forcing a rebuild of the heavy agent image.

### 7.4 Agent container changes

In `buildRunArgs`:

| Mode              | Flags                                                              |
| ----------------- | ------------------------------------------------------------------ |
| `strict` / `open` | `--network <net-internal>`                                         |
| `none`            | `--network none --pull never`                                      |
| all               | `--cap-drop=ALL --security-opt=no-new-privileges --pids-limit 512` |
| when provided     | `--cpus <n>`, `--memory <size>`                                    |

In `buildSessionEnv`, for the proxying modes:

```
HTTP_PROXY  / http_proxy   = http://<proxy>:8888
HTTPS_PROXY / https_proxy  = http://<proxy>:8888
NO_PROXY    / no_proxy     = localhost,127.0.0.1
NODE_USE_ENV_PROXY         = 1     (inert on Node 22, correct on Node 24+)
```

Both cases of each variable are set, because tool coverage is inconsistent. npm,
Git and curl honour these natively, so no `git config http.proxy` is needed.
`SANDBOX_OFFLINE` is derived from `mode === 'none'`; the entrypoint is otherwise
untouched.

> Risk to verify during implementation: Node 22's `fetch` does not apply proxy
> environment variables automatically. Each agent CLI must be confirmed to honour
> `HTTPS_PROXY` itself. Claude Code documents that it does; Codex and Copilot CLI
> need testing. If one does not, `strict` and `open` are both unusable for that
> agent, and the finding goes in the README rather than being papered over.

### 7.5 CLI surface

- `--network <strict|open|none>`, default `strict`.
- `--offline` becomes a deprecated alias for `--network none`; it warns, and the
  existing rejection of `--login`/`--update-agent`/`--rebuild-image` moves to
  `mode === 'none'`.
- `--cpus <n>` and `--memory <size>`, both unset by default.
- Wizard: the existing "internet access / offline" question becomes a three-way
  network-mode question.
- `strict` prints its resolved allowed-host list at session start; a non-zero exit
  in `strict` prints the D5 diagnostic.
- At teardown, the unique hostnames seen by the proxy are read from
  `docker logs <proxy>` before removal and printed as a session audit summary.
  This is the visible deliverable of `open` mode.

### 7.6 Files

**New**

| File                                   | Purpose                                             |
| -------------------------------------- | --------------------------------------------------- |
| `docker/Dockerfile.proxy`              | Tinyproxy from Debian packages                      |
| `docker/proxy-entrypoint.sh`           | Render static config from env, exec tinyproxy       |
| `src/network/network-mode.ts`          | `NetworkMode` type and parser                       |
| `src/network/resolve-egress-hosts.ts`  | bootstrap + agent + environment, deduped and sorted |
| `src/network/session-network-names.ts` | Deterministic names from the session identity       |
| `src/docker/ensure-session-network.ts` | Create networks, create/connect/start the proxy     |
| `src/docker/remove-session-network.ts` | Best-effort teardown and log summary                |

**Modified**

`src/constants.ts` (names, labels, port, bootstrap hosts) ·
`src/types.ts` (`SandboxOptions.network`/`cpus`/`memory`, `SessionPlan.network`/`proxyHost`) ·
`src/cli/create-program.ts` · `src/cli/resolve-cli-options.ts` ·
`src/cli/run-wizard.ts` · `src/docker/build-run-args.ts` ·
`src/docker/ensure-image.ts` (`offline` → mode, plus `ensureProxyImage`) ·
`src/session/build-session-env.ts` · `src/session/run-sandbox.ts` ·
`src/session/print-session-summary.ts` · `src/agents/agent-adapter.ts` and the
three agents · `src/environments/environment-adapter.ts` and
`node-environment.ts` · `src/docker/prune-volumes.ts` (extend to stale labeled
networks and proxy containers) · `README.md`.

### 7.7 Sequencing

1. Adapter `egressHosts` fields plus `resolveEgressHosts`. Pure, unit-testable, no
   Docker.
2. `NetworkMode`, the CLI flag, the `--offline` alias, the wizard, plan/env
   plumbing. No Docker behaviour change yet beyond `none` being the old `offline`.
3. Proxy image and entrypoint. Verifiable standalone with `docker run` by hand.
4. `ensure-session-network` / `remove-session-network`, wired into `run-sandbox`.
5. Container hardening flags and resource options in `buildRunArgs`.
6. Integration test suite (§8).
7. README, plus the empirically corrected provider host lists from step 6.

---

## 8. Test plan

### 8.1 Unit (existing vitest suite, no Docker)

- `buildRunArgs` per mode: `--network <net>` for `strict`/`open`,
  `--network none --pull never` for `none`, hardening flags always, resource flags
  only when set.
- `resolveEgressHosts`: composition, dedupe, ordering; an undetected environment
  contributes nothing.
- Filter rendering: anchoring, dot escaping, `*.` expansion, rejection of an
  invalid host string.
- `buildSessionEnv`: proxy variables present in `strict`/`open`, absent in `none`;
  `SANDBOX_OFFLINE` follows the mode.
- Deterministic network and proxy naming.

### 8.2 Integration (opt-in, requires Docker)

A separate `test/integration/` suite gated behind an environment variable, since
the shared vitest config runs in CI without Docker. Each case is a
`docker run --rm --network <net-internal> <image> …` probe.

| #   | Assertion                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Direct internet is blocked: `curl --noproxy '*' --max-time 5 https://example.com` fails                                                                                                                                             |
| 2   | LAN is blocked: `curl --noproxy '*'` to an RFC1918 address fails                                                                                                                                                                    |
| 3   | `169.254.169.254` is blocked                                                                                                                                                                                                        |
| 4   | Gateway behaviour: a default route and a gateway address still exist; the assertion is that the gateway is **unreachable**, so no host process listening on `0.0.0.0` can be reached through it. Regression test for `inhibit_ipv4` |
| 5   | `host.docker.internal` is unresolvable, or resolvable but unreachable — asserted, not assumed                                                                                                                                       |
| 6   | No proxy bypass: a direct, `--noproxy` request to an **allowed** host still fails                                                                                                                                                   |
| 7   | An allowed host through the proxy returns 200 (`registry.npmjs.org`)                                                                                                                                                                |
| 8   | A blocked host through the proxy is rejected (tinyproxy 403 / curl proxy failure)                                                                                                                                                   |
| 9   | `open` mode reaches an arbitrary host, and that hostname appears in `docker logs <proxy>`                                                                                                                                           |
| 10  | `none` mode has no network at all: only `lo`, every probe fails                                                                                                                                                                     |

Extra, cheap: `CONNECT` to port 22 is refused even in `open` mode, confirming
`ConnectPort 443`.

Cases 1–6 are the evidence for §4.1's refusal to simply assert that `--internal`
is sufficient. They must be run on Windows with Docker Desktop, Linux Docker
Engine, and macOS with Docker Desktop before release; a difference on any of the
three is a finding, not a test-environment problem.

### 8.3 Manual, per agent

Each of the three agents launched in `strict`, confirming: the agent
authenticates, answers a prompt, and — the D2 question — whether its web search and
URL fetch still work. Results recorded in the README.
