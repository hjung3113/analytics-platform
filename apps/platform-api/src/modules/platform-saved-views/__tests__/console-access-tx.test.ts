// DB-free: `console:access` is judged on the transaction handle after the workspace lock (C2), and the helper
// stays source-compatible for callers that pass no options.
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import type { CheckService } from '../../permissions/check-service.js';
import { holdsPlatformPermission } from '../../platform-port/permissions.js';
import { createSavedViewService } from '../service.js';

const WS = '11111111-1111-4111-8111-111111111111';
const ACTOR = {
  actor_id: '22222222-2222-4222-8222-222222222222',
  workspace_id: WS,
  role_level: 'user',
};

const checkServiceOf = (allow: (tx: unknown) => boolean) => {
  const checkCapability = vi.fn(async (_a: unknown, _c: unknown, _s: unknown, o?: { tx?: Tx }) => ({
    allow: allow(o?.tx),
    via: 'direct_grant' as const,
  }));
  return { checkCapability, capabilityScope: vi.fn() } as unknown as CheckService & {
    checkCapability: typeof checkCapability;
  };
};

describe('holdsPlatformPermission tx option', () => {
  it('forwards the transaction to the capability check, and works without options', async () => {
    const tx = { marker: 'tx' } as unknown as Tx;
    const check = checkServiceOf((given) => given === tx);
    expect(await holdsPlatformPermission(check, ACTOR, 'console:access', { tx })).toBe(true);
    expect(check.checkCapability.mock.calls[0]?.[3]).toEqual({ tx });
    expect(await holdsPlatformPermission(check, ACTOR, 'console:access')).toBe(false);
  });
});

describe('write re-judges console:access after the lock', () => {
  it('a decision granted before the lock but denied inside the transaction is refused', async () => {
    const tx = {
      execute: vi.fn(async () => ({ rows: [] })),
    } as unknown as Tx;
    const db = {
      transaction: async (work: (t: Tx) => Promise<unknown>) => work(tx),
    } as unknown as Db;
    const check = checkServiceOf((given) => given === undefined); // allowed on the pool, denied on the tx
    const service = createSavedViewService({ db, checkService: check });
    const result = await service.execute(
      { actorId: ACTOR.actor_id, workspaceId: WS, roleLevel: 'user' },
      {
        version: 1,
        op: 'decide',
        id: '33333333-3333-4333-8333-333333333333',
        decision: 'approve',
        expectedVersion: 1,
      } as never,
    );
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    const txCalls = check.checkCapability.mock.calls.filter((c) => c[3]?.tx === tx);
    expect(txCalls).toHaveLength(1);
  });
});
