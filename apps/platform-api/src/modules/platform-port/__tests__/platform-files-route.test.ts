// DB-free checks of `POST /api/v1/platform/files` (#1741) and of the 25 MiB cap that `POST /attachments` keeps beside it.
// A fake attachments service stands in for storage and the idempotency frame, so what runs for real is the route layer:
// session, CSRF, permission, the shared multipart intake, the per-request caps, admission and the outcome mapping.

import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import cookiePlugin from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HttpError } from '../../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import {
  MAX_ATTACHMENT_BYTES,
  MULTIPART_CEILING_BYTES,
  attachmentsRoutes,
  UPLOAD_PARSER_LIMITS,
  createUploadAdmission,
  readUploadPart,
} from '../../attachments/index.js';
import type { AttachmentsService } from '../../attachments/index.js';
import type { SessionService } from '../../auth/session-service.js';
import type { CheckService } from '../../permissions/check-service.js';
import { platformFilesRoutes } from '../files-routes.js';

const WS = '11111111-1111-4111-8111-111111111111';
const MIB = 1024 * 1024;

// Holds the session lookup open (real-socket abort test); `authStarted` counts lookups that reached it.
let authGate: Promise<void> | null = null;
let authStarted = 0;

const sessionService = {
  loadAndTouch: async (cookie: string) => {
    if (authGate) {
      authStarted += 1;
      await authGate;
    }
    return loadSession(cookie);
  },
  loadActive: async () => null,
  getCsrfToken: async (cookie: string) => (cookie === 'good' || cookie === 'foreign' ? 'tok' : null),
} as unknown as SessionService;

function loadSession(cookie: string) {
  return cookie === 'good'
      ? {
          session: { id: 'good', workspaceId: WS },
          actor: { id: '22222222-2222-4222-8222-222222222222', roleLevel: 'user', displayName: 'A' },
        }
      : cookie === 'foreign'
        ? {
            session: { id: 'foreign', workspaceId: '33333333-3333-4333-8333-333333333333' },
            actor: { id: 'x', roleLevel: 'user', displayName: 'X' },
          }
        : null;
}

type Call = { filename: string; mimeType: string; size: number; key: string };
const calls: Call[] = [];
let bodiesParsed = 0;
const stored = new Map<string, { hash: string; body: Record<string, unknown> }>();
let gate: Promise<void> | null = null;

const attachmentsService = {
  uploadAttachmentCommand: async (a: {
    bytes: Buffer;
    mimeType: string;
    filename: string;
    idempotencyKey: string;
    requestHash: string;
  }) => {
    calls.push({ filename: a.filename, mimeType: a.mimeType, size: a.bytes.byteLength, key: a.idempotencyKey });
    if (gate) await gate;
    const prior = stored.get(a.idempotencyKey);
    if (prior) {
      if (prior.hash !== a.requestHash) {
        throw new HttpError('conflict.idempotency_key_reuse', 'Idempotency-Key reused with different request body');
      }
      return { status: 201, body: prior.body, replayed: true };
    }
    const body = {
      id: randomUUID(),
      name: a.filename,
      size_bytes: a.bytes.byteLength,
      mime_type: a.mimeType,
      uploaded_by_actor_id: 'x',
      created_at: new Date().toISOString(),
    };
    stored.set(a.idempotencyKey, { hash: a.requestHash, body });
    return { status: 201, body, replayed: false };
  },
} as unknown as AttachmentsService;

function form(parts: { bytes: Buffer; filename: string; contentType: string }[]) {
  const fd = new FormData();
  for (const p of parts) fd.append('file', p.bytes, { filename: p.filename, contentType: p.contentType });
  return { payload: fd.getBuffer(), headers: fd.getHeaders() };
}

describe('POST /api/v1/platform/files and the /attachments cap (DB-free)', () => {
  let app: FastifyInstance;
  const admission = createUploadAdmission(2);

  beforeAll(async () => {
    app = Fastify();
    // Counts requests whose body was parsed (`preValidation` runs after the content parser).
    app.addHook('preValidation', async () => {
      bodiesParsed += 1;
    });
    await app.register(cookiePlugin);
    await app.register(multipart, { limits: { fileSize: MULTIPART_CEILING_BYTES, files: 1 } });
    await app.register(attachmentsRoutes, {
      sessionService,
      attachmentsService,
      workspaceId: WS,
      uploadAdmission: admission,
    });
    await app.register(platformFilesRoutes, {
      prefix: '/api/v1/platform',
      sessionService,
      checkService: {} as CheckService,
      attachmentsService,
      uploadAdmission: admission,
      workspaceId: WS,
    });
    await app.ready();
  });
  afterAll(() => app.close());

  function post(
    url: string,
    parts: { bytes: Buffer; filename: string; contentType: string }[],
    extra: Record<string, string> = {},
    cookie: string | null = 'good',
  ) {
    const { payload, headers } = form(parts);
    return app.inject({
      method: 'POST',
      url,
      headers: {
        ...headers,
        ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
        'x-csrf-token': 'tok',
        'idempotency-key': randomUUID(),
        ...extra,
      },
      payload,
    });
  }
  const FILES = '/api/v1/platform/files';
  const one = (size: number, contentType = 'application/json', filename = 'a.batch.json') => [
    { bytes: Buffer.alloc(size, 0x20), filename, contentType },
  ];

  it('accepts application/json and answers the action envelope with the stored size and MIME', async () => {
    const res = await post(FILES, one(7));
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({
      outcome: 'ok',
      data: { id: expect.any(String), name: 'a.batch.json', size: 7, mimeType: 'application/json' },
      version: null,
      fieldErrors: [],
      replayed: false,
      correlationId: expect.any(String),
    });
  });

  it('refuses without a session (401), with a foreign-workspace session (403) and with a wrong CSRF token (403) before reading the body', async () => {
    const before = calls.length;
    expect((await post(FILES, one(1), {}, null)).statusCode).toBe(401);
    expect((await post(FILES, one(1), {}, 'foreign')).statusCode).toBe(403);
    const csrf = await post(FILES, one(1), { 'x-csrf-token': 'nope' });
    expect(csrf.statusCode).toBe(403);
    expect(csrf.json()).toMatchObject({ code: 'csrf.invalid' });
    expect(calls.length).toBe(before);
  });

  it('replays the same key and file as `replayed`, and answers `conflict` for the same key with a different file', async () => {
    const key = randomUUID();
    const first = await post(FILES, one(5), { 'idempotency-key': key });
    const replay = await post(FILES, one(5), { 'idempotency-key': key });
    expect(replay.json()).toMatchObject({
      outcome: 'ok',
      replayed: true,
      data: { id: first.json().data.id },
    });
    const clash = await post(FILES, one(6), { 'idempotency-key': key });
    expect(clash.statusCode).toBe(200);
    expect(clash.json()).toMatchObject({ outcome: 'conflict', data: null });
  });

  it('accepts exactly 32 MiB and rejects 32 MiB + 1 as `invalid` (too_large) without storing it', async () => {
    const before = calls.length;
    const exact = await post(FILES, one(32 * MIB));
    expect(exact.json()).toMatchObject({ outcome: 'ok', data: { size: 32 * MIB } });
    const over = await post(FILES, one(32 * MIB + 1));
    expect(over.statusCode).toBe(200);
    expect(over.json()).toMatchObject({
      outcome: 'invalid',
      data: null,
      fieldErrors: [{ path: ['file'], code: 'too_large' }],
    });
    expect(calls.length).toBe(before + 1);
  }, 60_000);

  it.each([
    ['an unsupported type', one(3, 'application/x-msdownload'), 'unsupported_type'],
    ['an empty declared type (octet-stream)', one(3, 'application/octet-stream'), 'unsupported_type'],
    ['a name that sanitizes to nothing', one(3, 'application/json', '////\\\\'), 'invalid_filename'],
    [
      'a second file part',
      [...one(3), ...one(3, 'application/json', 'b.json')],
      'too_many_parts',
    ],
  ])('judges %s as `invalid`, not thrown', async (_label, parts, code) => {
    const before = calls.length;
    const res = await post(FILES, parts);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe('invalid');
    expect(body.fieldErrors[0].code).toBe(code);
    expect(calls.length).toBe(before);
  });

  it('judges a missing or malformed Idempotency-Key and a non-multipart body as `invalid`', async () => {
    const missing = await post(FILES, one(2), { 'idempotency-key': '' });
    expect(missing.json()).toMatchObject({ outcome: 'invalid' });
    const bad = await post(FILES, one(2), { 'idempotency-key': 'not-a-uuid' });
    expect(bad.json()).toMatchObject({ outcome: 'invalid' });
    const json = await app.inject({
      method: 'POST',
      url: FILES,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=good`,
        'x-csrf-token': 'tok',
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: '{}',
    });
    expect(json.json()).toMatchObject({
      outcome: 'invalid',
      fieldErrors: [{ path: ['headers', 'content-type'], code: 'invalid_content_type' }],
    });
  });

  it('refuses at once as `error` when no admission slot is free, and releases every slot afterwards (success, rejection, busy)', async () => {
    let open!: () => void;
    gate = new Promise<void>((r) => {
      open = r;
    });
    const a = post(FILES, one(1));
    const b = post(FILES, one(1));
    while (admission.inFlight < 2) await new Promise((r) => setTimeout(r, 5));
    const busy = await post(FILES, one(1));
    expect(busy.statusCode).toBe(200);
    expect(busy.headers['retry-after']).toBe('5');
    expect(busy.json()).toMatchObject({ outcome: 'error', data: null });
    // The same pool refuses /attachments too: one budget for both routes.
    const attachments = await post('/attachments', one(1, 'image/png', 'a.png'));
    expect(attachments.statusCode).toBe(503);
    gate = null;
    open();
    await Promise.all([a, b]);
    await post(FILES, one(3, 'application/x-msdownload'));
    expect(admission.inFlight).toBe(0);
  });

  /** A multipart body built field by field (`form()` only appends files). */
  function raw(build: (fd: FormData) => void, extra: Record<string, string> = {}, url = FILES) {
    const fd = new FormData();
    build(fd);
    return app.inject({
      method: 'POST',
      url,
      headers: {
        ...fd.getHeaders(),
        cookie: `${SESSION_COOKIE_NAME}=good`,
        'x-csrf-token': 'tok',
        'idempotency-key': randomUUID(),
        ...extra,
      },
      payload: fd.getBuffer(),
    });
  }
  const json = (fd: FormData, name = 'a.json') =>
    fd.append('file', Buffer.from('{}'), { filename: name, contentType: 'application/json' });

  it('refuses a file under another field name as `required` and ignores a small text field beside the file', async () => {
    const before = calls.length;
    const wrong = await raw((fd) =>
      fd.append('upload', Buffer.from('{}'), { filename: 'a.json', contentType: 'application/json' }),
    );
    expect(wrong.json()).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['file'], code: 'required' }] });
    expect(calls.length).toBe(before);

    const withField = await raw((fd) => {
      fd.append('note', 'hello');
      json(fd);
    });
    expect(withField.json()).toMatchObject({ outcome: 'ok', data: { name: 'a.json' } });
  });

  it('is strict about what follows the file: a malformed trailing field, alone or before a second file, is refused', async () => {
    const before = calls.length;
    const trailing = await raw((fd) => {
      json(fd);
      fd.append('meta', '{not json', { contentType: 'application/json' });
    });
    expect(trailing.json()).toMatchObject({ outcome: 'invalid', fieldErrors: [{ code: 'malformed' }] });
    const combined = await raw((fd) => {
      json(fd);
      fd.append('meta', '{not json', { contentType: 'application/json' });
      json(fd, 'b.json');
    });
    expect(combined.json()).toMatchObject({ outcome: 'invalid' });
    expect(combined.json()).not.toMatchObject({ outcome: 'ok' });
    expect(calls.length).toBe(before);
  });

  it('bounds text fields before they are kept: too many or too large a field is `malformed`, not buffered', async () => {
    const before = calls.length;
    const tooMany = await raw((fd) => {
      for (let i = 0; i < UPLOAD_PARSER_LIMITS.fields + 1; i += 1) fd.append(`f${i}`, 'x');
      json(fd);
    });
    expect(tooMany.json()).toMatchObject({ outcome: 'invalid', fieldErrors: [{ code: 'malformed' }] });
    expect(calls.length).toBe(before);
  });

  it('does not enter a body parser on any refusal path (session, CSRF, key, media type, permission)', async () => {
    const jsonBody = (headers: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: FILES,
        headers: { 'content-type': 'application/json', ...headers },
        payload: JSON.stringify({ pad: 'x'.repeat(2048) }),
      });
    const ok = { cookie: `${SESSION_COOKIE_NAME}=good`, 'x-csrf-token': 'tok' };
    const parsedBefore = bodiesParsed;
    expect((await jsonBody({})).statusCode).toBe(401);
    expect((await jsonBody({ cookie: `${SESSION_COOKIE_NAME}=foreign`, 'x-csrf-token': 'tok' })).statusCode).toBe(403);
    expect((await jsonBody({ cookie: `${SESSION_COOKIE_NAME}=good`, 'x-csrf-token': 'bad' })).statusCode).toBe(403);
    expect((await jsonBody({ ...ok, 'idempotency-key': 'nope' })).json()).toMatchObject({ outcome: 'invalid' });
    expect((await jsonBody({ ...ok, 'idempotency-key': randomUUID() })).json()).toMatchObject({
      outcome: 'invalid',
      fieldErrors: [{ code: 'invalid_content_type' }],
    });
    expect(bodiesParsed).toBe(parsedBefore);
  });

  it('hands the service one lowercase key for either spelling of the same UUID', async () => {
    const key = randomUUID();
    const before = calls.length;
    const lower = await post(FILES, one(3), { 'idempotency-key': key.toLowerCase() });
    const upper = await post(FILES, one(3), { 'idempotency-key': key.toUpperCase() });
    expect(calls.slice(before).map((c) => c.key)).toEqual([key.toLowerCase(), key.toLowerCase()]);
    expect(upper.json()).toMatchObject({ outcome: 'ok', replayed: true, data: { id: lower.json().data.id } });
  });

  it('answers `conflict` for the same key and a different file with identical name, type and size', async () => {
    const key = randomUUID();
    const part = (fill: number) => [
      { bytes: Buffer.alloc(8, fill), filename: 'same.json', contentType: 'application/json' },
    ];
    expect((await post(FILES, part(0x20), { 'idempotency-key': key })).json()).toMatchObject({ outcome: 'ok' });
    expect((await post(FILES, part(0x21), { 'idempotency-key': key })).json()).toMatchObject({ outcome: 'conflict' });
  });

  it('settles a request whose client left during authorization and frees its admission slot (real socket)', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    let acquired = 0;
    const tryAcquire = admission.tryAcquire.bind(admission);
    admission.tryAcquire = () => {
      acquired += 1;
      return tryAcquire();
    };
    const before = calls.length;
    const startedBefore = authStarted;
    let open!: () => void;
    authGate = new Promise<void>((r) => {
      open = r;
    });
    try {
      const fd = new FormData();
      fd.append('file', Buffer.alloc(4096, 0x20), { filename: 'a.json', contentType: 'application/json' });
      const body = fd.getBuffer();
      const req = http.request({
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: FILES,
        headers: {
          ...fd.getHeaders(),
          'content-length': String(body.length),
          cookie: `${SESSION_COOKIE_NAME}=good`,
          'x-csrf-token': 'tok',
          'idempotency-key': randomUUID(),
        },
      });
      req.on('error', () => undefined);
      req.write(body.subarray(0, 600));
      while (authStarted === startedBefore) await new Promise((r) => setTimeout(r, 5));
      req.destroy();
      await new Promise((r) => setTimeout(r, 150));
      authGate = null;
      open();
      while (acquired === 0) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 200));
      expect(admission.inFlight).toBe(0);
      expect(calls.length).toBe(before);
    } finally {
      authGate = null;
      open();
      admission.tryAcquire = tryAcquire;
      await app.server.close?.call(app.server);
    }
  }, 15_000);

  describe('POST /attachments keeps its own 25 MiB cap under the 32 MiB ceiling', () => {
    it('accepts exactly 25 MiB and still rejects 25 MiB + 1 with the unchanged error body', async () => {
      const exact = await post('/attachments', one(MAX_ATTACHMENT_BYTES, 'image/png', 'a.png'));
      expect(exact.statusCode).toBe(201);
      const over = await post('/attachments', one(MAX_ATTACHMENT_BYTES + 1, 'image/png', 'a.png'));
      expect(over.statusCode).toBe(422);
      expect(over.json()).toEqual({
        code: 'attachment.too_large',
        message: 'attachment exceeds 25MB limit',
        detail: { fields: [{ path: ['file'], code: 'too_large' }], max_bytes: 25 * MIB },
      });
    }, 60_000);

    it('keeps accepting a valid file followed by an unrelated malformed text field (201, legacy tolerance), and refuses a second file', async () => {
      const trailing = await raw(
        (fd) => {
          fd.append('file', Buffer.from('{}'), { filename: 'a.png', contentType: 'image/png' });
          fd.append('meta', '{not json', { contentType: 'application/json' });
        },
        {},
        '/attachments',
      );
      expect(trailing.statusCode).toBe(201);
      const second = await post('/attachments', [...one(3, 'image/png', 'a.png'), ...one(3, 'image/png', 'b.png')]);
      expect(second.statusCode).toBe(422);
    });

    it('applies the 25 MiB cap as a per-request parser limit, not only a post-hoc size check', async () => {
      const seen: unknown[] = [];
      const probe = Fastify();
      await probe.register(cookiePlugin);
      await probe.register(multipart, { limits: { fileSize: MULTIPART_CEILING_BYTES, files: 1 } });
      probe.post('/p', async (req) => {
        const original = (req as unknown as { parts: (o: unknown) => unknown }).parts;
        (req as unknown as { parts: (o: unknown) => unknown }).parts = function (o: unknown) {
          seen.push(o);
          return original.call(req, o);
        };
        const read = await readUploadPart(req, { maxBytes: MAX_ATTACHMENT_BYTES });
        return { ok: read.ok };
      });
      const { payload, headers } = form(one(4, 'image/png', 'a.png'));
      await probe.inject({ method: 'POST', url: '/p', headers, payload });
      await probe.close();
      expect(seen).toEqual([
        { limits: { fileSize: MAX_ATTACHMENT_BYTES, ...UPLOAD_PARSER_LIMITS } },
      ]);
    });

    it('also accepts application/json (the allowlist is shared) and still refuses a type outside it', async () => {
      expect((await post('/attachments', one(4, 'application/json'))).statusCode).toBe(201);
      expect((await post('/attachments', one(4, 'application/x-msdownload'))).statusCode).toBe(422);
    });
  });
});
