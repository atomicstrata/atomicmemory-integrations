# atomicmemory-integrations

[![CI](https://github.com/atomicstrata/atomicmemory-integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/atomicstrata/atomicmemory-integrations/actions/workflows/ci.yml)
[![MCP Server](https://img.shields.io/npm/v/%40atomicmemory%2Fmcp-server?label=mcp-server)](https://www.npmjs.com/package/@atomicmemory/mcp-server)
[![CLI](https://img.shields.io/npm/v/%40atomicmemory%2Fcli?label=cli)](https://www.npmjs.com/package/@atomicmemory/cli)
[![Docs](https://img.shields.io/badge/docs-docs.atomicstrata.ai-blue)](https://docs.atomicstrata.ai)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Plugins, adapters, and the shared MCP server that expose [AtomicMemory](https://github.com/atomicstrata/atomicmemory-core) to coding agents and AI frameworks.

**Docs:** [docs.atomicstrata.ai/integrations](https://docs.atomicstrata.ai/integrations)

AtomicMemory Core currently reaches cost-Pareto SOTA on BEAM-100K, BEAM-1M, and LoCoMo10, with BEAM-10M parity against the strongest published Mem0-new result. This repo exposes that memory layer to coding agents, MCP clients, CLI workflows, and framework adapters.

## What's inside

```
packages/
├── cli/                     # @atomicmemory/cli — human/agent CLI
└── mcp-server/              # @atomicmemory/mcp-server — the spine
                             # exposes memory_search / memory_ingest / memory_package
                             # over MCP, wraps @atomicmemory/sdk

plugins/                     # coding-agent wrappers
├── claude-code/             # Claude Code plugin (plugin.json + SKILL.md)
├── codex/                   # Codex plugin (manifest + MCP config + SKILL.md)
├── hermes/                  # Hermes native memory provider (Python SDK-backed)
├── openclaw/                # OpenClaw plugin (openclaw.plugin.json + skill.yaml)
└── cursor/                  # Cursor MCP config + .cursor/rules template

adapters/                    # framework adapters
├── vercel-ai-sdk/           # @atomicmemory/vercel-ai
└── openai-agents-sdk/       # @atomicmemory/openai-agents

examples/                    # runnable examples (coming soon)
```

Additional framework adapters (`adapters/langchain-js`, `adapters/mastra`, `adapters/langgraph-js`) are tracked as planned work — see the docs site at https://docs.atomicstrata.ai/integrations/ for status.

## Quick Start

### MCP tools

Register the published MCP server with any MCP-compatible host:

```json
{
  "mcpServers": {
    "atomicmemory": {
      "command": "npx",
      "args": ["-y", "@atomicmemory/mcp-server"]
    }
  }
}
```

The server exposes `memory_search`, `memory_ingest`, `memory_package`, and `memory_list`.

### CLI

```bash
npm install -g @atomicmemory/cli
atomicmemory init \
  --profile local \
  --provider atomicmemory \
  --api-url http://127.0.0.1:3050 \
  --trust-surface local \
  --user "$USER" \
  --namespace quickstart
atomicmemory doctor
```

For agent-specific setup, see the [integrations guide](https://docs.atomicstrata.ai/integrations).

## Architecture

All coding-agent plugins are thin wrappers over the same `@atomicmemory/mcp-server` process. The shared MCP surface exposes `memory_search`, `memory_package`, `memory_ingest`, and `memory_list` with extraction modes (`text`, `messages`) plus deterministic one-record snapshots (`verbatim`). A plugin's job is:

1. Ship the agent-facing skill/manifest in the shape that agent expects.
2. Tell the agent how to spawn the MCP server with the user's config.
3. Nothing else.

Memory semantics live in [`@atomicmemory/sdk`](https://github.com/atomicstrata/atomicmemory-sdk); storage and retrieval live in [`atomicmemory-core`](https://github.com/atomicstrata/atomicmemory-core). Plugins in this repo do not re-implement memory — they adapt the surface.

The `@atomicmemory/cli` package is separate from the MCP stdio server. It uses the same SDK directly, but is designed for normal terminal and agent-script workflows: an Ink/React interactive UI, Honcho-style help, `init`, `doctor`, grouped `memory` / `lifecycle` / `audit` / `lessons` / `agents` / `runtime` / `config` commands, and stable `--agent` JSON output.

**Hermes is the exception** to the MCP-only wrapper shape. Hermes' native memory-provider API gives the integration first-class access to `prefetch`, `queue_prefetch`, and `sync_turn` lifecycle hooks, which MCP cannot supply. The Hermes plugin uses the published `atomicmemory` Python SDK, so the Python lifecycle code never reaches into core HTTP directly.

## Develop

```bash
pnpm install
pnpm build
pnpm test
```

### Codebase analysis

This repo uses [Fallow](https://docs.fallow.tools/) for dead-code, duplication, and complexity analysis.

```bash
pnpm fallow            # full analysis
pnpm fallow:audit      # changed-file audit for PR/agent review
pnpm fallow:dead-code  # unused files/exports/dependencies
pnpm fallow:dupes      # duplicated code
pnpm fallow:health     # complexity and maintainability
```

Fallow is configured in `.fallowrc.json`. The `.fallow/` cache directory is intentionally ignored.

## Install, update, and verify local plugins

When changing source-backed plugin assets, updating the repo does not
automatically update an installed agent plugin. Rebuild changed packages,
refresh the agent plugin install, then restart the host agent so it reloads
hook and MCP configuration.

### 1. Rebuild after source changes

Build the SDK first if it changed, then rebuild this repo:

```bash
cd ../atomicmemory-sdk
pnpm build

cd ../atomicmemory-integrations
pnpm --filter @atomicmemory/mcp-server build
pnpm build
```

`ATOMICMEMORY_MCP_SERVER_BIN` must point at the rebuilt file:

```bash
export ATOMICMEMORY_MCP_SERVER_BIN="/absolute/path/to/atomicmemory-integrations/packages/mcp-server/dist/bin.js"
test -f "$ATOMICMEMORY_MCP_SERVER_BIN"
```

### Version bump helper

Use the repo helper whenever plugin-facing files change:

```bash
# Verify Claude, Codex, Hermes, OpenClaw, and Cursor plugin versions are aligned:
pnpm check:plugin-versions

# Bump all plugin versions by semver:
pnpm bump:plugin-versions patch
pnpm bump:plugin-versions minor
pnpm bump:plugin-versions major

# Or set an explicit version:
pnpm bump:plugin-versions 0.1.2
```

The helper updates every version field used by the current plugin manifests, packages, skills, Cursor package metadata, and Claude marketplace metadata.

### 2. Claude Code

Claude Code updates are version-gated. If hook scripts, `hooks.json`, `.claude-plugin/plugin.json`, skills, or marketplace metadata change, bump the plugin versions with `pnpm bump:plugin-versions <patch|minor|major|x.y.z>` before asking users to run `claude plugin update`. For Claude, the helper keeps these fields in sync:

- `.claude-plugin/marketplace.json` at `/plugins/*/version`
- `plugins/claude-code/.claude-plugin/plugin.json` at `/version`
- `plugins/claude-code/package.json` at `/version`

If the Claude version stays unchanged, `claude plugin update claude-code@atomicmemory` can correctly report "already at the latest version" while its installed cache still contains older files.

Make sure Claude's marketplace points at this checkout:

```bash
claude plugin marketplace list
```

If `atomicmemory` points at an old clone, replace it:

```bash
claude plugin marketplace remove atomicmemory
claude plugin marketplace add ./ --scope user
```

Install or refresh the plugin cache:

```bash
# If the plugin is not installed yet:
claude plugin install claude-code@atomicmemory

# If the plugin is already installed:
claude plugin update claude-code@atomicmemory
```

Then fully restart Claude Code. Running Claude sessions can keep the previous hook registration in memory. Do not treat `~/.claude/plugins/cache/...` as the source of truth; it is only Claude's installed cache.

Required env before launching Claude Code:

```bash
export ATOMICMEMORY_API_URL="https://memory.yourco.com"
export ATOMICMEMORY_API_KEY="am_live_..."
export ATOMICMEMORY_PROVIDER="atomicmemory"
export ATOMICMEMORY_SCOPE_USER="$USER"
export ATOMICMEMORY_CAPTURE_LEVEL="balanced"
```

Smoke-test the installed PreCompact hook. It should print nothing and exit `0`:

```bash
PLUGIN_ROOT=$(ls -td ~/.claude/plugins/cache/atomicmemory/claude-code/* | head -n 1)
printf '{"trigger":"manual","session_id":"smoke"}' \
  | bash "$PLUGIN_ROOT/scripts/on_pre_compact.sh"
```

In Claude Code, verify:

- `claude plugin list` shows `claude-code@atomicmemory` enabled.
- `/compact` is not blocked by `PreCompact`.
- A new session can see `memory_search`, `memory_ingest`, `memory_package`, and `memory_list`.

### 3. Codex

The Codex plugin is MCP-and-skill first, and still points at the built MCP server. Codex lifecycle hooks are optional: use the CLI hook installer to generate host config when you want prompt-time retrieval or deterministic lifecycle capture outside tool calls. Node is the default runtime; Python is an advanced runtime contract for teams that provide a compatible Python hook runner.

```bash
# Recommended default: bundled Node CLI hook runner.
atomicmemory hooks install --host codex --runtime node

# Advanced: emit the same host config shape for a Python hook runner.
atomicmemory hooks install --host codex --runtime python
```

After changing `.codex-mcp.json`, skills, hook guidance, or the MCP server:

```bash
pnpm --filter @atomicmemory/mcp-server build
```

Run `pnpm bump:plugin-versions <patch|minor|major|x.y.z>` when `.codex-plugin/plugin.json`, `.codex-mcp.json`, skills, or marketplace metadata change. For Codex, the helper keeps these fields in sync:

- `plugins/codex/.codex-plugin/plugin.json` at `/version`
- `plugins/codex/package.json` at `/version`
- `plugins/codex/skills/atomicmemory/SKILL.md` at `/metadata/version`

The Codex marketplace entry does not carry a plugin version; the plugin manifest and skill metadata are the source of truth.

Restart Codex or reinstall the local plugin from the repo/personal marketplace so it reloads `.codex-mcp.json` and `SKILL.md`. Verify `ATOMICMEMORY_MCP_SERVER_BIN`, `ATOMICMEMORY_API_URL`, `ATOMICMEMORY_API_KEY`, `ATOMICMEMORY_PROVIDER`, and at least one `ATOMICMEMORY_SCOPE_*` env var are visible to Codex.

### 4. OpenClaw

After changing OpenClaw plugin code or the shared MCP server:

```bash
pnpm --filter @atomicmemory/mcp-server build
pnpm --filter @atomicmemory/openclaw-plugin build

cd plugins/openclaw
claw plugin install .
```

Run `pnpm bump:plugin-versions <patch|minor|major|x.y.z>` when `openclaw.plugin.json`, skill instructions, package metadata, or provider registration changes. For OpenClaw, the helper keeps these fields in sync:

- `plugins/openclaw/openclaw.plugin.json` at `/version`
- `plugins/openclaw/package.json` at `/version`
- `plugins/openclaw/skills/atomicmemory/skill.yaml` at `/version`

Restart the OpenClaw host if it keeps plugin modules loaded. Verify the plugin registers `atomicmemory.memory` and that config includes `apiUrl`, `apiKey`, `provider`, and `scope.user`.

### 5. Hermes

The Hermes integration is a Python memory provider backed by the published
`atomicmemory` SDK. After changing the provider or SDK adapter:

```bash
python3 -m unittest discover plugins/hermes/tests
```

Run `pnpm bump:plugin-versions <patch|minor|major|x.y.z>` when
`plugins/hermes/__init__.py`, `client.py`, `python_sdk.py`,
`plugin.yaml`, README, tests, or package metadata change. For Hermes, the
helper keeps these fields in sync:

- `plugins/hermes/plugin.yaml` at `/version`
- `plugins/hermes/package.json` at `/version`

For dev installs, symlink the plugin into Hermes' memory directory. Hermes
installs the published Python SDK from `plugins/hermes/plugin.yaml`:

```bash
mkdir -p "$HERMES_HOME/plugins/memory"
ln -s "$(pwd)/plugins/hermes" "$HERMES_HOME/plugins/memory/atomicmemory"
hermes memory setup     # select "atomicmemory"
hermes memory status    # confirm "atomicmemory" is active
```

Required baseline env before launching Hermes:

```bash
export ATOMICMEMORY_API_URL="https://memory.yourco.com"
# Optional:
# export ATOMICMEMORY_API_KEY="..."
# export ATOMICMEMORY_MEMORY_SCOPE="shared"   # or siloed
# export ATOMICMEMORY_MEMORY_MODE="hybrid"    # hybrid | context | tools
```

Hermes scoping behavior:

- `memory_scope=shared` (default) — Hermes recalls memories from every
  AtomicMemory tool the user has touched.
- `memory_scope=siloed` — Hermes recalls only Hermes-ingested memories. The
  SDK adapter enforces this via the AtomicMemory namespace source-site filter;
  if the configured provider is not AtomicMemory, the client fails loudly with
  `PROVIDER_UNSUPPORTED`.

All Hermes writes are stamped `provenance.source = "hermes"` and
`provenance.sourceUrl = "hermes://session/<session_id>"` regardless of
scope mode.

### 6. Cursor

Cursor uses project or global MCP config plus project rules. After changing the shared MCP server or Cursor templates:

```bash
pnpm --filter @atomicmemory/mcp-server build
```

Run `pnpm bump:plugin-versions <patch|minor|major|x.y.z>` when `plugins/cursor/.cursor/mcp.json`, `plugins/cursor/.cursor/rules/atomicmemory.mdc`, or package metadata changes. For Cursor, the helper keeps this field in sync:

- `plugins/cursor/package.json` at `/version`

From the Cursor project root, copy the template files from your integrations clone:

```bash
mkdir -p .cursor/rules
cp /absolute/path/to/atomicmemory-integrations/plugins/cursor/.cursor/mcp.json .cursor/mcp.json
cp /absolute/path/to/atomicmemory-integrations/plugins/cursor/.cursor/rules/atomicmemory.mdc .cursor/rules/atomicmemory.mdc
```

If the project already has `.cursor/mcp.json`, merge the `atomicmemory` server entry into `mcpServers` instead of replacing the file.

Required env before launching Cursor:

```bash
export ATOMICMEMORY_API_URL="https://memory.yourco.com"
export ATOMICMEMORY_API_KEY="am_live_..."
export ATOMICMEMORY_PROVIDER="atomicmemory"
export ATOMICMEMORY_SCOPE_USER="$USER"
export ATOMICMEMORY_SCOPE_AGENT="cursor"
```

Restart Cursor after changing MCP config or environment. Verify in Cursor Settings -> Tools & MCP, or with `cursor-agent mcp list` and `cursor-agent mcp list-tools atomicmemory`.

## License

Apache-2.0.
