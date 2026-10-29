import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../../db/tx.js';
import {
  IDEMPOTENCY_RESPONSE_BODY_MAX_BYTES,
  createIdempotencyService,
} from '../idempotency-service.js';

// A DB-free spy: `record` only calls insert().values().onConflictDoNothing().
function spyTx() {
  const inserted: Array<Record<string, unknown>> = [];
  const tx = {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  } as unknown as Tx;
  return { tx, inserted };
}

const service = createIdempotencyService();
const bodyOf = (bytes: number) => ({ text: 'x'.repeat(bytes) });

describe('idempotency response byte bound', () => {
  it('defaults to 16 KiB for every caller that passes no option', async () => {
    const { tx, inserted } = spyTx();
    await service.record(tx, 'a', 'k', 'h', 200, bodyOf(IDEMPOTENCY_RESPONSE_BODY_MAX_BYTES));
    expect(inserted[0]?.requestHash).toBe('response-body-skipped:h');
    expect(inserted[0]?.responseBody).toEqual({
      skipped: true,
      reason: 'response_body_exceeds_16kb',
    });
  });

  it('stores a body under the default bound unchanged', async () => {
    const { tx, inserted } = spyTx();
    const body = bodyOf(100);
    await service.record(tx, 'a', 'k', 'h', 200, body);
    expect(inserted[0]).toMatchObject({ requestHash: 'h', responseBody: body });
  });

  it('stores a body above 16 KiB when the caller passes a larger finite bound', async () => {
    const { tx, inserted } = spyTx();
    const body = bodyOf(40 * 1024);
    await service.record(tx, 'a', 'k', 'h', 200, body, { responseBodyMaxBytes: 128 * 1024 });
    expect(inserted[0]).toMatchObject({ requestHash: 'h', responseBody: body });
  });

  it('still marks a body over the caller bound as skipped', async () => {
    const { tx, inserted } = spyTx();
    await service.record(tx, 'a', 'k', 'h', 200, bodyOf(2048), { responseBodyMaxBytes: 1024 });
    expect(inserted[0]?.requestHash).toBe('response-body-skipped:h');
    expect(inserted[0]?.responseBody).toEqual({
      skipped: true,
      reason: 'response_body_exceeds_limit',
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the non-finite or non-positive-integer bound %s',
    async (bound) => {
      const { tx } = spyTx();
      await expect(
        service.record(tx, 'a', 'k', 'h', 200, {}, { responseBodyMaxBytes: bound }),
      ).rejects.toThrow(/responseBodyMaxBytes/);
    },
  );
});
