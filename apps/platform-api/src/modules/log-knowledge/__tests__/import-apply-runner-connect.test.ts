import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import type { Db } from '../../../db/client.js';
import type { PlatformActor } from '../../platform-port/permissions.js';
import { type ApplyContext, runApply } from '../import-apply-service.js';

// `busyOnNoConnection` turns only the pool's acquisition timeout into `busy`; any other connect error propagates.

function ctxWith(connectError: Error, busyOnNoConnection: boolean): ApplyContext {
  const pool = { connect: () => Promise.reject(connectError) } as unknown as pg.Pool;
  return {
    db: {} as Db,
    pool,
    actor: { workspace_id: 'ws' } as unknown as PlatformActor,
    authorize: async () => true,
    config: { budgetMs: 0, busyOnNoConnection },
  };
}

describe('runApply: runner pool cannot hand out a connection', () => {
  it('answers busy for the pool acquisition timeout when the action asks for it', async () => {
    const res = await runApply(ctxWith(new Error('timeout exceeded when trying to connect'), true), 'job', 1);
    expect(res).toEqual({ kind: 'busy' });
  });

  it('rethrows the acquisition timeout when the flag is off (route behaviour)', async () => {
    await expect(runApply(ctxWith(new Error('timeout exceeded when trying to connect'), false), 'job', 1)).rejects.toThrow(
      'timeout exceeded when trying to connect',
    );
  });

  it.each([
    ['authentication', Object.assign(new Error('password authentication failed for user "platform_app"'), { code: '28P01' })],
    ['network', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })],
  ])('rethrows a %s error unchanged even with the flag on', async (_name, error) => {
    await expect(runApply(ctxWith(error, true), 'job', 1)).rejects.toBe(error);
  });
});
