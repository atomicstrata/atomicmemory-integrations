#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const checkOnly = args.includes('--check');
const knownFlags = new Set(['--dry-run', '--check']);
const positional = args.filter((arg) => !arg.startsWith('--'));
const bumpArg = positional[0] ?? 'patch';
const unknownFlag = args.find((arg) => arg.startsWith('--') && !knownFlags.has(arg));

if (unknownFlag) {
  fail(`Unknown flag '${unknownFlag}'. Use --dry-run or --check.`);
}

if (positional.length > 1) {
  fail('Usage: pnpm bump:plugin-versions [patch|minor|major|x.y.z] [--dry-run]');
}

if (checkOnly && positional.length > 0) {
  fail('Usage: pnpm check:plugin-versions');
}

const targets = [
  jsonTarget('.claude-plugin/marketplace.json', 'plugins[claude-code].version', {
    get: (json) => findPlugin(json, 'claude-code').version,
  }),
  jsonPathTarget('plugins/claude-code/.claude-plugin/plugin.json', ['version']),
  jsonPathTarget('plugins/claude-code/package.json', ['version']),

  jsonPathTarget('plugins/codex/.codex-plugin/plugin.json', ['version']),
  jsonPathTarget('plugins/codex/package.json', ['version']),
  regexTarget(
    'plugins/codex/skills/atomicmemory/SKILL.md',
    'metadata.version',
    /^  version: "([^"]+)"$/m,
    (version) => `  version: "${version}"`,
  ),

  jsonPathTarget('plugins/openclaw/openclaw.plugin.json', ['version']),
  jsonPathTarget('plugins/openclaw/package.json', ['version']),
  regexTarget(
    'plugins/openclaw/skills/atomicmemory/skill.yaml',
    'version',
    /^version:\s*([^\s]+)\s*$/m,
    (version) => `version: ${version}`,
  ),

  jsonPathTarget('plugins/hermes/package.json', ['version']),
  regexTarget(
    'plugins/hermes/pyproject.toml',
    'project.version',
    /^version\s*=\s*"([^"]+)"$/m,
    (version) => `version = "${version}"`,
  ),
  regexTarget(
    'plugins/hermes/plugin.yaml',
    'version',
    /^version:\s*([^\s]+)\s*$/m,
    (version) => `version: ${version}`,
  ),

  jsonPathTarget('plugins/cursor/package.json', ['version']),
];

const current = targets.map((target) => ({ target, version: target.read() }));
const uniqueVersions = [...new Set(current.map(({ version }) => version))];

if (uniqueVersions.length > 1) {
  const details = current
    .map(({ target, version }) => `  - ${target.file} ${target.label}: ${version}`)
    .join('\n');

  if (checkOnly) {
    fail(`Plugin versions are not aligned:\n${details}`);
  }

  if (!VERSION_RE.test(bumpArg)) {
    fail(
      `Plugin versions are not aligned, so '${bumpArg}' is ambiguous. Pass an explicit x.y.z version.\n${details}`,
    );
  }
}

if (checkOnly) {
  console.log(`Plugin versions are aligned at ${uniqueVersions[0]}.`);
  process.exit(0);
}

const nextVersion = VERSION_RE.test(bumpArg)
  ? bumpArg
  : bumpVersion(uniqueVersions[0], bumpArg);

for (const { target } of current) {
  target.write(nextVersion);
}

const action = dryRun ? 'Would update' : 'Updated';
console.log(`${action} plugin versions to ${nextVersion}:`);
for (const { target, version } of current) {
  console.log(`  - ${target.file} ${target.label}: ${version} -> ${nextVersion}`);
}

function jsonPathTarget(file, path) {
  return jsonTarget(file, `/${path.join('/')}`, {
    get: (json) => path.reduce((value, segment) => value?.[segment], json),
  });
}

function jsonTarget(file, label, { get }) {
  const absolute = resolve(repoRoot, file);

  return {
    file,
    label,
    read() {
      const json = JSON.parse(readFileSync(absolute, 'utf8'));
      const version = get(json);
      assertVersion(version, `${file} ${label}`);
      return version;
    },
    write(version) {
      if (dryRun) return;
      const content = readFileSync(absolute, 'utf8');
      const json = JSON.parse(content);
      const currentVersion = get(json);
      if (currentVersion === version) return;

      const next = replaceJsonVersion(content, currentVersion, version, `${file} ${label}`);
      writeFileSync(absolute, next);
    },
  };
}

function regexTarget(file, label, pattern, replace) {
  const absolute = resolve(repoRoot, file);

  return {
    file,
    label,
    read() {
      const content = readFileSync(absolute, 'utf8');
      const match = content.match(pattern);
      if (!match) {
        fail(`Could not find ${label} in ${file}`);
      }
      const version = match[1];
      assertVersion(version, `${file} ${label}`);
      return version;
    },
    write(version) {
      if (dryRun) return;
      const content = readFileSync(absolute, 'utf8');
      const match = content.match(pattern);
      if (!match) {
        fail(`Could not find ${label} in ${file}`);
      }
      if (match[1] === version) return;

      const next = content.replace(pattern, replace(version));
      if (next === content) {
        fail(`Could not update ${label} in ${file}`);
      }
      writeFileSync(absolute, next);
    },
  };
}

function findPlugin(json, name) {
  const plugin = json.plugins?.find((entry) => entry.name === name);
  if (!plugin) {
    fail(`Could not find plugin '${name}' in marketplace.json`);
  }
  return plugin;
}

function replaceJsonVersion(content, fromVersion, toVersion, label) {
  const pattern = new RegExp(`("version"\\s*:\\s*)"${escapeRegExp(fromVersion)}"`);
  const next = content.replace(pattern, `$1"${toVersion}"`);

  if (next === content) {
    fail(`Could not update ${label}`);
  }

  return next;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bumpVersion(version, kind) {
  const match = version.match(VERSION_RE);
  if (!match) {
    fail(`Cannot bump non-semver version '${version}'`);
  }

  let [, major, minor, patch] = match.map(Number);

  switch (kind) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
    default:
      fail(`Unknown bump '${kind}'. Use patch, minor, major, or an explicit x.y.z version.`);
  }

  return `${major}.${minor}.${patch}`;
}

function assertVersion(version, label) {
  if (!VERSION_RE.test(version)) {
    fail(`${label} has unsupported version '${version}'. Expected x.y.z.`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
