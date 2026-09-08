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

`mcp.jsonc` is a JSON/JSONC object keyed by server name:

```jsonc
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
}
```

```sh
agent-config-sync --configs-dir ./configs
agent-config-sync --configs-dir ./configs --agent codex
agent-config-sync --configs-dir ./configs --home-dir /tmp/agent-home --agent claude
```

`skills` are installed in `~/.agents/skills`. Prompt, MCP, and global-instruction destinations are resolved centrally for Windows, macOS, and Linux. MCP environment variables, credentials, headers, token-like flags, and sensitive URL parts are omitted.
