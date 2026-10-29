// DB-free wiring check: a notice write judges `console:access` on the transaction handle after the (actor, key)
// advisory lock and, for update/delete, after the object row lock. The real lock-wait races are in
// `notices.integration.test.ts` (this proves only which handle is used and the early check stays; a mock cannot
// prove a race).
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import type { CheckService } from '../../permissions/check-service.js';
import { createPlatformNoticeService } from '../service.js';

const ACTOR = {
  actor_id: '22222222-2222-4222-8222-222222222222',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  role_level: 'user',
};
const KEY = '44444444-4444-4444-8444-444444444444';

const setup = (allow: (tx: unknown) => boolean) => {
  const tx = { execute: vi.fn(async () => ({ rows: [] })) } as unknown as Tx;
  const db = {
    transaction: async (work: (t: Tx) => Promise<unknown>) => work(tx),
  } as unknown as Db;
  const checkCapability = vi.fn(async (_a: unknown, _c: unknown, _s: unknown, o?: { tx?: Tx }) => ({
    allow: allow(o?.tx),
    via: 'direct_grant' as const,
  }));
  const checkService = { checkCapability, capabilityScope: vi.fn() } as unknown as CheckService;
  return { tx, checkCapability, service: createPlatformNoticeService({ db, checkService }) };
};

const create = {
  operation: 'save' as const,
  body: {
    title: { ko: 't', en: 't' },
    content: { ko: 'c', en: 'c' },
    scopeId: null,
    until: '2099-01-01T00:00:00',
    idempotencyKey: KEY,
  },
  headers: { idempotencyKey: KEY, ifMatch: undefined },
  correlationId: 'corr',
};

describe('notice write re-judges console:access inside the transaction', () => {
  it('granted on the pool but denied on the transaction: forbidden, nothing past the lock runs', async () => {
    const { tx, checkCapability, service } = setup((given) => given === undefined);
    const result = await service.write(ACTOR, create);
    expect(result).toMatchObject({
      outcome: 'forbidden',
      data: null,
      version: null,
      replayed: false,
    });
    expect(checkCapability.mock.calls.filter((c) => c[3]?.tx === tx)).toHaveLength(1);
    expect(tx.execute).toHaveBeenCalledTimes(1); // only the advisory lock
  });

  it('denied before the lock stays forbidden without opening the transaction check', async () => {
    const { tx, checkCapability, service } = setup(() => false);
    expect(await service.write(ACTOR, create)).toMatchObject({ outcome: 'forbidden' });
    expect(checkCapability.mock.calls.filter((c) => c[3]?.tx === tx)).toHaveLength(0);
  });
});
