// #1658 (ADR-0140 §6) — `readUnlinkedUpload`, DB-free: the bytes of an upload by id for the module that consumes it. The SQL predicates that make it
// uploader-only, unlinked-only and 24 h-bound are asserted on the statement; the live-DB proof is `eqv/__tests__/window-fleet.integration.test.ts`.

import { Readable } from 'node:stream';

import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../../../lib/errors.js';
import { StorageUnavailableError } from '../../../lib/storage/index.js';
import { createAttachmentsService } from '../service.js';

const WS = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const ATT = '44444444-4444-4444-8444-444444444444';
const dialect = new PgDialect();

function build(opts: { row?: { storage_key: string; size_bytes: string | number } | null; get?: () => Promise<{ stream: Readable; mimeType: string; size: number }> } = {}) {
  const row = opts.row === undefined ? { storage_key: `${WS}/${ATT}/w.batch.json`, size_bytes: 7 } : opts.row;
  const execute = vi.fn(async () => ({ rows: row ? [row] : [] }));
  const get = vi.fn(opts.get ?? (async () => ({ stream: Readable.from([Buffer.from('{"a":1}')]), mimeType: 'application/json', size: 7 })));
  const service = createAttachmentsService({
    storage: { put: vi.fn(), get, delete: vi.fn(), exists: vi.fn() },
    auditService: {} as never,
    db: { execute } as never,
    idempotencyService: {} as never,
    vocReadService: {} as never,
  });
  const read = (maxBytes = 1024) => service.readUnlinkedUpload({ workspaceId: WS, actorId: ME, id: ATT, maxBytes });
  return { read, execute, get, service };
}

describe('readUnlinkedUpload', () => {
  it('returns the bytes of the uploader\'s own unlinked upload', async () => {
    const t = build();
    expect((await t.read())?.toString('utf8')).toBe('{"a":1}');
    expect(t.get).toHaveBeenCalledWith(`${WS}/${ATT}/w.batch.json`);
  });

  it('reads the row on the caller\'s transaction when one is given, and not on the pool', async () => {
    const t = build();
    const txExecute = vi.fn(async () => ({ rows: [{ storage_key: `${WS}/${ATT}/w.batch.json`, size_bytes: 7 }] }));
    const bytes = await t.service.readUnlinkedUpload({ workspaceId: WS, actorId: ME, id: ATT, maxBytes: 1024, db: { execute: txExecute } as never });
    expect(bytes?.toString('utf8')).toBe('{"a":1}');
    expect(txExecute).toHaveBeenCalledTimes(1);
    expect(t.execute).not.toHaveBeenCalled();
  });

  it('asks only for a row of this uploader that is unlinked, not archived and younger than 24 h', async () => {
    const t = build();
    await t.read();
    const statement = (t.execute.mock.calls[0] as unknown as [Parameters<PgDialect['sqlToQuery']>[0]])[0];
    const query = dialect.sqlToQuery(statement);
    expect(query.params).toEqual([ATT, ME]);
    for (const predicate of ['uploaded_by_actor_id =', 'voc_id is null', 'comment_id is null', 'parent_id is null', 'archived_at is null', "interval '24 hours'"]) {
      expect(query.sql, predicate).toContain(predicate);
    }
  });

  it.each([
    ['no such row (unknown, linked, archived, expired or another user\'s)', { row: null }],
    ['a storage key of another workspace', { row: { storage_key: `99999999-9999-4999-8999-999999999999/${ATT}/w.batch.json`, size_bytes: 7 } }],
    ['a row over the cap', { row: { storage_key: `${WS}/${ATT}/w.batch.json`, size_bytes: '5000' } }],
  ])('answers null for %s and never touches storage', async (_label, opts) => {
    const t = build(opts);
    expect(await t.read(1024)).toBeNull();
    expect(t.get).not.toHaveBeenCalled();
  });

  it('answers null for bytes gone from storage, and for a stream that outgrows the cap', async () => {
    const gone = build({ get: async () => { throw Object.assign(new Error('no such key'), { name: 'NoSuchKey' }); } });
    expect(await gone.read()).toBeNull();
    const big = build({ get: async () => ({ stream: Readable.from([Buffer.alloc(600), Buffer.alloc(600)]), mimeType: 'application/json', size: 7 }) });
    expect(await big.read(1000)).toBeNull();
  });

  it('maps an unreachable store to storage.unavailable and rethrows anything else', async () => {
    const down = build({ get: async () => { throw new StorageUnavailableError('down'); } });
    await expect(down.read()).rejects.toBeInstanceOf(HttpError);
    await expect(down.read()).rejects.toMatchObject({ code: 'storage.unavailable' });
    const odd = build({ get: async () => { throw new Error('boom'); } });
    await expect(odd.read()).rejects.toThrow('boom');
  });
});
