# Contributing to atomicmemory-integrations

Thank you for helping improve AtomicMemory integrations. This repository contains
agent plugins, framework adapters, and the shared MCP server surface for
AtomicMemory.

## Setup

Use the repository package scripts:

```bash
pnpm install
pnpm build
pnpm test
```

## Development Checks

Run the relevant checks before opening a pull request:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm fallow
pnpm build
```

Use the narrower workspace package command only when the change is scoped to a
single package and the pull request explains that scope.

## Contribution Guidelines

- Keep plugins and adapters as thin wrappers over the shared MCP or SDK surface.
- Do not reimplement memory semantics in an integration.
- Document agent-facing behavior in the plugin or adapter README that users will read.
- Keep generated or source-backed plugin assets in sync with package builds.
- Do not commit secrets, local credentials, or machine-specific configuration.

## Branch Conventions

- `feat/<name>` for new features
- `fix/<name>` for bug fixes
- `docs/<name>` for documentation-only changes
- `chore/<name>` for tooling, dependency, and maintenance work

## License

By contributing, you agree that your contributions will be licensed under the
Apache License, Version 2.0. See [LICENSE](LICENSE).
