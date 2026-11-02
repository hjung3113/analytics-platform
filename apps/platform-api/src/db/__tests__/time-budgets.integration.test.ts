// #1266 b3: DB time budgets reach the HTTP surface as 503 `service.unavailable`, leave nothing behind, and a
// checked-out client killed by the server never takes the process down. Real Postgres through the actual
// `buildServer` (apps/platform-api/AGENTS.md): a feature command route (`POST /vocs/:id/no-follow-up`) and a
// platform menu-query route (`POST /api/v1/menu-query`, `home.notices`). Throwaway DB only; run through
// `pnpm --filter @ap/platform-api test:integration`.
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';

import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../config.js';
import { dbTimeoutKind } from '../../lib/db-timeout.js';
import { recoveryIdentity } from '../../modules/dashboard/identity.js';
import { buildServer } from '../../server.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../test-support/auth.js';
import { insertMsDirectly } from '../../test-support/core-fixtures.js';
import { uid } from '../../test-support/ids.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../test-support/voc-fixtures.js';
import { type DbHandle, type DbTimeBudgets, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-1266b3');

const ENVELOPE = { code: 'service.unavailable', message: 'service temporarily unavailable' };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Budgets with only the one under test finite; `0` leaves the server default (disabled). */
const budgets = (over: Partial<DbTimeBudgets>): DbTimeBudgets => ({
  poolMax: 4,
  acquireTimeoutMs: 2_000,
  statementTimeoutMs: 0,
  lockTimeoutMs: 0,
  idleInTransactionTimeoutMs: 0,
  ...over,
});

interface Harness {
  handle: DbHandle;
  app: FastifyInstance;
  logs: () => Array<Record<string, unknown>>;
}

async function boot(b: DbTimeBudgets): Promise<Harness> {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const handle = createDb(APP_URL, { budgets: b });
  const app = await buildServer({
    config: loadConfig(),
    dbHandle: handle,
    logger: pino({ level: 'warn' }, sink),
  });
  await app.ready();
  return {
    handle,
    app,
    logs: () =>
      lines.flatMap((l) =>
        l
          .split('\n')
          .filter(Boolean)
          .map((x) => JSON.parse(x) as Record<string, unknown>),
      ),
  };
}

describe.skipIf(!runIntegration)('DB time budgets over HTTP (#1266 b3)', () => {
  let migrate: DbHandle;
  let statementApp: Harness; // statement_timeout 400 ms, lock_timeout off
  let lockApp: Harness; // lock_timeout 300 ms, statement_timeout 5 s
  let adminId: string;
  let reporterId: string;
  let msId: string;
  let cookie: string;
  const identityRows: string[] = [];
  const holders: PoolClient[] = [];

  const headers = (key: string) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'idempotency-key': key,
  });
  const noFollowUp = (app: FastifyInstance, vocId: string, key: string) =>
    app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/no-follow-up`,
      headers: headers(key),
      payload: { reason: '시간 예산 테스트' },
    });
  const menuQuery = (app: FastifyInstance) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      payload: JSON.stringify({
        endpoint: 'home.notices',
        context: {},
        params: { targetScopeId: null },
      }),
    });
  const count = async (text: string, params: unknown[]) =>
    Number((await migrate.pool.query(text, params)).rows[0]?.n ?? 0);
  const decisionCount = (vocId: string) =>
    count('select count(*)::int as n from voc.no_follow_up_decisions where voc_id = $1', [vocId]);
  const auditCount = (vocId: string) =>
    count(
      "select count(*)::int as n from core.audit_log where subject_id = $1 and event_type = 'voc_no_follow_up_recorded'",
      [vocId],
    );
  const claimCount = (key: string) =>
    count('select count(*)::int as n from core.idempotency_keys where actor_id = $1 and key = $2', [
      adminId,
      key,
    ]);

  /**
   * A VOC whose command does real writes (decision row, audit row) and only then reaches a row lock held by an
   * independent connection: the recovery identity row that `recoveryRecorder.finish` updates `FOR UPDATE`.
   */
  async function seedBlockedVoc() {
    const voc = await insertVocDirectly(migrate, WORKSPACE_ID, msId, reporterId, uid('blocked'), {
      severity: 'high',
    });
    const token = recoveryIdentity('high-severity-unlinked', voc.id);
    await migrate.pool.query(
      `insert into dashboard.recovery_identities
         (workspace_id, recovery_item_id, category, source_id, managed_system_id, occurrence, state)
       values ($1, $2, 'high-severity-unlinked', $3, $4, 1, 'active')`,
      [WORKSPACE_ID, token, voc.id, msId],
    );
    identityRows.push(token);
    const holder = await migrate.pool.connect();
    holders.push(holder);
    await holder.query('BEGIN');
    await holder.query(
      'select 1 from dashboard.recovery_identities where workspace_id = $1 and recovery_item_id = $2 for update',
      [WORKSPACE_ID, token],
    );
    const release = async () => {
      await holder.query('ROLLBACK');
      holder.release();
      holders.splice(holders.indexOf(holder), 1);
    };
    return { vocId: voc.id, release };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    migrate = createDb(MIGRATE_URL);
    statementApp = await boot(budgets({ statementTimeoutMs: 400 }));
    lockApp = await boot(budgets({ lockTimeoutMs: 300, statementTimeoutMs: 5_000 }));
    const actors = await migrate.pool.query<{ id: string; external_id: string }>(
      "select id, external_id from core.actors where workspace_id = $1 and external_id in ('mock-admin-1', 'mock-user-1')",
      [WORKSPACE_ID],
    );
    adminId = actors.rows.find((a) => a.external_id === 'mock-admin-1')?.id ?? '';
    reporterId = actors.rows.find((a) => a.external_id === 'mock-user-1')?.id ?? '';
    expect(adminId).toBeTruthy();
    expect(reporterId).toBeTruthy();
    msId = await insertMsDirectly(migrate, WORKSPACE_ID, uid(PREFIX), 'time budgets test');
    cookie = await loginAs(lockApp.app, 'mock-admin-1');
    await migrate.pool.query('delete from core.rate_limits where key = $1', [
      `${WORKSPACE_ID}:${adminId}`,
    ]);
  });

  afterAll(async () => {
    for (const holder of holders) {
      await holder.query('ROLLBACK').catch(() => undefined);
      holder.release();
    }
    if (migrate) {
      await migrate.pool.query(
        'delete from dashboard.recovery_identities where workspace_id = $1 and recovery_item_id = any($2)',
        [WORKSPACE_ID, identityRows],
      );
      await migrate.pool.query(
        'delete from voc.no_follow_up_decisions where voc_id in (select id from voc.vocs where primary_managed_system_id = $1)',
        [msId],
      );
      await cleanupReadTestTables(migrate, WORKSPACE_ID, PREFIX);
    }
    await statementApp?.app.close();
    await lockApp?.app.close();
    await statementApp?.handle.close();
    await lockApp?.handle.close();
    await migrate?.close();
  });

  it('a feature command over DB_STATEMENT_TIMEOUT_MS returns the 503 envelope and rolls back its earlier writes', async () => {
    const { vocId, release } = await seedBlockedVoc();
    const key = randomUUID();
    try {
      const started = Date.now();
      const res = await noFollowUp(statementApp.app, vocId, key);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual(ENVELOPE);
      expect(Date.now() - started).toBeLessThan(3_000);
      // The decision and audit rows were written before the blocked statement: both rolled back.
      expect(await decisionCount(vocId)).toBe(0);
      expect(await auditCount(vocId)).toBe(0);
      expect(await claimCount(key)).toBe(0);
      expect(statementApp.logs().some((l) => l.kind === 'statement')).toBe(true);
      expect(statementApp.logs().some((l) => l.kind === 'lock')).toBe(false);
    } finally {
      await release();
    }
    const retry = await noFollowUp(statementApp.app, vocId, key);
    expect(retry.statusCode).toBe(200);
    expect(await decisionCount(vocId)).toBe(1);
  });

  it('a row lock held by another connection fails the command within lock_timeout, releases the claim and the same key retries', async () => {
    const { vocId, release } = await seedBlockedVoc();
    const key = randomUUID();
    try {
      const started = Date.now();
      const res = await noFollowUp(lockApp.app, vocId, key);
      const elapsed = Date.now() - started;
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual(ENVELOPE);
      // lock_timeout (300 ms) fired, not the 5 s statement budget.
      expect(elapsed).toBeLessThan(2_500);
      expect(lockApp.logs().some((l) => l.kind === 'lock' && l.sqlstate === '55P03')).toBe(true);
      expect(lockApp.logs().some((l) => l.kind === 'statement')).toBe(false);
      expect(await decisionCount(vocId)).toBe(0);
      expect(await auditCount(vocId)).toBe(0);
      expect(await claimCount(key)).toBe(0);
    } finally {
      await release();
    }
    // Same key after the competing connection released its lock: not stuck behind a stale claim.
    const retry = await noFollowUp(lockApp.app, vocId, key);
    expect(retry.statusCode).toBe(200);
    expect(await decisionCount(vocId)).toBe(1);
    expect(await auditCount(vocId)).toBe(1);
    expect(await claimCount(key)).toBe(1);
    await migrate.pool.query('delete from core.idempotency_keys where actor_id = $1 and key = $2', [
      adminId,
      key,
    ]);
  });

  it('a platform menu-query blocked on a table lock returns the 503 envelope and the route recovers', async () => {
    const holder = await migrate.pool.connect();
    holders.push(holder);
    await holder.query('BEGIN');
    await holder.query('LOCK TABLE platform.notices IN ACCESS EXCLUSIVE MODE');
    try {
      const res = await menuQuery(lockApp.app);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual(ENVELOPE);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
      holders.splice(holders.indexOf(holder), 1);
    }
    const after = await menuQuery(lockApp.app);
    expect(after.statusCode).toBe(200);
    expect(['ok', 'empty']).toContain(after.json<{ outcome: string }>().outcome);
  });
});

describe.skipIf(!runIntegration)('a checked-out client killed by the server (#1266 b3 F1)', () => {
  it('idle-in-transaction expiry during non-DB work neither crashes the process nor poisons the pool', async () => {
    const uncaught = vi.fn();
    process.on('uncaughtException', uncaught);
    const reported: Array<{ code?: unknown }> = [];
    const handle = createDb(APP_URL, {
      budgets: budgets({ idleInTransactionTimeoutMs: 300, poolMax: 2 }),
      onPoolError: (err) => reported.push(err as { code?: unknown }),
    });
    try {
      let failure: unknown;
      try {
        await handle.db.transaction(async (tx) => {
          await tx.execute(sql`select 1`);
          await sleep(1_200); // non-DB work (e.g. SMTP) while the transaction sits idle
          await tx.execute(sql`select 2`);
        });
      } catch (err) {
        failure = err;
      }
      await sleep(100); // let any stray 'error' event surface
      expect(uncaught).not.toHaveBeenCalled();
      expect(failure).toBeInstanceOf(Error);
      expect(dbTimeoutKind(failure)).not.toBeNull();
      // The original termination reason was reported, sanitized by the caller's logger.
      expect(reported.map((e) => e.code)).toContain('25P03');
      // The dead client was discarded: a fresh query on the same pool works.
      const fresh = await handle.db.execute<{ ok: number }>(sql`select 1 as ok`);
      expect(fresh.rows[0]?.ok).toBe(1);
      expect(handle.pool.totalCount).toBeLessThanOrEqual(2);
    } finally {
      process.off('uncaughtException', uncaught);
      await handle.close();
    }
  });
});
