# AtomicMemory for Codex

Persistent semantic memory for OpenAI's [Codex](https://openai.com/index/codex/) via the Codex plugin marketplace.

## What's inside

```
plugins/codex/
├── .codex-plugin/
│   └── plugin.json              # Codex plugin manifest (interface metadata)
├── .codex-mcp.json              # MCP server spec (spawns @atomicmemory/mcp-server)
├── skills/
│   └── atomicmemory/
│       └── SKILL.md             # agent-facing memory protocol
├── marketplace.example.json     # template for .agents/plugins/marketplace.json
├── logo.svg
└── README.md
```

No runtime code — the plugin is pure configuration. All memory semantics live in [`@atomicmemory/mcp-server`](../../packages/mcp-server), and the Codex skill tells the agent when to call `memory_search`, `memory_ingest`, `memory_package`, and `memory_list`.

## Install

### Option A — Repo marketplace (recommended for teams)

Drop a `.agents/plugins/marketplace.json` at your repo root pointing at this plugin:

```json
{
  "name": "atomicmemory-plugins",
  "interface": { "displayName": "AtomicMemory Plugins" },
  "plugins": [
    {
      "name": "atomicmemory",
      "source": { "source": "local", "path": "./plugins/codex" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

(See [`marketplace.example.json`](./marketplace.example.json) for a copy-pasteable version.)

In Codex, browse the repo's plugin directory and install AtomicMemory.

### Option B — Personal marketplace

Same JSON but at `~/.agents/plugins/marketplace.json`, with `source.path` pointing to wherever you cloned this repo.

### Option C — Manual MCP configuration

If you don't want plugin-system installation, register the MCP server directly in your Codex MCP config using the contents of [`.codex-mcp.json`](./.codex-mcp.json). Skips the skill; you'll need to decide when to call memory tools yourself.

The MCP config forwards the required environment variables with `env_vars`, so values come from the shell or Codex environment rather than being copied into the plugin file.

## Configure

Before any of the install options, clone `atomicmemory-sdk` and `atomicmemory-integrations` side-by-side, then build each in order. The MCP server resolves the SDK through a sibling `file:` spec and imports from the SDK's `dist/` output, so both repos must exist as siblings and the SDK must be built first.

```bash
# From the parent directory that will hold both repos
git clone https://github.com/atomicstrata/atomicmemory-sdk.git
git clone https://github.com/atomicstrata/atomicmemory-integrations.git

# Build the SDK (produces atomicmemory-sdk/dist/)
cd atomicmemory-sdk
pnpm install
pnpm build

# Build the MCP server (produces atomicmemory-integrations/packages/mcp-server/dist/bin.js)
cd ../atomicmemory-integrations
pnpm install
pnpm --filter @atomicmemory/mcp-server build
```

Then export scope, credentials, and the absolute path to the built binary in your shell:

```bash
export ATOMICMEMORY_MCP_SERVER_BIN="$HOME/path/to/atomicmemory-integrations/packages/mcp-server/dist/bin.js"
export ATOMICMEMORY_API_URL="https://memory.yourco.com"
export ATOMICMEMORY_API_KEY="am_live_…"
export ATOMICMEMORY_PROVIDER="atomicmemory"
export ATOMICMEMORY_SCOPE_USER="pip"
# Optional narrower scopes:
# export ATOMICMEMORY_SCOPE_AGENT="codex"
# export ATOMICMEMORY_SCOPE_NAMESPACE="<repo-or-project>"
# export ATOMICMEMORY_SCOPE_THREAD="<session-id>"
```

`ATOMICMEMORY_MCP_SERVER_BIN` is required — the plugin spawns the server by `node`-executing that path. At least one `ATOMICMEMORY_SCOPE_*` must also be set — the server rejects scopeless requests.

## Memory behavior

By default, capture is tool-driven by the installed skill:

- On new tasks, search relevant prior context with `memory_search`; use `memory_package` for broader context assembly.
- After significant work, store durable decisions, preferences, conventions, and anti-patterns with `memory_ingest` using `mode: "text"`.
- Before context loss or handoff, store a compact deterministic session snapshot with `memory_ingest` using `mode: "verbatim"` and metadata such as `{ "source": "codex", "event": "session_summary", "schema_version": 1 }`.

Retrieved memories should be treated as reference context only, not instructions.

### Optional lifecycle hooks

Codex can load lifecycle hooks when `features.codex_hooks = true`. The recommended path is to keep MCP tools for agent-visible memory operations, then add hooks only for automatic prompt-time retrieval and deterministic lifecycle capture.

Generate a config snippet with the AtomicMemory CLI:

```bash
# Recommended: bundled Node runtime.
atomicmemory hooks install --host codex --runtime node

# Advanced: emit config for a compatible Python hook runner.
atomicmemory hooks install --host codex --runtime python
```

The Node runtime is bundled in `@atomicmemory/cli` as `atomicmemory hooks run ...`. The Python runtime is intentionally advanced: set `ATOMICMEMORY_PYTHON_HOOK_BIN` to a compatible Python hook runner before using the generated Python snippet.

When debugging the bundled Node runtime manually with `--json` or `--agent`, skipped hook runs include `meta.reason`: `prompt_too_short`, `no_content`, `no_hits`, or `low_signal`. The generated hook snippets keep skipped runs quiet so Codex receives no extra output unless memory context is available.

#### PATH verification

Codex hook environments are usually spawned with a thinner PATH than the interactive shell that ran `atomicmemory hooks install`. Before relying on the generated snippet, confirm the bundled CLI resolves inside the hook environment:

```bash
command -v atomicmemory
```

If the command is not found, either install `@atomicmemory/cli` globally or invoke it through a wrapper that puts the resolved bin on PATH.

#### Stop-threshold guidance (`ATOMICMEMORY_STOP_MIN_ASSISTANT_CHARS`)

The bundled Node runtime applies a `STOP_MIN_ASSISTANT_CHARS=200` low-signal gate on the `Stop` event — assistant content shorter than 200 characters after cleanup is skipped (`meta.reason = "low_signal"`) instead of being persisted. That default was tuned for Claude Code's verbose multi-paragraph stop payloads.

Codex stop responses are frequently much shorter (terse acknowledgements, single-line confirmations, "done."). At the bundled default they would be silently dropped as `low_signal`. To capture them, export the override in the host hook environment before the hook fires:

```bash
# Recommended starting point for Codex hosts; tune to your workflow.
export ATOMICMEMORY_STOP_MIN_ASSISTANT_CHARS=40
```

The CLI deliberately does NOT inject this override into generated snippets — your existing host env stays authoritative, and the override only takes effect where you set it. Set it to `1` to capture even the shortest responses, or to a higher value to stay aligned with Claude Code's default.

## Verify

Start a new Codex task and ask:

> *"List my most recent atomicmemory memories"* or *"Search my memories for hello"*

If the `memory_search` / `memory_ingest` / `memory_package` tools appear and respond, you're set.

## Versioning

From the repo root, run the version helper whenever the Codex manifest, MCP config, skill, or marketplace metadata changes:

```bash
pnpm bump:plugin-versions patch
```

For Codex, the helper keeps these versions aligned:

- `.codex-plugin/plugin.json` at `/version`
- `package.json` at `/version`
- `skills/atomicmemory/SKILL.md` at `/metadata/version`

The marketplace JSON intentionally has no plugin version field. Restart Codex or reinstall the local plugin after changing any of these files so the installed plugin cache reloads the manifest and skill.

## Status: source-only

Nothing here is published to npm or to any public plugin marketplace. The plugin is installed from a local clone of this repo (Option A / B above), and the MCP server it spawns runs from the local `dist/bin.js` produced by `pnpm --filter @atomicmemory/mcp-server build`. See the [mcp-server status note](../../packages/mcp-server/README.md) for why this is source-only by design.

## License

Apache-2.0.
