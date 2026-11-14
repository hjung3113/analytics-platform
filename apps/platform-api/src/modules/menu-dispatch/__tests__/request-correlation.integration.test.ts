import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../../log-knowledge/index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const TAG = `SYN2059${randomUUID().slice(0, 8)}`;

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE_ID)('request correlation and idempotency (SER-23)', () => {
  let app: FastifyInstance;
  let db: DbHandle;
  let migrate: DbHandle;
  let cookie: string;
  let csrf: string;
  let actorId: string;
  let roundId: string;

  const act = (action: string, input: Record<string, unknown>, key: string = randomUUID()) => app.inject({
    method: 'POST', url: '/api/v1/menu-action',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-csrf-token': csrf, 'x-correlation-id': TAG },
    payload: { action: `logLifecycle.${action}`, context: {}, input, idempotencyKey: key },
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    const actor = await insertActorRow(db, { workspaceId: WORKSPACE_ID, externalId: TAG, roleLevel: 'admin' });
    actorId = actor.id;
    cookie = await loginAs(app, TAG);
    csrf = (await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } })).json().csrfToken;
    const vendor = await migrate.pool.query('insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id', [WORKSPACE_ID, TAG, toCodeKey(TAG), actorId]);
    const model = await migrate.pool.query('insert into knowledge.equipment_model (workspace_id, code, code_key, name, vendor_id, created_by, updated_by) values ($1,$2,$3,$2,$4,$5,$5) returning id', [WORKSPACE_ID, TAG, toCodeKey(TAG), vendor.rows[0].id, actorId]);
    const project = await act('projectCreate', { modelId: model.rows[0].id, kind: 'new', ownerActorId: actorId });
    expect(project.json().outcome).toBe('ok');
    const round = await act('roundOpen', { projectId: project.json().data.projectId, sampleSet: { sourceOwner: TAG, files: [{ fileRef: `s3://${TAG}/synthetic.log`, order: 1, sha256: 'a'.repeat(64) }] } });
    expect(round.json().outcome).toBe('ok');
    roundId = round.json().data.roundId;
  }, 60_000);

  afterAll(async () => {
    if (migrate && actorId) {
      const sql = (text: string, values: unknown[]) => migrate.pool.query(text, values);
      const client = await migrate.pool.connect();
      try {
        await client.query('begin');
        await client.query('delete from log_lifecycle.execution_request where requested_by_actor_id = $1', [actorId]);
        await client.query('alter table log_lifecycle.development_event disable trigger development_event_append_only');
        await client.query('delete from log_lifecycle.development_event where actor_id = $1', [actorId]);
        await client.query('alter table log_lifecycle.development_event enable trigger development_event_append_only');
        await client.query('delete from log_lifecycle.validation_round where created_by = $1', [actorId]);
        await client.query('delete from log_lifecycle.development_project where created_by = $1', [actorId]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      for (const table of ['equipment_model', 'vendor']) await sql(`delete from knowledge.${table} where workspace_id = $1 and created_by = $2`, [WORKSPACE_ID, actorId]);
      for (const [table, column] of [['core.idempotency_keys', 'actor_id'], ['core.audit_log', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) {
        await sql(`delete from ${table} where ${column} = $1`, [actorId]);
      }
    }
    await app?.close();
    await db?.close();
    await migrate?.close();
  });

  it('stores distinct normalized dispatcher keys under one correlation ID and replays each request', async () => {
    const keys = [randomUUID(), randomUUID()];
    const ids: string[] = [];
    for (const key of keys) {
      const response = await act('requestCreate', { roundId, priority: 1 }, key.toUpperCase());
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ outcome: 'ok', correlationId: TAG });
      const id = response.json().data.requestId as string;
      ids.push(id);
      const replay = await act('requestCreate', { roundId, priority: 1 }, key);
      expect(replay.json()).toMatchObject({ outcome: 'ok', data: { requestId: id } });
    }
    expect(new Set(ids).size).toBe(2);
    const rows = await migrate.pool.query('select idempotency_key from log_lifecycle.execution_request where workspace_id = $1 and requested_by_actor_id = $2 order by idempotency_key', [WORKSPACE_ID, actorId]);
    expect(rows.rows.map((row: { idempotency_key: string }) => row.idempotency_key)).toEqual([...keys].sort());
  });
});
