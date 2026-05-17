/**
 * @file Handler-level tests for `atomicmemory setup codex|cursor`.
 * Verifies command dispatch, dry-run vs materialize behavior, and
 * structured envelope fields the agent renderer will consume.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup } from '../commands/setup/host/index.js';
import { CliError } from '../types.js';
import type { CommandContext } from '../commands/types.js';

function ctx(overrides: Partial<CommandContext>): CommandContext {
  return {
    command: 'setup',
    positional: [],
    flags: {},
    config: { schema_version: '2', activeProfile: 'default', profiles: {} },
    configPath: '/tmp/atomicmemory/config.json',
    configDir: '/tmp/atomicmemory',
    profile: null,
    scope: {},
    env: {},
    version: '0.1.0',
    readStdin: async () => '',
    experimental: false,
    getAdapter: async () => {
      throw new Error('adapter should not initialize for setup');
    },
    ...overrides,
  };
}

test('setup dispatches to codex via "setup codex" child path', async () => {
  const result = await setup(ctx({ command: 'setup codex' }));
  const data = result.data as { host: string; files: Array<{ target: string }> };
  assert.equal(result.command, 'setup codex');
  assert.equal(data.host, 'codex');
  assert.equal(data.files.length, 1);
  assert.equal(data.files[0]?.target, '~/.codex/config.toml');
});

test('setup dispatches to cursor and emits both mcp.json + the rule', async () => {
  const result = await setup(ctx({ command: 'setup cursor' }));
  const data = result.data as { host: string; files: Array<{ target: string; language: string }> };
  assert.equal(result.command, 'setup cursor');
  assert.equal(data.host, 'cursor');
  const paths = data.files.map((f) => f.target);
  assert.deepEqual(paths.sort(), ['.cursor/mcp.json', '.cursor/rules/atomicmemory.mdc']);
});

test('setup accepts host via bare positional for parity with `setup codex` direct dispatch', async () => {
  const result = await setup(ctx({ command: 'setup', positional: ['cursor'] }));
  assert.equal(result.command, 'setup cursor');
});

test('setup defaults to dry-run when --target is omitted (no files written)', async () => {
  const result = await setup(ctx({ command: 'setup codex' }));
  const data = result.data as { written: boolean; writtenFiles: string[] };
  assert.equal(data.written, false);
  assert.deepEqual(data.writtenFiles, []);
  const meta = result.meta as { writeMode: string };
  assert.equal(meta.writeMode, 'dry-run');
});

test('setup cursor --target materializes both files under the target dir', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'am-setup-'));
  try {
    const result = await setup(
      ctx({ command: 'setup cursor', flags: { target: tmp } }),
    );
    const data = result.data as { written: boolean; writtenFiles: string[] };
    assert.equal(data.written, true);
    assert.equal(data.writtenFiles.length, 2);
    const mcp = readFileSync(join(tmp, '.cursor/mcp.json'), 'utf8');
    const rule = readFileSync(join(tmp, '.cursor/rules/atomicmemory.mdc'), 'utf8');
    assert.match(mcp, /"@atomicmemory\/mcp-server"/);
    assert.match(rule, /alwaysApply:\s*true/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('setup codex --target strips ~/ prefix and writes under the target dir', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'am-setup-codex-'));
  try {
    await setup(ctx({ command: 'setup codex', flags: { target: tmp } }));
    const toml = readFileSync(join(tmp, '.codex/config.toml'), 'utf8');
    assert.match(toml, /\[mcp_servers\.atomicmemory\]/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('setup rejects bare invocation without a host', async () => {
  await assert.rejects(
    setup(ctx({ command: 'setup' })),
    (err) => err instanceof CliError && err.code === 'usage',
  );
});

test('setup envelope advertises npx -y @atomicmemory/mcp-server as default launch shape', async () => {
  const result = await setup(ctx({ command: 'setup codex' }));
  const meta = result.meta as { defaultMcpCommand: string };
  assert.equal(meta.defaultMcpCommand, 'npx -y @atomicmemory/mcp-server');
});

test('setup envelope lists the same required env shared with the hooks install plan', async () => {
  const result = await setup(ctx({ command: 'setup codex' }));
  const data = result.data as { requiredEnv: string[] };
  assert.ok(data.requiredEnv.some((s) => s.includes('ATOMICMEMORY_API_URL')));
  assert.ok(data.requiredEnv.some((s) => s.includes('ATOMICMEMORY_PROVIDER')));
  assert.ok(data.requiredEnv.some((s) => s.includes('ATOMICMEMORY_SCOPE_USER')));
});
