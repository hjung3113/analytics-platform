// #1266 b3: DB time budgets reach the HTTP surface as 503 and leave nothing behind.
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createIdempotencyService } from '../../modules/core/idempotency/idempotency-service.js';
import { runIdempotentCommand } from '../../modules/core/idempotency/idempotent-command.js';
import { registerHttpErrorHandler } from '../../lib/http-error-handler.js';
import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('DB time budgets over HTTP (#1266 b3)', () => {
  let budgeted: DbHandle;
  let admin: DbHandle;
  let app: FastifyInstance;
  let actorId: string;
  let budgetedPid: number;

  beforeAll(async () => {
    budgeted = createDb(APP_URL, {
      budgets: {
        poolMax: 1,
        acquireTimeoutMs: 2_000,
        statementTimeoutMs: 1_000,
        lockTimeoutMs: 200,
        idleInTransactionTimeoutMs: 30_000,
      },
    });
    admin = createDb(APP_URL);

    const actorRows = await admin.db.execute<{ id: string }>(sql`
      SELECT id FROM core.actors
      WHERE workspace_id = ${WORKSPACE_ID} AND external_id = 'mock-admin-1'
    `);
    actorId = (actorRows as unknown as { rows: { id: string }[] }).rows[0]?.id ?? '';
    expect(actorId).toBeTruthy();

    // poolMax is 1, so this is the only backend the budgeted pool ever owns.
    const pidRes = await budgeted.pool.query<{ pid: number }>('select pg_backend_pid() as pid');
    budgetedPid = pidRes.rows[0]?.pid ?? 0;

    app = Fastify();
    registerHttpErrorHandler(app);
    app.get('/slow', async () => {
      await budgeted.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_sleep(3)`);
      });
      return { ok: true };
    });
    app.post<{ Querystring: { key: string; target: string } }>('/command', async (req, reply) => {
      const result = await runIdempotentCommand({
        db: budgeted.db,
        idempotencyService: createIdempotencyService(),
        actorId,
        idempotencyKey: req.query.key,
        requestHash: 'b3-hash',
        status: 201,
        work: async (tx) => {
          await tx.execute(
            sql`DELETE FROM core.idempotency_keys WHERE actor_id = ${actorId} AND key = ${req.query.target}`,
          );
          return { done: true };
        },
      });
      return reply.code(result.status).send(result.body);
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await budgeted?.close();
    await admin?.close();
  });

  it('a statement over DB_STATEMENT_TIMEOUT_MS returns the 503 envelope and leaves no open transaction', async () => {
    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: '/slow' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      code: 'service.unavailable',
      message: 'service temporarily unavailable',
    });
    expect(Date.now() - started).toBeLessThan(2_500);

    const state = await admin.pool.query<{ state: string | null }>(
      'select state from pg_stat_activity where pid = $1',
      [budgetedPid],
    );
    expect(state.rows[0]?.state).not.toMatch(/^idle in transaction/);
  });

  it('a row lock held by another connection fails the write with 503 within lock_timeout and releases the idempotency claim', async () => {
    const target = randomUUID();
    const claimKey = randomUUID();
    await admin.db.execute(sql`
      INSERT INTO core.idempotency_keys (actor_id, key, request_hash, response_status, response_body)
      VALUES (${actorId}, ${target}, 'decoy', 200, '{}'::jsonb)
    `);
    const holder = await admin.pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM core.idempotency_keys WHERE actor_id = $1 AND key = $2 FOR UPDATE', [
        actorId,
        target,
      ]);

      const started = Date.now();
      const blocked = await app.inject({
        method: 'POST',
        url: `/command?key=${claimKey}&target=${target}`,
      });
      expect(blocked.statusCode).toBe(503);
      expect(blocked.json().code).toBe('service.unavailable');
      // Under the 1 s statement timeout: it was lock_timeout (200 ms) that fired.
      expect(Date.now() - started).toBeLessThan(900);

      const claims = await admin.pool.query(
        'select 1 from core.idempotency_keys where actor_id = $1 and key = $2',
        [actorId, claimKey],
      );
      expect(claims.rowCount).toBe(0);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }

    const retry = await app.inject({
      method: 'POST',
      url: `/command?key=${claimKey}&target=${target}`,
    });
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toEqual({ done: true });

    await admin.db.execute(
      sql`DELETE FROM core.idempotency_keys WHERE actor_id = ${actorId} AND key = ${claimKey}`,
    );
  });
});
