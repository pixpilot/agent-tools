# Agent Tools

> A modern TypeScript monorepo managed with pnpm and TurboRepo.

## 🚀 Getting Started

### Development

Build all packages:

```sh
pnpm build
```

Run tests:

```sh
pnpm test
```

Lint and format:

```sh
pnpm lint
pnpm format
```

### Create a New Package

Generate a new package in the monorepo:

```sh
pnpm run gen:package
```

## 📦 Packages

### [agent-config-sync](./packages/agent-config-sync/README.md)

Synchronize agent configuration files across supported tools.

### [coding-agent-sandbox](./packages/coding-agent-sandbox/README.md)

Run AI coding agents (Claude Code, OpenAI Codex, GitHub Copilot CLI) inside Docker against a dedicated Git worktree.


## 🚢 Releases

This project uses [Changesets](https://github.com/changesets/changesets) for version management and publishing.

## 📄 License

[MIT](LICENSE)
