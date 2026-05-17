/**
 * @file Drift guard for the OpenClaw plugin's published surface.
 *
 *       `index.test.ts` proves the runtime tool registry agrees with
 *       `openclaw.plugin.json#contracts.tools`. This test pins the
 *       complementary contract: every path declared in
 *       `package.json#files` must exist on disk after `pnpm build`,
 *       and load-bearing entries (`openclaw.plugin.json`,
 *       `dist/index.js`, the `skills/` registry) must not be empty.
 *       Without it, removing a runtime asset (e.g. a skill manifest
 *       or the built entry) silently ships an unusable plugin.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface PackageJson {
  name: string;
  main?: string;
  files?: string[];
  openclaw?: { extensions?: string[] };
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')) as PackageJson;
}

test('every package.json#files entry exists on disk after build', () => {
  const pkg = readPackageJson();
  const files = pkg.files ?? [];
  assert.ok(files.length > 0, 'package.json must declare files[]');

  for (const entry of files) {
    const target = join(PLUGIN_ROOT, entry);
    assert.ok(
      existsSync(target),
      `package.json#files entry "${entry}" missing from ${PLUGIN_ROOT}; ` +
        `run \`pnpm --filter ${pkg.name} build\` or update files[]`,
    );
  }
});

test('directory entries in files[] are non-empty', () => {
  const pkg = readPackageJson();
  const dirEntries = ['dist', 'skills'];
  for (const entry of dirEntries) {
    if (!pkg.files?.includes(entry)) continue;
    const target = join(PLUGIN_ROOT, entry);
    const stats = statSync(target);
    assert.ok(stats.isDirectory(), `${entry} listed in files[] must be a directory`);
    const contents = readdirSync(target);
    assert.ok(
      contents.length > 0,
      `${entry} is empty; refusing to publish an empty payload directory`,
    );
  }
});

test('manifest and built entry referenced by files[] are loadable', () => {
  const pkg = readPackageJson();
  const manifestPath = join(PLUGIN_ROOT, 'openclaw.plugin.json');
  assert.ok(existsSync(manifestPath), 'openclaw.plugin.json must ship at the plugin root');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    id?: string;
    name?: string;
  };
  assert.equal(manifest.id, 'atomicmemory', 'manifest id must stay "atomicmemory"');
  assert.ok(
    typeof manifest.name === 'string' && manifest.name.length > 0,
    'manifest must declare a non-empty display name',
  );

  const mainPath = join(PLUGIN_ROOT, pkg.main ?? 'dist/index.js');
  assert.ok(existsSync(mainPath), `package.json#main "${pkg.main}" must exist after build`);
});
