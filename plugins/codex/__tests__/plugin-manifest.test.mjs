/**
 * @file Contract tests for the Codex plugin scaffolding. Locks the
 * shape of `.codex-plugin/plugin.json`, `.codex-mcp.json`,
 * `marketplace.example.json`, and the bundled skill so accidental
 * field renames or drops surface here before they reach a marketplace
 * submission.
 *
 * These are validation checks against the structure that the bundled
 * Codex plugin-creator skill produces (see the plan's reference for
 * the source-of-truth URL); they intentionally do NOT depend on Codex
 * being installed locally.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(relPath) {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, relPath), 'utf8'));
}

test('plugin.json declares required Codex marketplace fields', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name, 'atomicmemory');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.description, 'string');
  assert.ok(manifest.description.length > 0);
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.mcpServers, './.codex-mcp.json');
  assert.equal(typeof manifest.author?.name, 'string');
  assert.equal(typeof manifest.author?.email, 'string');
});

test('plugin.json interface block carries marketplace display metadata', () => {
  const { interface: ui } = readJson('.codex-plugin/plugin.json');
  assert.equal(ui.displayName, 'AtomicMemory');
  assert.equal(typeof ui.shortDescription, 'string');
  assert.equal(typeof ui.longDescription, 'string');
  assert.equal(ui.category, 'Productivity');
  assert.deepEqual(ui.capabilities, ['Read', 'Write']);
  assert.equal(ui.logo, './logo.svg');
  assert.ok(Array.isArray(ui.defaultPrompt) && ui.defaultPrompt.length > 0);
});

test('.codex-mcp.json registers atomicmemory MCP server with required env passthrough', () => {
  const mcp = readJson('.codex-mcp.json');
  const server = mcp.mcpServers?.atomicmemory;
  assert.ok(server, 'atomicmemory MCP server entry is missing');
  assert.equal(server.command, 'npx');
  assert.ok(Array.isArray(server.args) && server.args.length > 0);
  assert.equal(server.args[0], '-y');
  // Codex MCP block uses env_vars allowlist (not env map). Required
  // pass-through covers provider URL + key + scope identity.
  const required = [
    'ATOMICMEMORY_API_URL',
    'ATOMICMEMORY_API_KEY',
    'ATOMICMEMORY_PROVIDER',
    'ATOMICMEMORY_SCOPE_USER',
  ];
  for (const name of required) {
    assert.ok(
      server.env_vars?.includes(name),
      `env_vars must list ${name}`,
    );
  }
});

test('marketplace.example.json declares this plugin under a local source', () => {
  const m = readJson('marketplace.example.json');
  assert.equal(m.name, 'atomicmemory-plugins');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length >= 1);
  const entry = m.plugins.find((p) => p.name === 'atomicmemory');
  assert.ok(entry, 'marketplace must include atomicmemory plugin');
  assert.equal(entry.source?.source, 'local');
  assert.equal(entry.source?.path, './plugins/codex');
  assert.equal(entry.policy?.installation, 'AVAILABLE');
});

test('package.json files[] includes every artifact the host needs', () => {
  const pkg = readJson('package.json');
  const required = [
    '.codex-plugin',
    '.codex-mcp.json',
    'skills',
    'logo.svg',
    'marketplace.example.json',
    'README.md',
  ];
  for (const name of required) {
    assert.ok(
      pkg.files?.includes(name),
      `package.json files must include ${name}`,
    );
  }
  assert.equal(pkg.private, true, 'codex plugin stays private until host-required reason is documented');
});

test('plugin.json version matches package.json and skill version', () => {
  const plugin = readJson('.codex-plugin/plugin.json');
  const pkg = readJson('package.json');
  assert.equal(plugin.version, pkg.version);
  const skill = readFileSync(join(PLUGIN_ROOT, 'skills/atomicmemory/SKILL.md'), 'utf8');
  const match = skill.match(/version:\s*"([^"]+)"/);
  assert.ok(match, 'SKILL.md must declare a version');
  assert.equal(match[1], pkg.version, 'SKILL.md version drifted from package.json');
});
