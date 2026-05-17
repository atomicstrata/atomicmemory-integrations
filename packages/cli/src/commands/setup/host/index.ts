/**
 * @file `atomicmemory setup codex|cursor` - fallback/debug host config
 * generator. Operators who cannot install the native plugin (or who want
 * to verify what the plugin would write) can paste the printed snippets
 * into the host's config files instead.
 *
 * Optional `--target <dir>` materializes the files to disk so this command
 * can also do the merge for unattended setups. When --target is absent
 * (the default), the command runs as dry-run and only emits the plan.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { CliError } from '../../../types.js';
import type { CommandHandler } from '../../types.js';
import {
  HOST_SETUP_REQUIRED_ENV,
  codexConfigToml,
  codexMcpAddCommand,
  codexNotes,
  cursorMcpJson,
  cursorMemoryRule,
  cursorNotes,
  type HostSetupFile,
  type HostSetupPlan,
} from './templates.js';

export const setup: CommandHandler<HostSetupPlan & {
  written: boolean;
  writtenFiles: string[];
}> = async (ctx) => {
  const host = parseHost(ctx.command, ctx.positional);
  const plan = host === 'codex' ? buildCodexPlan() : buildCursorPlan();

  const target = parseTarget(ctx.flags.target);
  const { written, writtenFiles } = target
    ? materializeFiles(plan.files, target)
    : { written: false, writtenFiles: [] };

  return {
    command: `setup ${host}`,
    data: {
      ...plan,
      written,
      writtenFiles,
    },
    count: plan.files.length,
    meta: {
      defaultMcpCommand: 'npx -y @atomicmemory/mcp-server',
      writeMode: target ? 'materialize' : 'dry-run',
      ...(target ? { targetDir: target } : {}),
    },
  };
};

function parseHost(command: string, positional: string[]): 'codex' | 'cursor' {
  // ctx.command is "setup", "setup codex", or "setup cursor"; we accept
  // either the child-command form OR the bare form with positional[0]
  // so callers can dispatch through either path.
  const segments = command.split(/\s+/);
  const child = segments[1];
  if (child === 'codex' || child === 'cursor') return child;
  const pos = positional[0];
  if (pos === 'codex' || pos === 'cursor') return pos;
  throw new CliError(
    'usage',
    `setup requires a host: codex or cursor (got "${child ?? pos ?? ''}")`,
  );
}

function parseTarget(value: unknown): string | undefined {
  if (value === undefined || value === '' || value === false) return undefined;
  if (typeof value !== 'string') {
    throw new CliError('usage', '--target must be a directory path');
  }
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function buildCodexPlan(): HostSetupPlan {
  return {
    host: 'codex',
    installMode: 'manual-config',
    files: [
      {
        target: '~/.codex/config.toml',
        language: 'toml',
        content: codexConfigToml(),
      },
    ],
    commands: [
      { label: 'Equivalent CLI command', command: codexMcpAddCommand() },
    ],
    requiredEnv: [...HOST_SETUP_REQUIRED_ENV],
    notes: codexNotes(),
  };
}

function buildCursorPlan(): HostSetupPlan {
  return {
    host: 'cursor',
    installMode: 'manual-config',
    files: [
      {
        target: '.cursor/mcp.json',
        language: 'json',
        content: cursorMcpJson(),
      },
      {
        target: '.cursor/rules/atomicmemory.mdc',
        language: 'markdown',
        content: cursorMemoryRule(),
      },
    ],
    commands: [],
    requiredEnv: [...HOST_SETUP_REQUIRED_ENV],
    notes: cursorNotes(),
  };
}

function materializeFiles(
  files: HostSetupFile[],
  targetDir: string,
): { written: boolean; writtenFiles: string[] } {
  const writtenFiles: string[] = [];
  for (const file of files) {
    // Strip leading "~/" or "./" so the target join stays under targetDir.
    // For Cursor's .cursor/* paths this preserves the nested structure;
    // for Codex's ~/.codex/config.toml we drop the home prefix and write
    // <targetDir>/.codex/config.toml so operators can preview without
    // overwriting their real home config.
    const rel = file.target.replace(/^~\//, '').replace(/^\.\//, '');
    const dest = join(targetDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.content, 'utf8');
    writtenFiles.push(dest);
  }
  return { written: true, writtenFiles };
}
