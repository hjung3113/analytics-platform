// POST /api/v1/platform/files against the live DB (#1741): what only the real stack proves.
// The route layer itself (caps, outcomes, admission) is covered DB-free in platform-files-route.test.ts.
//
//   * the `attachment_uploaded` audit row written through the new route carries no filename
//   * a replay stores one row and answers `replayed`
//   * the unlinked upload is downloadable by its uploader only, as `attachment` with nosniff
//   * a cross-workspace storage key stays 404
//   * the purge predicate still sees the upload as unlinked (no parent kind was added)

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { memoryStorage } from '../../../test-support/memory-storage.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const DISTINCT_NAME = 'zq-distinct-secret-name.batch.json';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('POST /api/v1/platform/files (live DB)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const memory = memoryStorage();
  // #1991: a storage put delay makes concurrent uploads overlap for certain, as they do on a slow CI runner.
  let putDelayMs = 0;
  const storage: typeof memory = {
    ...memory,
    async put(input) {
      if (putDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, putDelayMs));
      return memory.put(input);
    },
  };
  // The concurrent-retry test sends this many uploads at once; each holds an admission slot until it answers.
  const CONCURRENT_RETRIES = 6;

  async function login(externalId: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/mock-login',
      headers: { 'user-agent': 'integration-test' },
      payload: { external_id: externalId },
    });
    const list = [res.headers['set-cookie'] ?? ''].flat();
    for (const c of list) {
      const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (m?.[1]) return m[1];
    }
    throw new Error(`mock-login failed: ${res.statusCode}`);
  }

  async function csrfOf(cookie: string): Promise<string> {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/bootstrap',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    return (res.json() as { csrfToken: string }).csrfToken;
  }

  async function upload(cookie: string, opts: { key?: string; bytes?: Buffer; filename?: string; csrf?: string } = {}) {
    const fd = new FormData();
    fd.append('file', opts.bytes ?? Buffer.from('{"a":1}'), {
      filename: opts.filename ?? DISTINCT_NAME,
      contentType: 'application/json',
    });
    return app.inject({
      method: 'POST',
      url: '/api/v1/platform/files',
      headers: {
        ...fd.getHeaders(),
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'x-csrf-token': opts.csrf ?? (await csrfOf(cookie)),
        'idempotency-key': opts.key ?? randomUUID(),
      },
      payload: fd.getBuffer(),
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    // Enough admission slots for every concurrent retry: this suite proves idempotency, not the busy refusal
    // (covered in upload-admission.integration.test.ts). With the default 4, retries 5 and 6 were refused as
    // `error` whenever the first four still held their slots (#1991).
    app = await buildServer({
      config: { ...loadConfig(), ATTACHMENT_UPLOAD_CONCURRENCY: CONCURRENT_RETRIES },
      dbHandle,
      storage,
    });
    await app.ready();
  });

  afterAll(async () => {
    await migrateHandle.pool.query(`delete from core.audit_log where event_type = 'attachment_uploaded'`);
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from voc.voc_attachments');
    await dbHandle.pool.query(`delete from core.sessions where created_user_agent_summary = 'integration-test'`);
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('writes an audit row without the filename, and a replay stores one row', async () => {
    const cookie = await login('mock-user-1');
    const key = randomUUID();
    const first = await upload(cookie, { key });
    expect(first.json()).toMatchObject({ outcome: 'ok', replayed: false, data: { size: 7, mimeType: 'application/json' } });
    const id = (first.json() as { data: { id: string } }).data.id;

    const replay = await upload(cookie, { key });
    expect(replay.json()).toMatchObject({ outcome: 'ok', replayed: true, data: { id } });

    const rows = await dbHandle.pool.query(`select 1 from voc.voc_attachments where id = $1`, [id]);
    expect(rows.rowCount).toBe(1);
    const audits = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where event_type = 'attachment_uploaded' and subject_id = $1`,
      [id],
    );
    expect(audits.rowCount).toBe(1);
    const row = audits.rows[0];
    // The submitted name is nowhere in the stored detail, not even inside `storage_key` (a filename-free reference).
    expect('filename' in (row?.detail ?? {})).toBe(false);
    expect(JSON.stringify(row?.detail)).not.toContain(DISTINCT_NAME);
    expect(row?.detail).toMatchObject({ storage_key: `${WORKSPACE_ID}/${id}` });
  });

  it('writes no filename into the audit detail through POST /attachments either', async () => {
    const cookie = await login('mock-user-1');
    const fd = new FormData();
    fd.append('file', Buffer.from('{"a":1}'), { filename: DISTINCT_NAME, contentType: 'application/json' });
    const res = await app.inject({
      method: 'POST',
      url: '/attachments',
      headers: { ...fd.getHeaders(), cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'idempotency-key': randomUUID() },
      payload: fd.getBuffer(),
    });
    expect(res.statusCode).toBe(201);
    const id = (res.json() as { id: string }).id;
    const audits = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where event_type = 'attachment_uploaded' and subject_id = $1`,
      [id],
    );
    expect(audits.rowCount).toBe(1);
    expect(JSON.stringify(audits.rows[0]?.detail)).not.toContain(DISTINCT_NAME);
    // The object itself is still stored under the full key, so reads of uploads are unchanged.
    const stored = await dbHandle.pool.query<{ storage_key: string }>(
      `select storage_key from voc.voc_attachments where id = $1`,
      [id],
    );
    expect(stored.rows[0]?.storage_key).toBe(`${WORKSPACE_ID}/${id}/${DISTINCT_NAME}`);
  });

  it('treats two spellings of one Idempotency-Key as one: exactly one `replayed: false` among concurrent retries', async () => {
    const cookie = await login('mock-user-1');
    const csrf = await csrfOf(cookie);
    const key = randomUUID();
    const before = await dbHandle.pool.query(`select 1 from voc.voc_attachments`);
    putDelayMs = 300;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_RETRIES }, (_, i) =>
        upload(cookie, { key: i % 2 === 0 ? key.toLowerCase() : key.toUpperCase(), csrf }),
      ),
    ).finally(() => {
      putDelayMs = 0;
    });
    const bodies = results.map((r) => r.json() as { outcome: string; replayed: boolean; data: { id: string } });
    expect(bodies.map((b) => b.outcome)).toEqual(Array(CONCURRENT_RETRIES).fill('ok'));
    expect(bodies.filter((b) => b.replayed === false)).toHaveLength(1);
    expect(new Set(bodies.map((b) => b.data.id)).size).toBe(1);
    const after = await dbHandle.pool.query(`select 1 from voc.voc_attachments`);
    expect((after.rowCount ?? 0) - (before.rowCount ?? 0)).toBe(1);
  });

  it('lets only the uploader download the unlinked upload, as an attachment with nosniff', async () => {
    const cookie = await login('mock-user-1');
    const id = ((await upload(cookie)).json() as { data: { id: string } }).data.id;

    const own = await app.inject({
      method: 'GET',
      url: `/attachments/${id}/download`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(own.statusCode).toBe(200);
    expect(own.headers['content-type']).toContain('application/json');
    expect(String(own.headers['content-disposition'])).toMatch(/^attachment;/);
    expect(own.headers['x-content-type-options']).toBe('nosniff');

    const others = await dbHandle.pool.query<{ external_id: string }>(
      `select external_id from core.actors where external_id <> 'mock-user-1' and actor_type <> 'system' and external_id is not null limit 1`,
    );
    const other = others.rows[0]?.external_id;
    if (!other) return; // no second seeded actor: the uploader-only rule is also pinned by get-attachments-download.
    const stranger = await app.inject({
      method: 'GET',
      url: `/attachments/${id}/download`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${await login(other)}` },
    });
    expect(stranger.statusCode).toBe(403);
  });

  it('answers 404 for a stored key under another workspace, and keeps the upload unlinked', async () => {
    const cookie = await login('mock-user-1');
    const id = ((await upload(cookie)).json() as { data: { id: string } }).data.id;
    const row = await dbHandle.pool.query<{
      storage_key: string;
      voc_id: string | null;
      comment_id: string | null;
      parent_id: string | null;
    }>(`select storage_key, voc_id, comment_id, parent_id from voc.voc_attachments where id = $1`, [id]);
    expect(row.rows[0]).toMatchObject({ voc_id: null, comment_id: null, parent_id: null });

    await migrateHandle.pool.query(`update voc.voc_attachments set storage_key = $2 where id = $1`, [
      id,
      `${randomUUID()}/${id}/x.json`,
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/attachments/${id}/download`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
