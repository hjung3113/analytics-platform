// POST /attachments admission integration tests (#1266 b4).
//
// ATTACHMENT_UPLOAD_CONCURRENCY bounds concurrent uploads per process. The
// slot is taken before buffering, refused immediately with 503
// service.unavailable + Retry-After: 5 when none is free, and released after
// success, error and an aborted request. A gated fake storage holds uploads
// in flight deterministically.

import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import {
  type StorageBackend,
  type StorageGetResult,
  type StoragePutInput,
  StorageUnavailableError,
} from '../../../lib/storage/index.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const LIMIT = 2;

interface GatedStorage extends StorageBackend {
  puts: number;
  mode: 'gated' | 'ok' | 'throw-unavailable';
  release(): void;
}

function createGatedStorage(): GatedStorage {
  let open!: () => void;
  let gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const storage: GatedStorage = {
    puts: 0,
    mode: 'gated',
    release() {
      open();
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    async put(input: StoragePutInput) {
      storage.puts += 1;
      if (storage.mode === 'throw-unavailable') throw new StorageUnavailableError('offline');
      if (storage.mode === 'gated') await gate;
      return { key: input.key };
    },
    async get(): Promise<StorageGetResult> {
      throw new Error('get not used');
    },
    async delete() {},
    async exists() {
      return false;
    },
  };
  return storage;
}

function multipart(opts: { bytes: Buffer; filename: string; contentType: string }) {
  const fd = new FormData();
  fd.append('file', opts.bytes, { filename: opts.filename, contentType: opts.contentType });
  return { payload: fd.getBuffer(), headers: fd.getHeaders() };
}

describe.skipIf(!runIntegration)('POST /attachments — upload admission (#1266 b4)', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let storage: GatedStorage;
  let cookie = '';

  async function login(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/mock-login',
      headers: { 'user-agent': 'integration-test' },
      payload: { external_id: 'mock-user-1' },
    });
    const header = res.headers['set-cookie'];
    const list = Array.isArray(header) ? header : [header ?? ''];
    for (const c of list) {
      const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (m?.[1]) return m[1];
    }
    throw new Error(`mock-login failed: ${res.statusCode}`);
  }

  function upload(contentType = 'image/png') {
    const { payload, headers } = multipart({
      bytes: Buffer.from('admission-bytes'),
      filename: 'a.png',
      contentType,
    });
    return app.inject({
      method: 'POST',
      url: '/attachments',
      headers: {
        ...headers,
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'idempotency-key': randomUUID(),
      },
      payload,
    });
  }

  async function until(predicate: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function cleanupDb() {
    await dbHandle.pool.query('delete from core.rate_limits');
    await dbHandle.pool.query('delete from core.idempotency_keys');
    await dbHandle.pool.query('delete from voc.voc_attachments');
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    storage = createGatedStorage();
    app = await buildServer({
      config: { ...loadConfig(), ATTACHMENT_UPLOAD_CONCURRENCY: LIMIT },
      dbHandle,
      storage,
    });
    await app.ready();
  });

  afterAll(async () => {
    await cleanupDb();
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
    await app?.close();
    await dbHandle?.close();
  });

  beforeEach(async () => {
    await cleanupDb();
    storage.puts = 0;
    storage.mode = 'gated';
    cookie = await login();
  });

  afterEach(() => {
    storage.release();
  });

  it('refuses the N+1th concurrent upload with 503 service.unavailable and Retry-After: 5, then admits again after release', async () => {
    const inFlight = Array.from({ length: LIMIT }, () => upload());
    await until(() => storage.puts === LIMIT, 'both uploads to reach storage');

    const refused = await upload();
    expect(refused.statusCode).toBe(503);
    expect(refused.json().code).toBe('service.unavailable');
    expect(refused.headers['retry-after']).toBe('5');
    // The refused request never reached storage (no buffering, no put).
    expect(storage.puts).toBe(LIMIT);

    storage.release();
    const settled = await Promise.all(inFlight);
    expect(settled.map((r) => r.statusCode)).toEqual([201, 201]);

    // Slot released after success.
    storage.mode = 'ok';
    expect((await upload()).statusCode).toBe(201);
  });

  it('releases the slot after a storage error', async () => {
    storage.mode = 'throw-unavailable';
    for (let i = 0; i < LIMIT + 2; i += 1) {
      expect((await upload()).statusCode).toBe(502);
    }
    storage.mode = 'ok';
    expect((await upload()).statusCode).toBe(201);
  });

  it('releases the slot after a validation rejection', async () => {
    for (let i = 0; i < LIMIT + 2; i += 1) {
      expect((await upload('application/x-msdownload')).statusCode).toBe(422);
    }
    storage.mode = 'ok';
    expect((await upload()).statusCode).toBe(201);
  });

  it('releases the slot when the client aborts mid-upload', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    storage.mode = 'ok';

    const abortOne = () =>
      new Promise<void>((resolve) => {
        const boundary = `----abort${randomUUID()}`;
        const req = httpRequest({
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/attachments',
          headers: {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(5 * 1024 * 1024),
            cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
            'idempotency-key': randomUUID(),
          },
        });
        req.on('error', () => resolve());
        req.on('close', () => resolve());
        req.write(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n` +
            'Content-Type: image/png\r\n\r\npartial-bytes',
        );
        setTimeout(() => req.destroy(), 100);
      });

    // More aborted uploads than slots: a leak would exhaust the pool.
    for (let i = 0; i < LIMIT + 1; i += 1) await abortOne();

    const deadline = Date.now() + 5000;
    let status = 0;
    while (Date.now() < deadline) {
      const res = await upload();
      status = res.statusCode;
      if (status === 201) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(status).toBe(201);
  });
});
