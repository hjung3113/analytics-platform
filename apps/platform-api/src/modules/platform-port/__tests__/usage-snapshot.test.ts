// #605 F3 — every SELECT of `usageSummary` and `usageNextScreens` runs inside one read-only REPEATABLE READ
// transaction, so count, users, vias and the entries behind the rates come from one snapshot. A real
// concurrent insert cannot be paused between two statements through the route, so the contract is pinned at
// the `Db` seam: the root handle is never queried, and the transaction is opened with the snapshot options.

import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import type { CheckService } from '../../permissions/check-service.js';
import type { PlatformActor } from '../permissions.js';
import { createPlatformUsageService } from '../usage.js';

vi.mock('../permissions.js', () => ({ holdsPlatformPermission: async () => true }));

/** A query builder whose every method returns itself and which resolves to the next queued result. */
function fakeDb(results: unknown[][]) {
  const queue = [...results];
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => {
        if (prop === 'then') {
          const rows = queue.shift() ?? [];
          return (resolve: (v: unknown) => unknown) => resolve(rows);
        }
        return () => chain();
      },
    });
  const tx = { select: vi.fn(() => chain()) };
  const root = {
    select: vi.fn(() => {
      throw new Error('a read outside the snapshot transaction');
    }),
    transaction: vi.fn(async (cb: (t: typeof tx) => unknown, config: unknown) => {
      void config;
      return cb(tx);
    }),
  };
  return { root, tx };
}

const actor = { id: 'a1', workspace_id: 'w1' } as unknown as PlatformActor;
const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' };

describe('usage reads share one snapshot (#605 F3)', () => {
  it('usageSummary: both SELECTs run in one REPEATABLE READ read-only transaction', async () => {
    const { root, tx } = fakeDb([[], []]);
    const service = createPlatformUsageService({ db: root as unknown as Db, checkService: {} as CheckService });
    const res = await service.usageSummary(actor, { preset: 'all' });
    expect(res.outcome).toBe('ok');
    expect(root.transaction).toHaveBeenCalledTimes(1);
    expect(root.transaction.mock.calls[0]?.[1]).toEqual(SNAPSHOT);
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(root.select).not.toHaveBeenCalled();
  });

  it('usageNextScreens: own, cells, vias and the union read run in one REPEATABLE READ read-only transaction', async () => {
    const { root, tx } = fakeDb([
      [{ entries: 6, users: 4 }],
      [
        { kind: 'moved', menuId: 'A', n: 3, users: 3 },
        { kind: 'back', menuId: 'A', n: 3, users: 3 },
      ],
      [],
      [],
    ]);
    const service = createPlatformUsageService({ db: root as unknown as Db, checkService: {} as CheckService });
    const res = await service.usageNextScreens(actor, { menuId: 'M', includeBack: true });
    expect(res.outcome).toBe('ok');
    expect(root.transaction).toHaveBeenCalledTimes(1);
    expect(root.transaction.mock.calls[0]?.[1]).toEqual(SNAPSHOT);
    expect(tx.select).toHaveBeenCalledTimes(4);
    expect(root.select).not.toHaveBeenCalled();
  });
});
