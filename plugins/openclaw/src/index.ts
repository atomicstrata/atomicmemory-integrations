/**
 * @file OpenClaw plugin entry — spawns the shared AtomicMemory MCP
 *       server in-process and registers it as a memory provider with
 *       the OpenClaw runtime. All memory semantics live in
 *       `@atomicmemory/mcp-server`; this file is a thin adapter.
 *
 *       OpenClaw's plugin SDK is not yet on npm, so the host-facing
 *       interface is declared locally. The OpenClaw runtime discovers
 *       plugins by inspecting the default export's shape (id +
 *       onLoad), so matching the shape is sufficient — no import of a
 *       `definePlugin` factory is required for compatibility.
 */

import { spawnAtomicMemoryMcp } from '@atomicmemory/mcp-server/spawn';
import { hostname, userInfo } from 'node:os';

interface AtomicMemoryConfig {
  apiUrl?: string;
  /** Provider name dispatched through the SDK's MemoryProvider model. */
  provider?: 'atomicmemory' | 'mem0';
  scope?: { user?: string; agent?: string; namespace?: string; thread?: string };
}

interface PluginContext {
  config: AtomicMemoryConfig;
  registerProvider(id: string, provider: unknown): void;
}

export interface Plugin {
  id: string;
  onLoad(ctx: PluginContext): Promise<void>;
}

const PROVIDER_ID = 'atomicmemory.memory';

const plugin: Plugin = {
  id: 'atomicmemory',
  async onLoad(ctx) {
    const { server } = await spawnAtomicMemoryMcp(normalizeConfig(ctx.config));
    ctx.registerProvider(PROVIDER_ID, server);
  },
};

function normalizeConfig(config: AtomicMemoryConfig): {
  apiUrl: string;
  provider: 'atomicmemory' | 'mem0';
  scope: { user: string; agent?: string; namespace?: string; thread?: string };
} {
  const provider = config.provider ?? 'atomicmemory';
  const scope = normalizeScope(config.scope);

  return {
    apiUrl: resolveApiUrl(config.apiUrl, provider),
    provider,
    scope,
  };
}

function normalizeScope(scope: AtomicMemoryConfig['scope']): {
  user: string;
  agent?: string;
  namespace?: string;
  thread?: string;
} {
  const user = cleanOptional(scope?.user) ?? defaultScopeUser();

  const result: {
    user: string;
    agent?: string;
    namespace?: string;
    thread?: string;
  } = { user };

  const agent = cleanOptional(scope?.agent);
  const namespace = cleanOptional(scope?.namespace);
  const thread = cleanOptional(scope?.thread);

  if (agent) result.agent = agent;
  if (namespace) result.namespace = namespace;
  if (thread) result.thread = thread;

  return result;
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function defaultScopeUser(): string {
  return (
    cleanOptional(process.env.USER) ??
    cleanOptional(process.env.USERNAME) ??
    readOsUsername() ??
    cleanOptional(hostname()) ??
    'local-machine'
  );
}

function resolveApiUrl(
  apiUrl: string | undefined,
  provider: 'atomicmemory' | 'mem0',
): string {
  const normalized = cleanOptional(apiUrl);
  if (normalized) return normalized.replace(/\/+$/, '');
  if (provider === 'atomicmemory') return 'http://127.0.0.1:3050';
  throw new Error('AtomicMemory OpenClaw plugin requires config.apiUrl when provider=mem0');
}

function readOsUsername(): string | undefined {
  try {
    return cleanOptional(userInfo().username);
  } catch {
    return undefined;
  }
}

export default plugin;
