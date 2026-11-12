import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { createMenuActionEngine } from '../action.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { testAction } from './test-declarations.js';

vi.mock('../../core/idempotency/idempotency-service.js', () => ({
  createIdempotencyService: () => ({ lookup: async () => ({ kind: 'miss' }), record: async () => undefined }),
}));
const actor = { actor_id: 'a', workspace_id: 'w', role_level: 'admin' };
const grants = [{ site: 'MEM', rooms: ['R1'] }];
const body = (scopeId: string | null) => ({
  action: 'test.save', context: { scopeId }, input: {}, idempotencyKey: randomUUID(),
});

describe('action Scope before transaction/replay', () => {
  it.each([
    ['empty grants', async () => [], 'MEM'],
    ['empty requested-site rooms', async () => [{ site: 'MEM', rooms: [] }], 'MEM'],
    ['empty requested-site rooms with another granted site', async () => [{ site: 'MEM', rooms: [] }, { site: 'FDRY', rooms: ['R9'] }], 'MEM'],
    ['resolver throws', async () => { throw new Error('private'); }, 'MEM'],
    ['timeout', async () => { throw new DOMException('private', 'TimeoutError'); }, 'MEM'],
    ['outside site', async () => grants, 'OTHER'],
    ['null scope', async () => grants, null],
  ] as const)('denies %s without a handler or transaction', async (_name, resolve, scopeId) => {
    const { declaration, calls } = testAction({ requiresScope: true });
    const resolver = { resolve: vi.fn(resolve) };
    const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: async () => undefined }));
    const engine = createMenuActionEngine({ db: { transaction } as never,
      registry: createMenuDispatchRegistry([{ actions: [declaration] }], { scopeResolver: resolver }),
    });
    const signal = new AbortController().signal;
    expect(await engine.run(actor, body(scopeId), 'cid', signal)).toMatchObject({ outcome: 'forbidden', data: null });
    expect(calls.handled).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(resolver.resolve).toHaveBeenCalledWith(actor, signal);
  });

  it('passes each selected site to both version and write callbacks', async () => {
    const { declaration } = testAction({ requiresScope: true, concurrency: 'version' });
    const currentVersion = vi.fn<NonNullable<typeof declaration.currentVersion>>(async () => '1');
    const handle = vi.fn<typeof declaration.handle>(async () => ({ data: 1, version: '2' }));
    declaration.currentVersion = currentVersion;
    declaration.handle = handle;
    const scopes = [...grants, { site: 'FDRY', rooms: ['R9'] }];
    const tx = { execute: async () => undefined };
    const db = { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) };
    const engine = createMenuActionEngine({ db: db as never,
      registry: createMenuDispatchRegistry([{ actions: [declaration] }], { scopeResolver: { resolve: async () => scopes } }),
    });
    for (const scopeId of ['MEM', 'FDRY']) {
      expect(await engine.run(actor, { ...body(scopeId), expectedVersion: '1' }, 'cid')).toMatchObject({ outcome: 'ok' });
    }
    expect(currentVersion.mock.calls.map((call) => call[3]?.scopeId)).toEqual(['MEM', 'FDRY']);
    expect(handle.mock.calls.map((call) => call[3].scopeId)).toEqual(['MEM', 'FDRY']);
  });

  it('passes grants to a successful handler, resolves again on the next request', async () => {
    const { declaration } = testAction({ requiresScope: true });
    const handle = vi.fn(async () => ({ data: 1, version: null }));
    declaration.handle = handle;
    const resolver = { resolve: vi.fn().mockResolvedValueOnce(grants).mockResolvedValueOnce([]) };
    const tx = { execute: async () => undefined };
    const db = { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) };
    const engine = createMenuActionEngine({ db: db as never,
      registry: createMenuDispatchRegistry([{ actions: [declaration] }], { scopeResolver: resolver }),
    });
    expect(await engine.run(actor, body('MEM'), 'cid')).toMatchObject({ outcome: 'ok' });
    expect(handle).toHaveBeenCalledWith(tx, actor, {}, { correlationId: 'cid', scopeId: 'MEM', scopes: grants });
    expect(await engine.run(actor, body('MEM'), 'cid2')).toMatchObject({ outcome: 'forbidden' });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
  });
});
