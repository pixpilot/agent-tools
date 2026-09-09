# @pixpilot/agent-config-sync

Cross-platform synchronization for shared coding-agent configuration. It never runs code from the configuration directory.

The source directory may contain any of these optional assets:

```text
configs/
  skills/
  prompts/
  mcp.jsonc
  GLOBAL-AI-RULES.md
```

`mcp.jsonc` is the source of truth for every supported agent. It is a
JSON/JSONC object keyed by server name; `$defaults.startupTimeoutSec` applies
one startup limit to every server:

```jsonc
{
  "$schema": "https://unpkg.com/@pixpilot/agent-config-sync/schemas/mcp.schema.json",
  "$defaults": {
    "startupTimeoutSec": 120
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
}
```

Add the `$schema` URL to `mcp.jsonc` or `agents.jsonc` for editor validation and
completion. The schemas are published with this package at:

- `https://unpkg.com/@pixpilot/agent-config-sync/schemas/mcp.schema.json`
- `https://unpkg.com/@pixpilot/agent-config-sync/schemas/agents.schema.json`

The synchronizer writes that setting as Codex's per-server
`startup_timeout_sec` and enables Codex's full startup wait, Claude Code's
global `MCP_TIMEOUT` environment variable, and Copilot CLI's per-server
`timeout` in milliseconds. Copilot applies its timeout to both tool discovery
and tool calls because it has no separate startup setting.

```sh
agent-config-sync --configs-dir ./configs
agent-config-sync --configs-dir ./configs --agent codex
agent-config-sync --configs-dir ./configs --home-dir /tmp/agent-home --agent claude
```

`skills` are installed in `~/.agents/skills`. Prompt, MCP, and global-instruction destinations are resolved centrally for Windows, macOS, and Linux. MCP environment variables, credentials, headers, token-like flags, and sensitive URL parts are omitted.
