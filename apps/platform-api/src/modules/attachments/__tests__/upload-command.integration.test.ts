import { deleteRecoveryFixtureParents } from '../../../test-support/recovery-fixtures.js';
// uploadAttachmentCommand integration tests — issue #393.
//
// The POST /attachments mutation frame (transaction + advisory lock +
// idempotency lookup/replay/record) moved from the route into
// `attachmentsService.uploadAttachmentCommand`, mirroring the VOC application
// commands (#392). These tests call the COMMAND directly — no HTTP, so the
// mutation rate limit does not apply — with real db/audit/idempotency/voc-read
// services wired exactly like buildServer wires them, and a FAKE storage
// backend that records put/delete calls and can be told to fail.
//
// Harness mirrors voc/__tests__/voc-commands.integration.test.ts: a dedicated
// workspace + actor is created and torn down FK-safely, so the suite is
// hermetic against concurrent suites sharing the database.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE (migrate pool owns core.audit_log
// and core.idempotency_keys cleanup; platform_app cannot DELETE from audit_log).

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { buildEntityLinkProviders } from '../../../entity-link-providers.js';
import {
  type StorageBackend,
  type StorageGetResult,
  type StoragePutInput,
  StorageUnavailableError,
} from '../../../lib/storage/index.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createEntityLinksService } from '../../entity-links/service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createVocReadService } from '../../voc/read-service.js';
import { type AttachmentsService, createAttachmentsService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[upload-command] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

// ── fake storage ─────────────────────────────────────────────────────────
interface StorageCall {
  op: 'put' | 'delete' | 'get' | 'exists';
  key: string;
}

interface FakeStorage extends StorageBackend {
  calls: StorageCall[];
  /** Keys currently stored (put and not deleted). */
  live: Set<string>;
  putBehavior: 'ok' | 'throw-unavailable';
  /** #1266 b4: a failing best-effort delete must never change the command outcome. */
  deleteBehavior: 'ok' | 'throw-unavailable';
}

function createFakeStorage(): FakeStorage {
  const calls: StorageCall[] = [];
  const fake: FakeStorage = {
    calls,
    live: new Set<string>(),
    putBehavior: 'ok',
    deleteBehavior: 'ok',
    async put(input: StoragePutInput) {
      calls.push({ op: 'put', key: input.key });
      if (fake.putBehavior === 'throw-unavailable') {
        throw new StorageUnavailableError('fake storage offline');
      }
      fake.live.add(input.key);
      return { key: input.key };
    },
    async get(key: string): Promise<StorageGetResult> {
      calls.push({ op: 'get', key });
      throw new Error('get not used in upload-command tests');
    },
    async delete(key: string) {
      calls.push({ op: 'delete', key });
      if (fake.deleteBehavior === 'throw-unavailable') {
        throw new StorageUnavailableError('fake storage delete offline');
      }
      fake.live.delete(key);
    },
    async exists(key: string) {
      calls.push({ op: 'exists', key });
      return false;
    },
  };
  return fake;
}

describe.skipIf(!runIntegration)('uploadAttachmentCommand (#393)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let attachmentsService: AttachmentsService;
  let serviceDeps: Parameters<typeof createAttachmentsService>[0];
  let storage: FakeStorage;
  const workspaceId = randomUUID();
  let adminActorId = '';

  const BYTES = Buffer.from('upload-command-integration-bytes');
  const MIME = 'image/png';
  const FILENAME = 'cmd-upload.png';

  // Same hash inputs the route assembles for POST /attachments.
  function attachmentHash(filename: string, mimeType: string, sizeBytes: number): string {
    return hashRequestBody({
      route: 'attachment.create',
      filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    });
  }

  function commandArgs(overrides?: {
    actorId?: string;
    filename?: string;
    idempotencyKey?: string;
  }) {
    const filename = overrides?.filename ?? FILENAME;
    return {
      actor: { actor_id: overrides?.actorId ?? adminActorId, workspace_id: workspaceId },
      bytes: BYTES,
      mimeType: MIME,
      filename,
      idempotencyKey: overrides?.idempotencyKey ?? randomUUID(),
      requestHash: attachmentHash(filename, MIME, BYTES.byteLength),
    };
  }

  async function scalarCount(query: string, params: unknown[]): Promise<number> {
    const res = await dbHandle.pool.query<{ count: number }>(query, params);
    return res.rows[0]?.count ?? 0;
  }

  const attachmentRowCount = (uploadedBy: string) =>
    scalarCount(
      `select count(*)::int as count from voc.voc_attachments where uploaded_by_actor_id = $1`,
      [uploadedBy],
    );

  const idempotencyRowCount = (actorId: string, key: string) =>
    scalarCount(
      `select count(*)::int as count from core.idempotency_keys where actor_id = $1 and key = $2`,
      [actorId, key],
    );

  async function auditEventTypes(subjectId: string): Promise<string[]> {
    const res = await migrateHandle.pool.query<{ event_type: string }>(
      `select event_type from core.audit_log where subject_id = $1 and workspace_id = $2`,
      [subjectId, workspaceId],
    );
    return res.rows.map((r) => r.event_type);
  }

  const storagePuts = () => storage.calls.filter((c) => c.op === 'put');
  const storageDeletes = () => storage.calls.filter((c) => c.op === 'delete');

  async function cleanupDb() {
    // FK-safe order: audit + idempotency + attachment rows first (no inbound
    // FKs), then the seed rows.
    await migrateHandle.pool.query(`delete from core.audit_log where workspace_id = $1`, [
      workspaceId,
    ]);
    await migrateHandle.pool.query(`delete from core.idempotency_keys where actor_id = $1`, [
      adminActorId,
    ]);
    await dbHandle.pool.query(`delete from voc.voc_attachments where uploaded_by_actor_id = $1`, [
      adminActorId,
    ]);
  }

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    storage = createFakeStorage();
    const auditService = createAuditService();
    const checkService = createCheckService({ db: dbHandle.db });
    const idempotencyService = createIdempotencyService();
    const vocReadService = createVocReadService({
      db: dbHandle.db,
      checkService,
      entityLinksService: createEntityLinksService({
        db: dbHandle.db,
        checkService,
        auditService,
        providers: buildEntityLinkProviders(),
      }),
    });
    serviceDeps = {
      storage,
      auditService,
      db: dbHandle.db,
      idempotencyService,
      vocReadService,
    };
    attachmentsService = createAttachmentsService(serviceDeps);

    await migrateHandle.pool.query(`insert into core.workspaces (id, name) values ($1, $2)`, [
      workspaceId,
      'Upload Command Test Workspace',
    ]);
    const admin = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `upload-cmd-admin-${workspaceId}`,
        `upload-cmd-admin-${workspaceId}@local`,
        'Upload Cmd Admin',
      ],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor failed');
  });

  afterAll(async () => {
    if (migrateHandle) {
      await cleanupDb();
      await migrateHandle.pool.query(`delete from core.actors where workspace_id = $1`, [
        workspaceId,
      ]);
      await deleteRecoveryFixtureParents(
        migrateHandle,
        `delete from core.workspaces where id = $1`,
        [workspaceId],
      );
    }
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  beforeEach(async () => {
    await cleanupDb();
    storage.calls.length = 0;
    storage.live.clear();
    storage.putBehavior = 'ok';
    storage.deleteBehavior = 'ok';
  });

  it('(a) 201 → envelope, one voc_attachments row, one attachment_uploaded audit row, one storage put', async () => {
    const args = commandArgs();
    const first = await attachmentsService.uploadAttachmentCommand(args);

    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      name: FILENAME,
      size_bytes: BYTES.byteLength,
      mime_type: MIME,
      uploaded_by_actor_id: adminActorId,
      created_at: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(first.body.created_at))).toBe(true);

    expect(await attachmentRowCount(adminActorId)).toBe(1);
    expect(await auditEventTypes(first.body.id)).toEqual(['attachment_uploaded']);
    expect(await idempotencyRowCount(adminActorId, args.idempotencyKey)).toBe(1);

    const puts = storagePuts();
    expect(puts).toHaveLength(1);
    // storage_key = `{workspace_id}/{attachment_id}/{sanitized_filename}`.
    expect(puts[0]?.key).toBe(`${workspaceId}/${first.body.id}/${FILENAME}`);
  });

  it('(b) replay with same key+hash → identical result, one row, the extra object put before the lookup is deleted (#1266 b4)', async () => {
    const args = commandArgs();
    const first = await attachmentsService.uploadAttachmentCommand(args);
    expect(first.status).toBe(201);
    expect(first.replayed).toBe(false);

    const replay = await attachmentsService.uploadAttachmentCommand(args);
    expect(replay).toEqual({ ...first, replayed: true });

    expect(await attachmentRowCount(adminActorId)).toBe(1);
    expect(await auditEventTypes(first.body.id)).toEqual(['attachment_uploaded']);
    // Put-before-lookup: the replay wrote a second object, then removed it.
    expect(storagePuts()).toHaveLength(2);
    expect(storageDeletes()).toHaveLength(1);
    expect(storageDeletes()[0]?.key).toBe(storagePuts()[1]?.key);
    expect([...storage.live]).toEqual([`${workspaceId}/${first.body.id}/${FILENAME}`]);
  });

  it('(c) same key, different hash → conflict.idempotency_key_reuse, no extra row, the extra object is deleted (#1266 b4)', async () => {
    const key = randomUUID();
    const first = await attachmentsService.uploadAttachmentCommand(
      commandArgs({ idempotencyKey: key }),
    );
    expect(first.status).toBe(201);

    await expect(
      attachmentsService.uploadAttachmentCommand({
        ...commandArgs({ idempotencyKey: key }),
        // Route sends a different body → different hash over the same inputs.
        requestHash: attachmentHash('different.png', MIME, BYTES.byteLength),
      }),
    ).rejects.toMatchObject({ code: 'conflict.idempotency_key_reuse' });

    expect(await attachmentRowCount(adminActorId)).toBe(1);
    expect(storagePuts()).toHaveLength(2);
    expect(storageDeletes()).toHaveLength(1);
    expect(storage.live.size).toBe(1);
    expect([...storage.live]).toEqual([
      `${workspaceId}/${first.body.id}/${FILENAME}`,
    ]);
  });

  it('(d) storage put failure → storage.unavailable, no row, no idempotency record; retry succeeds once storage recovers', async () => {
    const args = commandArgs();

    storage.putBehavior = 'throw-unavailable';
    await expect(attachmentsService.uploadAttachmentCommand(args)).rejects.toMatchObject({
      code: 'storage.unavailable',
    });
    expect(await attachmentRowCount(adminActorId)).toBe(0);
    expect(await idempotencyRowCount(adminActorId, args.idempotencyKey)).toBe(0);
    // Cleanup is only contracted for INSERT failure — a failed put leaves
    // nothing behind, so no delete is attempted.
    expect(storageDeletes()).toHaveLength(0);

    storage.putBehavior = 'ok';
    const retry = await attachmentsService.uploadAttachmentCommand(args);
    expect(retry.status).toBe(201);
    // Both put ATTEMPTS recorded (first failed, second succeeded), one row.
    expect(storagePuts()).toHaveLength(2);
    expect(await attachmentRowCount(adminActorId)).toBe(1);
  });

  it('(e) DB INSERT failure → best-effort delete of the same key, original error rethrown, no row, no idempotency record', async () => {
    // Least-hacky way to force the INSERT to fail: an actor_id that is a
    // well-formed UUID but has no core.actors row → FK violation (23503) on
    // uploaded_by_actor_id. No schema trickery, no pre-seeded collision row.
    const ghostActorId = randomUUID();
    const key = randomUUID();
    const args = commandArgs({ actorId: ghostActorId, idempotencyKey: key });

    // The original pg error is rethrown as-is (no wrapping) — code 23503.
    await expect(attachmentsService.uploadAttachmentCommand(args)).rejects.toMatchObject({
      code: '23503',
    });

    const puts = storagePuts();
    const deletes = storageDeletes();
    expect(puts).toHaveLength(1);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.key).toBe(puts[0]?.key);

    expect(await attachmentRowCount(ghostActorId)).toBe(0);
    expect(await idempotencyRowCount(ghostActorId, key)).toBe(0);
  });

  it('(e2) failure at COMMIT (outcome unknown) → the object is kept and the error rethrown, never deleted', async () => {
    // The real transaction commits, then the call rejects as if the COMMIT acknowledgement was lost.
    const realDb = serviceDeps.db;
    const lostAckDb = new Proxy(realDb, {
      get(target, prop, receiver) {
        if (prop === 'transaction') {
          return async (...txArgs: Parameters<typeof realDb.transaction>) => {
            await target.transaction(...txArgs);
            throw new Error('connection terminated during COMMIT');
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const warnings: unknown[] = [];
    const lostAckService = createAttachmentsService({
      ...serviceDeps,
      db: lostAckDb,
      log: { warn: (...a: unknown[]) => void warnings.push(a) },
    });
    const args = commandArgs();

    await expect(lostAckService.uploadAttachmentCommand(args)).rejects.toThrow(/COMMIT/);

    // The row is durable, so its bytes must still exist.
    expect(await attachmentRowCount(adminActorId)).toBe(1);
    expect(storageDeletes()).toHaveLength(0);
    const puts = storagePuts();
    expect(puts).toHaveLength(1);
    expect(storage.live.has(puts[0]?.key ?? '')).toBe(true);
    expect(JSON.stringify(warnings)).not.toContain(FILENAME);
  });

  it('(f) holds the actor+key advisory lock: the command blocks while the lock is held elsewhere, then completes 201', async () => {
    const args = commandArgs();

    const holder = await migrateHandle.pool.connect();
    let command: Promise<unknown> | undefined;
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        adminActorId,
        args.idempotencyKey,
      ]);

      let settled = false;
      command = attachmentsService.uploadAttachmentCommand(args).finally(() => {
        settled = true;
      });

      // Wait until Postgres actually reports a session blocked on an advisory
      // lock (pg_locks, not granted) — proof the command reached the lock —
      // instead of trusting a fixed sleep. A frame without the lock never
      // shows up here and fails this poll.
      const deadline = Date.now() + 5000;
      let waiting = 0;
      while (Date.now() < deadline && waiting === 0) {
        const res = await migrateHandle.pool.query<{ n: number }>(
          "select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted",
        );
        waiting = res.rows[0]?.n ?? 0;
        if (waiting === 0) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting, 'command must be blocked on the advisory lock').toBeGreaterThan(0);
      // Still blocked after the lock wait is confirmed:
      expect(settled, 'command must wait for the advisory lock').toBe(false);
      // #1266 b4: the put runs BEFORE the transaction (and its lock wait).
      expect(storagePuts()).toHaveLength(1);

      await holder.query('commit');
      const result = (await command) as { status: number };
      expect(result.status).toBe(201);
      expect(await attachmentRowCount(adminActorId)).toBe(1);
      expect(storagePuts()).toHaveLength(1);
    } finally {
      await holder.query('rollback').catch(() => undefined);
      holder.release();
      await command?.catch(() => undefined);
    }
  });

  it('(g) 6-way race on same actor+key+hash: all fulfill identically, exactly one row and one surviving object (#1266 b4)', async () => {
    const key = randomUUID();
    const args = commandArgs({ idempotencyKey: key });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => attachmentsService.uploadAttachmentCommand(args)),
    );

    expect(results.map((r) => r.status)).toEqual(Array(6).fill('fulfilled'));
    const bodies = results.map(
      (r) => (r as PromiseFulfilledResult<{ status: number; body: unknown; replayed?: boolean }>).value,
    );
    for (const value of bodies) {
      expect(value.status).toBe(201);
      // `replayed` is the one field that differs: the winner is false, every racer that lost is true.
      expect({ ...value, replayed: undefined }).toEqual({ ...bodies[0], replayed: undefined });
    }
    expect(bodies.filter((value) => (value as { replayed?: boolean }).replayed === false)).toHaveLength(1);
    expect(await attachmentRowCount(adminActorId)).toBe(1);
    // Every racer put its own object; the five replays deleted theirs.
    expect(storagePuts()).toHaveLength(6);
    expect(storageDeletes()).toHaveLength(5);
    expect(storage.live.size).toBe(1);
    const firstBody = bodies[0]?.body as { id: string };
    expect([...storage.live]).toEqual([`${workspaceId}/${firstBody.id}/${FILENAME}`]);
  });

  it('(h) replay when the cleanup delete fails → same cached response, one row, failure swallowed (#1266 b4)', async () => {
    const args = commandArgs();
    const first = await attachmentsService.uploadAttachmentCommand(args);

    storage.deleteBehavior = 'throw-unavailable';
    const replay = await attachmentsService.uploadAttachmentCommand(args);

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await attachmentRowCount(adminActorId)).toBe(1);
    // The orphan stays in the bucket for the attachments-orphans inventory.
    expect(storage.live.size).toBe(2);
  });

  it('(i) conflict when the cleanup delete fails → conflict still surfaces, not the storage error (#1266 b4)', async () => {
    const key = randomUUID();
    await attachmentsService.uploadAttachmentCommand(commandArgs({ idempotencyKey: key }));
    storage.deleteBehavior = 'throw-unavailable';
    await expect(
      attachmentsService.uploadAttachmentCommand({
        ...commandArgs({ idempotencyKey: key }),
        requestHash: attachmentHash('different.png', MIME, BYTES.byteLength),
      }),
    ).rejects.toMatchObject({ code: 'conflict.idempotency_key_reuse' });
    expect(await attachmentRowCount(adminActorId)).toBe(1);
  });

  it('(j) holds no connection or open transaction while the storage put is in flight (#1266 b4)', async () => {
    let observed: Array<{ state: string | null; xact_start: Date | null }> = [];
    let checkedOut = -1;
    const originalPut = storage.put.bind(storage);
    storage.put = async (input: StoragePutInput) => {
      const activity = await migrateHandle.pool.query<{
        state: string | null;
        xact_start: Date | null;
      }>(
        `select state, xact_start from pg_stat_activity
          where datname = current_database()
            and usename = 'platform_app'
            and pid <> pg_backend_pid()`,
      );
      observed = activity.rows;
      checkedOut = dbHandle.pool.totalCount - dbHandle.pool.idleCount;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return originalPut(input);
    };
    try {
      const result = await attachmentsService.uploadAttachmentCommand(commandArgs());
      expect(result.status).toBe(201);
    } finally {
      storage.put = originalPut;
    }
    expect(checkedOut).toBe(0);
    expect(observed.filter((row) => row.state?.startsWith('idle in transaction'))).toEqual([]);
    expect(observed.filter((row) => row.xact_start !== null && row.state !== 'idle')).toEqual([]);
  });
});
