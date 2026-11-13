// ADR-0116 token rule for Scope at the query boundary (#1874): a token without `scope.read` gets no site·room
// Scope from ANY resolver, on both menu-query and menu-action. DB-free; the resolver is a synthetic stub.

import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { runAsToken } from '../../../lib/auth-context.js';
import { createMenuActionEngine } from '../action.js';
import { judgeQueryShape, runQuery } from '../query.js';
import { createMenuDispatchRegistry } from '../registry.js';
import type { ScopeResolver } from '../scope-resolver.js';
import { testAction, testEndpoint } from './test-declarations.js';

vi.mock('../../core/idempotency/idempotency-service.js', () => ({
  createIdempotencyService: () => ({ lookup: async () => ({ kind: 'miss' }), record: async () => undefined }),
}));

const actor = { actor_id: 'synthetic-actor', workspace_id: 'synthetic-ws', role_level: 'admin' };
const grants = [{ site: 'SITE-X', rooms: ['ROOM-1'] }];

type Caller = (fn: () => Promise<unknown>) => Promise<unknown>;
const callers: [string, 'ok' | 'forbidden', Caller][] = [
  ['token without scope.read', 'forbidden', (fn) => runAsToken('synthetic-token', ['workspace.read'], fn)],
  ['token with no scopes', 'forbidden', (fn) => runAsToken('synthetic-token', [], fn)],
  ['token with scope.read', 'ok', (fn) => runAsToken('synthetic-token', ['scope.read'], fn)],
  ['session caller', 'ok', (fn) => fn()],
];

async function query(caller: Caller, resolver: ScopeResolver) {
  const { declaration, calls } = testEndpoint({ requiresScope: true });
  const handle = vi.fn(async (..._args: unknown[]) => ({ outcome: 'ok' as const, data: [1] }));
  declaration.handle = handle;
  const registry = createMenuDispatchRegistry([{ endpoints: [declaration] }], { scopeResolver: resolver });
  const shape = judgeQueryShape({ endpoint: 'test.rows', context: { scopeId: 'SITE-X' }, params: {} }, registry);
  if (!shape.ok) throw new Error(shape.message);
  const result = await caller(() => runQuery(shape, actor, 'cid'));
  return { result, handle, calls };
}

async function action(caller: Caller, resolver: ScopeResolver) {
  const { declaration } = testAction({ requiresScope: true });
  const handle = vi.fn<typeof declaration.handle>(async () => ({ data: 1, version: null }));
  declaration.handle = handle;
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: async () => undefined }));
  const engine = createMenuActionEngine({ db: { transaction } as never,
    registry: createMenuDispatchRegistry([{ actions: [declaration] }], { scopeResolver: resolver }),
  });
  const body = { action: 'test.save', context: { scopeId: 'SITE-X' }, input: {}, idempotencyKey: randomUUID() };
  const result = await caller(() => engine.run(actor, body, 'cid'));
  return { result, handle, transaction };
}

describe('API-token scope.read is judged once at resolveRequestScopes, for any resolver (#1874)', () => {
  it.each(callers)('menu-query: %s → %s', async (_name, outcome, caller) => {
    const resolver = { resolve: vi.fn(async () => grants) };
    const { result, handle } = await query(caller, resolver);
    expect(result).toMatchObject({ outcome });
    if (outcome === 'forbidden') {
      // Negative: the denied call never asks the resolver and no site·room grant reaches a handler.
      expect(result).toMatchObject({ data: null });
      expect(resolver.resolve).not.toHaveBeenCalled();
      expect(handle).not.toHaveBeenCalled();
    } else {
      expect(resolver.resolve).toHaveBeenCalledTimes(1);
      expect(handle).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(handle.mock.calls[0])).toContain('ROOM-1');
    }
  });

  it.each(callers)('menu-action: %s → %s', async (_name, outcome, caller) => {
    const resolver = { resolve: vi.fn(async () => grants) };
    const { result, handle, transaction } = await action(caller, resolver);
    expect(result).toMatchObject({ outcome });
    if (outcome === 'forbidden') {
      expect(result).toMatchObject({ data: null });
      expect(resolver.resolve).not.toHaveBeenCalled();
      expect(handle).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    } else {
      expect(resolver.resolve).toHaveBeenCalledTimes(1);
      expect(handle).toHaveBeenCalledWith(expect.anything(), actor, {}, { correlationId: 'cid', scopeId: 'SITE-X', scopes: grants });
    }
  });
});
