/**
 * @file Golden-output tests for the `setup codex|cursor` host config
 * templates. These lock the exact MCP server shape and Cursor rule
 * contents so accidental drift (renamed env vars, broken JSON, dropped
 * rule frontmatter) surfaces here before reaching operators or the
 * docs site that documents these snippets.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  codexConfigToml,
  codexMcpAddCommand,
  cursorMcpJson,
  cursorMemoryRule,
} from '../commands/setup/host/templates.js';

test('codexConfigToml emits an [mcp_servers.atomicmemory] block with npx -y launch', () => {
  const toml = codexConfigToml();
  assert.match(toml, /^\[mcp_servers\.atomicmemory\]/m);
  assert.match(toml, /^command = "npx"$/m);
  assert.match(toml, /^args = \["-y", "@atomicmemory\/mcp-server"\]$/m);
});

test('codexConfigToml env array lists every ATOMICMEMORY_* passthrough operators need', () => {
  const toml = codexConfigToml();
  for (const name of [
    'ATOMICMEMORY_API_URL',
    'ATOMICMEMORY_API_KEY',
    'ATOMICMEMORY_PROVIDER',
    'ATOMICMEMORY_SCOPE_USER',
    'ATOMICMEMORY_SCOPE_AGENT',
    'ATOMICMEMORY_SCOPE_NAMESPACE',
    'ATOMICMEMORY_SCOPE_THREAD',
  ]) {
    assert.ok(toml.includes(`"${name}"`), `env must list ${name}`);
  }
});

test('codexMcpAddCommand uses npx -y @atomicmemory/mcp-server with --env passthroughs', () => {
  const cmd = codexMcpAddCommand();
  assert.match(cmd, /^codex mcp add atomicmemory \\$/m);
  assert.match(cmd, /-- npx -y @atomicmemory\/mcp-server$/m);
  // Must mirror codexConfigToml()'s env array exactly so the two install
  // paths produce the same per-invocation environment for Codex.
  for (const name of [
    'ATOMICMEMORY_API_URL',
    'ATOMICMEMORY_API_KEY',
    'ATOMICMEMORY_PROVIDER',
    'ATOMICMEMORY_SCOPE_USER',
    'ATOMICMEMORY_SCOPE_AGENT',
    'ATOMICMEMORY_SCOPE_NAMESPACE',
    'ATOMICMEMORY_SCOPE_THREAD',
  ]) {
    assert.match(
      cmd,
      new RegExp(`--env ${name}="\\$${name}"`),
      `--env list must pass ${name}`,
    );
  }
});

test('cursorMcpJson is valid JSON with stdio + Cursor env substitution', () => {
  const json = cursorMcpJson();
  // Must parse - protects against accidental string-interpolation errors.
  const parsed = JSON.parse(json) as {
    mcpServers: {
      atomicmemory: { type: string; command: string; args: string[]; env: Record<string, string> };
    };
  };
  const server = parsed.mcpServers.atomicmemory;
  assert.equal(server.type, 'stdio');
  assert.equal(server.command, 'npx');
  assert.deepEqual(server.args, ['-y', '@atomicmemory/mcp-server']);
  for (const name of [
    'ATOMICMEMORY_API_URL',
    'ATOMICMEMORY_API_KEY',
    'ATOMICMEMORY_PROVIDER',
    'ATOMICMEMORY_SCOPE_USER',
  ]) {
    assert.equal(server.env[name], `\${env:${name}}`, `env[${name}] must use Cursor's ${'${env:NAME}'} form`);
  }
});

test('cursorMemoryRule frontmatter is alwaysApply with the four MCP tool names called out', () => {
  const rule = cursorMemoryRule();
  assert.match(rule, /^---$/m);
  assert.match(rule, /^alwaysApply:\s*true$/m);
  // Tools an operator's Cursor agent must know about. Drop one and a
  // user's rule no longer documents the available memory surface.
  for (const tool of ['memory_search', 'memory_ingest', 'memory_package']) {
    assert.ok(rule.includes(tool), `rule must mention ${tool}`);
  }
  // Prompt-injection mitigation: rule must explicitly tell the agent
  // not to follow instructions found inside retrieved memories.
  assert.match(rule, /reference context only/i);
});
