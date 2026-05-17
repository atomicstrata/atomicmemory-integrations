/**
 * @file Contract tests for the Cursor plugin install bundle. Locks the
 * shape of `.cursor/mcp.json` and `.cursor/rules/atomicmemory.mdc` -
 * the two artifacts Cursor today consumes when this plugin is dropped
 * into a project or symlinked into `~/.cursor`.
 *
 * Cursor's marketplace plugin manifest format is still being verified
 * against host docs/validator behavior; until that lands, this suite
 * locks the existing install surface so accidental drift surfaces here
 * before it breaks operators copying these files into their own
 * Cursor configs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relPath) {
  return readFileSync(join(PLUGIN_ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(read(relPath));
}

test('.cursor/mcp.json registers atomicmemory with stdio + npx -y @atomicmemory/mcp-server', () => {
  const mcp = readJson('.cursor/mcp.json');
  const server = mcp.mcpServers?.atomicmemory;
  assert.ok(server, 'atomicmemory MCP server entry is missing');
  assert.equal(server.type, 'stdio');
  assert.equal(server.command, 'npx');
  assert.deepEqual(server.args, ['-y', '@atomicmemory/mcp-server']);
});

test('.cursor/mcp.json env block uses Cursor ${env:NAME} substitution for required vars', () => {
  const mcp = readJson('.cursor/mcp.json');
  const env = mcp.mcpServers?.atomicmemory?.env ?? {};
  // Cursor expects `${env:VAR}` interpolation. The required passthrough
  // covers provider URL + key + scope identity so operators can set
  // these once in their shell rather than per-project.
  const required = [
    'ATOMICMEMORY_API_URL',
    'ATOMICMEMORY_API_KEY',
    'ATOMICMEMORY_PROVIDER',
    'ATOMICMEMORY_SCOPE_USER',
  ];
  for (const name of required) {
    assert.equal(env[name], `\${env:${name}}`, `env[${name}] must use Cursor's ${'${env:NAME}'} form`);
  }
});

test('.cursor/rules/atomicmemory.mdc carries an always-apply frontmatter + memory protocol body', () => {
  const rule = read('.cursor/rules/atomicmemory.mdc');
  // Cursor expects the rule file to open with a YAML-style frontmatter
  // block. `alwaysApply: true` is what makes the rule load on every
  // Cursor turn - without it the rule only fires on matching globs.
  assert.match(rule, /^---\n/);
  assert.match(rule, /^description:\s*.+$/m);
  assert.match(rule, /^alwaysApply:\s*true\s*$/m);
  // Tool surface must be named so Cursor's agent knows what to call.
  for (const tool of ['memory_search', 'memory_ingest', 'memory_package']) {
    assert.ok(rule.includes(tool), `rule must reference the ${tool} MCP tool`);
  }
  // Untrusted-content guidance - the prompt-injection mitigation that
  // every memory-integration rule must carry.
  assert.match(rule, /reference context/i);
});

test('package.json files[] ships the install bundle Cursor consumes', () => {
  const pkg = readJson('package.json');
  for (const name of ['.cursor', 'README.md']) {
    assert.ok(pkg.files?.includes(name), `package.json files must include ${name}`);
  }
  assert.equal(
    pkg.private,
    true,
    'cursor plugin stays private until a host-required publish reason is documented',
  );
});

test('cursor plugin version stays aligned with the lock-step plugin set', () => {
  // The repo's check:plugin-versions enforces alignment across every
  // plugin. We re-assert here as a per-package guardrail so an
  // accidental hand-edit to one of the cursor files surfaces in this
  // suite too, not only in the workspace-wide check.
  const pkg = readJson('package.json');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});
