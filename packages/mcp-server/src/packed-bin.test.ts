/**
 * @file Packed-tarball smoke for the published MCP server bin.
 *
 *       `bin-stdio.test.ts` exercises the source bin via tsx, which
 *       proves the JSON-RPC + stdio contract works. This test does the
 *       packed-package counterpart: it runs `pnpm pack` to produce the
 *       exact tarball that would be published, extracts it into a
 *       temp directory, and then spawns the packed `dist/bin.js`. It
 *       fails if the tarball is missing the bin entry that
 *       `package.json#bin` points at, or if the packed bin cannot
 *       complete an MCP `initialize` -> `tools/list` round-trip and
 *       expose the memory tools the published manifest documents.
 *
 *       Before spawning, the extracted package gets a `node_modules`
 *       symlink back to this package's installed `node_modules`,
 *       where pnpm has already linked `@atomicmemory/sdk` and the
 *       other runtime deps. ESM resolution walks up from the bin's
 *       directory looking for `node_modules`, so the symlink lets
 *       `@atomicmemory/sdk` resolve without paying for a real
 *       `npm install` of the tarball. The test stays deterministic
 *       and fast (~5s on a cold pack), while still catching the
 *       "I forgot to include dist/bin.js in `files[]`" class of
 *       regression that the source-bin test cannot see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface ToolsListResponse {
  id: number;
  result: { tools: Array<{ name: string }> };
}

test('packed tarball ships dist/bin.js and exposes memory tools over stdio', async () => {
  const workdir = mkdtempSync(join(tmpdir(), 'am-mcp-pack-'));
  const tarballName = packTarball(workdir);
  const extracted = extractTarball(join(workdir, tarballName), workdir);

  const binPath = join(extracted, 'dist', 'bin.js');
  assert.ok(
    existsSync(binPath),
    `packed tarball missing ${binPath}; package.json#bin "atomicmemory-mcp" -> dist/bin.js must ship in files[]`,
  );

  const packedPkg = JSON.parse(readFileSync(join(extracted, 'package.json'), 'utf8'));
  assert.equal(
    packedPkg.bin?.['atomicmemory-mcp'],
    'dist/bin.js',
    'packed package.json#bin must point at dist/bin.js',
  );

  symlinkSync(join(PACKAGE_ROOT, 'node_modules'), join(extracted, 'node_modules'), 'dir');

  const response = await runPackedBinAndListTools(binPath);
  assertHasTool(response, 'memory_ingest');
  assertHasTool(response, 'memory_search');
  assertHasTool(response, 'memory_package');
});

function packTarball(destDir: string): string {
  const before = new Set(readdirSync(destDir));
  const result = spawnSync(
    'pnpm',
    ['pack', '--pack-destination', destDir],
    { cwd: PACKAGE_ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `pnpm pack failed (exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  const tarballs = readdirSync(destDir).filter(
    (name) => !before.has(name) && name.endsWith('.tgz'),
  );
  if (tarballs.length !== 1) {
    throw new Error(
      `expected exactly one new .tgz in ${destDir}, got: ${tarballs.join(', ') || '(none)'}`,
    );
  }
  return tarballs[0];
}

function extractTarball(tarballPath: string, destDir: string): string {
  const result = spawnSync(
    'tar',
    ['-xzf', tarballPath, '-C', destDir],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `tar extraction failed (exit ${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return join(destDir, 'package');
}

async function runPackedBinAndListTools(binPath: string): Promise<ToolsListResponse> {
  const {
    ATOMICMEMORY_PROVIDER,
    ATOMICMEMORY_SCOPE_USER,
    ...env
  } = process.env;

  const child = spawn(process.execPath, [binPath], {
    cwd: PACKAGE_ROOT,
    env: {
      ...env,
      USER: 'packed-bin-smoke',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const listResponse = waitForToolsListResponse(child, () => stderr);

  try {
    writeJsonLine(child, initializeRequest());
    writeJsonLine(child, initializedNotification());
    writeJsonLine(child, toolsListRequest());
    return await listResponse;
  } finally {
    child.kill('SIGTERM');
  }
}

function waitForToolsListResponse(
  child: ChildProcessWithoutNullStreams,
  getStderr: () => string,
): Promise<ToolsListResponse> {
  let stdout = '';
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: string) => {
      stdout += chunk;
      for (;;) {
        const index = stdout.indexOf('\n');
        if (index === -1) return;
        const line = stdout.slice(0, index);
        stdout = stdout.slice(index + 1);
        if (line) handleStdoutLine(line, cleanup, resolve, fail);
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      fail(new Error(
        `packed MCP bin exited before tools/list response: ${code ?? signal}; stderr=${getStderr()}`,
      ));
    const onError = (error: Error) => fail(error);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function handleStdoutLine(
  line: string,
  cleanup: () => void,
  resolve: (response: ToolsListResponse) => void,
  reject: (error: Error) => void,
): void {
  let message: unknown;
  try {
    message = JSON.parse(line) as unknown;
  } catch (error) {
    reject(new Error(`packed MCP stdout contained non-JSON output: ${line}`, { cause: error as Error }));
    return;
  }
  if (isToolsListResponse(message)) {
    cleanup();
    resolve(message);
  }
}

function writeJsonLine(
  child: ChildProcessWithoutNullStreams,
  message: Record<string, unknown>,
): void {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function initializeRequest(): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'atomicmemory-packed-bin-test', version: '0.0.0' },
    },
  };
}

function initializedNotification(): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  };
}

function toolsListRequest(): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  };
}

function assertHasTool(response: ToolsListResponse, name: string): void {
  assert.ok(
    response.result.tools.some((tool) => tool.name === name),
    `${name} missing from packed bin tools/list response`,
  );
}

function isToolsListResponse(message: unknown): message is ToolsListResponse {
  return (
    isRecord(message) &&
    message.id === 2 &&
    isRecord(message.result) &&
    Array.isArray((message.result as Record<string, unknown>).tools)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
