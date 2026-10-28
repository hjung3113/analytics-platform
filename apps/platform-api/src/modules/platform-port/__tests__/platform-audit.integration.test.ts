// #621 — platform port audit reads: `auditTrail` + `entityAudit` over the allowlisted
// `core.platform_audit_events` projection (ADR-0069 decisions 6, 7, 9). Route-level against a
// real Postgres (throwaway DB only, apps/platform-api/AGENTS.md → Verification). Needs migration 0074.
// Every query filters on the seeded actor's external_id, so rows other suites leave in the shared
// workspace never enter an assertion.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-platform-audit');

type Role = 'admin' | 'developer' | 'user';
type Envelope = {
  outcome: string;
  data: {
    items?: Array<Record<string, unknown>>;
    total?: number;
    events?: Array<{ id: string }>;
    nextCursor?: string | null;
  } | null;
  assessments: unknown[];
  trust: unknown;
  correlationId: string;
  message?: string;
};

const T0 = Date.parse('2026-03-01T00:00:00.000Z');
const at = (hours: number) => new Date(T0 + hours * 3_600_000).toISOString();

describe.skipIf(!runIntegration)('platform port audit reads (#621)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  const vocIds: string[] = [];
  let msId = '';
  let n = 0;

  let adminCookie = '';
  let seedExternal = '';
  let systemExternal = '';
  let seedActorId = '';
  let readerCookie = '';
  let strangerCookie = '';
  let developerCookie = '';
  let userCookie = '';
  let vocWithEvents = '';
  let vocWithoutEvents = '';
  let vocPaged = '';
  let vocTie = '';
  let pagedOrder: string[] = [];
  let tieOrder: string[] = [];
  const seeded: Record<string, string> = {};
  const excludedSurveyResponseId = randomUUID();
  const excludedOutsideId = randomUUID();

  const post = (path: string, payload: unknown, cookie?: string) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/platform${path}`,
      headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {},
      payload: payload as object,
    });
  const search = async (query: Record<string, unknown>, cookie = adminCookie) => {
    const res = await post('/audit-trail/search', query, cookie);
    expect(res.statusCode).toBe(200);
    return res.json<Envelope>();
  };
  const mine = (extra: Record<string, unknown> = {}) => search({ actor: seedExternal, ...extra });
  const entityAudit = async (ref: unknown, cookie: string) => {
    const res = await post('/entity/audit', ref, cookie);
    expect(res.statusCode).toBe(200);
    return res.json<Envelope>();
  };

  async function newActor(roleLevel: Role) {
    const externalId = `${PREFIX}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      displayName: `Audit ${roleLevel}`,
      roleLevel,
    });
    actorIds.push(id);
    return { id, externalId, cookie: await loginAs(app, externalId) };
  }

  async function seedAudit(
    key: string,
    row: {
      actorId?: string;
      eventType: string;
      subjectType: string;
      subjectId?: string;
      hours: number;
      detail?: Record<string, unknown>;
      id?: string;
      /** Raw timestamptz text (microseconds); replaces `hours`. */
      createdAt?: string;
    },
  ) {
    const res = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.audit_log
         (id, workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail, created_at)
       values (coalesce($8::uuid, gen_random_uuid()), $1, $2, $3, $4, $5, 'secret summary', $6::jsonb, $7::timestamptz)
       returning id`,
      [
        WORKSPACE_ID,
        row.actorId ?? seedActorId,
        row.eventType,
        row.subjectType,
        row.subjectId ?? randomUUID(),
        JSON.stringify({ reason: 'secret reason', ...row.detail }),
        row.createdAt ?? at(row.hours),
        row.id ?? null,
      ],
    );
    const id = res.rows[0]?.id as string;
    seeded[key] = id;
    return id;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = (await newActor('admin')).cookie;
    const seedActor = await newActor('user');
    seedActorId = seedActor.id;
    seedExternal = seedActor.externalId;
    userCookie = (await newActor('user')).cookie;
    developerCookie = (await newActor('developer')).cookie;
    const reader = await newActor('user');
    readerCookie = reader.cookie;
    strangerCookie = (await newActor('user')).cookie;

    systemExternal = `${PREFIX}-system`;
    const sys = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, 'Audit system', 'user', 'system') returning id`,
      [WORKSPACE_ID, systemExternal, `${systemExternal}@local`],
    );
    const systemActorId = sys.rows[0]?.id as string;
    actorIds.push(systemActorId);

    msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-ms`, 'Audit MS');
    vocWithEvents = (await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reader.id, 'audit voc'))
      .id;
    vocWithoutEvents = (
      await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reader.id, 'quiet voc')
    ).id;
    vocPaged = (await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reader.id, 'paged voc')).id;
    vocTie = (await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, reader.id, 'tie voc')).id;
    vocIds.push(vocWithEvents, vocWithoutEvents, vocPaged, vocTie);

    // Visible rows (seed actor): A, B and E share B's instant to pin the id tie-break.
    await seedAudit('A', {
      eventType: 'voc_created',
      subjectType: 'voc',
      subjectId: vocWithEvents,
      hours: 1,
    });
    await seedAudit('B', {
      eventType: 'voc_triage_committed',
      subjectType: 'voc',
      subjectId: vocWithEvents,
      hours: 2,
    });
    await seedAudit('E', {
      eventType: 'task_status_changed',
      subjectType: 'task',
      hours: 2,
    });
    await seedAudit('C', {
      eventType: 'voc_cluster_member_removed',
      subjectType: 'voc_cluster',
      hours: 3,
    });
    await seedAudit('D', {
      eventType: 'managed_system_archived',
      subjectType: 'managed_system',
      subjectId: msId,
      hours: 4,
    });
    await seedAudit('S', {
      actorId: systemActorId,
      eventType: 'voc_cluster_suggestion_confirmed',
      subjectType: 'voc_cluster_suggestion',
      hours: 5,
    });
    // Paged VOCs get their own audit actor so auditTrail's exact pins (seed and system actors) never see them.
    const pagedActorId = (await newActor('user')).id;
    const pagedRows: Array<{ id: string; hours: number }> = [];
    const hoursFor = [...Array.from({ length: 48 }, (_, i) => 10 + i), 5, 5, 5, 1, 2];
    for (const hours of hoursFor) {
      const id = await seedAudit(`p${pagedRows.length}`, {
        actorId: pagedActorId,
        id: randomUUID(),
        eventType: 'voc_created',
        subjectType: 'voc',
        subjectId: vocPaged,
        hours,
      });
      pagedRows.push({ id, hours });
    }
    pagedOrder = pagedRows
      .sort((a, b) => b.hours - a.hours || (a.id < b.id ? -1 : 1))
      .map((r) => r.id);
    // Same millisecond, different microseconds: the larger id is the later one, yet sorts second.
    const [small, large] = [randomUUID(), randomUUID()].sort() as [string, string];
    await seedAudit('t1', {
      actorId: pagedActorId,
      id: large,
      eventType: 'voc_created',
      subjectType: 'voc',
      subjectId: vocTie,
      hours: 0,
      createdAt: '2026-03-02T00:00:00.000900Z',
    });
    await seedAudit('t2', {
      actorId: pagedActorId,
      id: small,
      eventType: 'voc_created',
      subjectType: 'voc',
      subjectId: vocTie,
      hours: 0,
      createdAt: '2026-03-02T00:00:00.000100Z',
    });
    tieOrder = [small, large];

    // Excluded rows of the seed actor: they must be in neither items nor total.
    await seedAudit('x1', {
      eventType: 'survey_response_submitted',
      subjectType: 'survey_response',
      hours: 6,
    });
    await seedAudit('x2', {
      eventType: 'survey_response_excerpt_approved',
      subjectType: 'survey_response_excerpt_approval',
      hours: 6,
    });
    await seedAudit('x3', {
      eventType: 'survey_response_personal_read',
      subjectType: 'survey',
      hours: 6,
    });
    // #1091: released event + non-sensitive detail, so ONLY the SQL subject-type allowlist keeps these two hidden.
    await seedAudit('x5', {
      eventType: 'voc_created',
      subjectType: 'survey_response',
      subjectId: excludedSurveyResponseId,
      hours: 6,
    });
    await seedAudit('x6', {
      eventType: 'voc_created',
      subjectType: 'outside_allowlist',
      subjectId: excludedOutsideId,
      hours: 6,
    });
    await seedAudit('x4', {
      eventType: 'permission_needs_more_info',
      subjectType: 'permission_request',
      hours: 6,
      detail: { sensitive: true },
    });
  });

  afterAll(async () => {
    if (actorIds.length > 0) {
      await migrateHandle.pool.query('delete from core.audit_log where actor_id = any($1)', [
        actorIds,
      ]);
    }
    if (vocIds.length > 0) {
      await migrateHandle.pool.query('delete from voc.vocs where id = any($1)', [vocIds]);
    }
    if (actorIds.length > 0) {
      await migrateHandle.pool.query('delete from core.sessions where actor_id = any($1)', [
        actorIds,
      ]);
      await migrateHandle.pool.query('delete from core.actors where id = any($1)', [actorIds]);
    }
    if (msId)
      await migrateHandle.pool.query('delete from core.managed_systems where id = $1', [msId]);
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  const idsOf = (body: Envelope) => (body.data?.items ?? []).map((i) => i.id);
  const byIdAsc = (...keys: string[]) => keys.map((k) => seeded[k] as string).sort();

  describe('auditTrail', () => {
    it('401 without a session cookie', async () => {
      const res = await post('/audit-trail/search', {});
      expect(res.statusCode).toBe(401);
    });

    it.each(['user', 'developer'] as const)(
      '%s without workspace.admin → 200 forbidden',
      async (role) => {
        const body = await search({}, role === 'user' ? userCookie : developerCookie);
        expect(body).toMatchObject({
          outcome: 'forbidden',
          data: null,
          assessments: [],
          trust: null,
        });
      },
    );

    it('admin → ok with exact AuditEvent objects, no-store, correlationId = response header', async () => {
      const res = await post('/audit-trail/search', { actor: systemExternal }, adminCookie);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.json<Envelope>();
      expect(body.correlationId).toBe(res.headers['x-correlation-id']);
      expect(body).toMatchObject({
        outcome: 'ok',
        assessments: [],
        trust: null,
      });
      expect(body.data).toEqual({
        total: 1,
        items: [
          {
            id: seeded.S,
            at: at(5),
            actor: systemExternal,
            action: 'update',
            source: 'system',
            target: {
              type: 'voc_cluster_suggestion',
              id: expect.any(String),
              scopeId: null,
            },
          },
        ],
      });
      expect(res.body).not.toMatch(/secret|summary|detail|changes|reason/);
    });

    it('never lists survey_response rows, survey_response_* events or sensitive rows — items or total', async () => {
      const body = await mine({ pageSize: 100 });
      expect(body.data?.total).toBe(5);
      const ids = idsOf(body);
      for (const key of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'])
        expect(ids).not.toContain(seeded[key]);
      expect(ids).toHaveLength(5);
    });

    it('default sort is at desc with id ascending on a tie', async () => {
      const body = await mine();
      expect(idsOf(body)).toEqual([seeded.D, seeded.C, ...byIdAsc('B', 'E'), seeded.A]);
    });

    it('explicit sort: at asc, targetType asc, action desc', async () => {
      expect(idsOf(await mine({ sort: { field: 'at', desc: false } }))).toEqual([
        seeded.A,
        ...byIdAsc('B', 'E'),
        seeded.C,
        seeded.D,
      ]);
      // managed_system, task, voc (A,B by id), voc_cluster
      expect(idsOf(await mine({ sort: { field: 'targetType', desc: false } }))).toEqual([
        seeded.D,
        seeded.E,
        ...byIdAsc('A', 'B'),
        seeded.C,
      ]);
      // update (B,E by id), retire D, delete C, create A — desc by action name: update, retire, delete, create
      expect(idsOf(await mine({ sort: { field: 'action', desc: true } }))).toEqual([
        ...byIdAsc('B', 'E'),
        seeded.D,
        seeded.C,
        seeded.A,
      ]);
    });

    it.each([
      ['type', { type: 'voc' }, ['A', 'B']],
      ['type + targetId', { type: 'managed_system', targetId: '$MS' }, ['D']],
      ['action', { action: 'create' }, ['A']],
      ['action delete', { action: 'delete' }, ['C']],
      ['source user', { source: 'user' }, ['A', 'B', 'C', 'D', 'E']],
      ['fromAt inclusive', { fromAt: at(2) }, ['B', 'C', 'D', 'E']],
      ['toAt exclusive', { toAt: at(2) }, ['A']],
      ['fromAt + toAt half-open', { fromAt: at(2), toAt: at(3) }, ['B', 'E']],
    ])('filter %s narrows correctly', async (_name, query, keys) => {
      const resolved = JSON.parse(JSON.stringify(query).replace('$MS', msId));
      const body = await mine({ ...resolved, pageSize: 100 });
      expect(idsOf(body).sort()).toEqual(byIdAsc(...keys));
      expect(body.data?.total).toBe(keys.length);
    });

    it('source system selects the system actor only; actor matches exactly', async () => {
      const system = await search({ actor: systemExternal, source: 'system' });
      expect(idsOf(system)).toEqual([seeded.S]);
      expect((await search({ actor: systemExternal, source: 'user' })).outcome).toBe('empty');
      expect((await search({ actor: seedExternal.toUpperCase() })).outcome).toBe('empty');
    });

    it('paginates; a page past the end is ok with [] and the true total', async () => {
      const first = await mine({ page: 1, pageSize: 2 });
      expect(idsOf(first)).toEqual([seeded.D, seeded.C]);
      expect(first.data?.total).toBe(5);
      const last = await mine({ page: 3, pageSize: 2 });
      expect(idsOf(last)).toEqual([seeded.A]);
      const past = await mine({ page: 9, pageSize: 2 });
      expect(past).toMatchObject({
        outcome: 'ok',
        data: { items: [], total: 5 },
      });
    });

    it.each([
      ['page past SQL integer offset, pageSize 1', { page: 2147483649, pageSize: 1 }],
      ['page past SQL integer offset, pageSize 100', { page: 2147483649, pageSize: 100 }],
      ['largest safe page, pageSize 100', { page: Number.MAX_SAFE_INTEGER, pageSize: 100 }],
    ])(
      'a far page (%s) is ok with [] and the true total — no 500, no reset to page 1',
      async (_name, paging) => {
        expect(await mine(paging)).toMatchObject({
          outcome: 'ok',
          data: { items: [], total: 5 },
        });
      },
    );

    it('no match → empty with null data; a non-uuid targetId matches nothing (not an error)', async () => {
      expect(await search({ actor: `${PREFIX}-nobody` })).toMatchObject({
        outcome: 'empty',
        data: null,
      });
      expect(await mine({ type: 'voc', targetId: 'not-a-uuid' })).toMatchObject({
        outcome: 'empty',
        data: null,
      });
    });

    it.each([
      ['targetId without type', { targetId: 'abc' }],
      ['pageSize 101', { pageSize: 101 }],
      ['pageSize 0', { pageSize: 0 }],
      ['page 0', { page: 0 }],
      ['page fractional', { page: 1.5 }],
      ['page beyond the safe integer range', { page: 2 ** 53 }],
      ['unknown key', { nope: 1 }],
      ['bad action', { action: 'explode' }],
      ['bad source', { source: 'robot' }],
      ['type with a leading digit', { type: '1voc' }],
      ['empty type', { type: '' }],
      ['type with a space', { type: 'voc x' }],
      ['type with &', { type: 'voc&x' }],
      ['type with #', { type: 'voc#x' }],
      ['type over 80 chars', { type: 'a'.repeat(81) }],
      ['non-string type', { type: 5 }],
      ['empty actor', { actor: '' }],
      ['actor with whitespace', { actor: 'a b' }],
      ['actor with ?', { actor: 'a?b' }],
      ['actor over 80 chars', { actor: 'a'.repeat(81) }],
      ['targetId with &', { type: 'voc', targetId: 'a&b' }],
      ['non-string actor', { actor: 5 }],
      ['sort extra key', { sort: { field: 'at', desc: true, x: 1 } }],
      ['sort bad field', { sort: { field: 'id', desc: true } }],
      ['sort non-boolean desc', { sort: { field: 'at', desc: 'yes' } }],
      ['naive fromAt', { fromAt: '2026-03-01T00:00:00' }],
      ['unparsable toAt', { toAt: 'yesterday' }],
      ['impossible date', { fromAt: '2026-02-30T00:00:00Z' }],
      ['fromAt after toAt', { fromAt: at(3), toAt: at(2) }],
      ['fromAt equals toAt', { fromAt: at(3), toAt: at(3) }],
      ['array body', []],
    ])('malformed query (%s) → 200 error envelope', async (_name, query) => {
      const body = await search(query as Record<string, unknown>);
      expect(body).toMatchObject({
        outcome: 'error',
        data: null,
        message: expect.any(String),
      });
      expect(body.message).not.toMatch(/select|uuid|sql/i);
    });

    it('a well-formed unknown type is the normal empty answer (data null), never an error', async () => {
      for (const query of [
        { type: 'equipment' },
        { type: 'Future.Type:v2' },
        { type: 'equipment', targetId: randomUUID() },
      ]) {
        expect(await mine(query)).toMatchObject({
          outcome: 'empty',
          data: null,
        });
      }
    });

    // The rows exist with released event types and non-sensitive detail: only the SQL subject-type allowlist hides them,
    // so each answer must equal a never-used type (no existence oracle) and the parser must not be what hides them.
    it.each([
      ['survey_response', () => excludedSurveyResponseId],
      ['outside_allowlist', () => excludedOutsideId],
    ])('seeded excluded subject type %s answers like a never-used type', async (type, id) => {
      const never = await mine({ type: 'never_used_type' });
      expect(never).toMatchObject({ outcome: 'empty', data: null });
      for (const query of [{ type }, { type, targetId: id() }, { type, page: 2 }]) {
        const body = await mine(query);
        expect(body).toMatchObject({
          outcome: never.outcome,
          data: never.data,
        });
        expect(body.message).toBe(never.message);
        expect(JSON.stringify(body)).not.toContain(id());
      }
    });

    it('a known type returns exact identities; permission still precedes validation for unknown types', async () => {
      expect(idsOf(await mine({ type: 'voc', pageSize: 100 })).sort()).toEqual(byIdAsc('A', 'B'));
      expect(idsOf(await mine({ type: 'managed_system', targetId: msId }))).toEqual([seeded.D]);
      expect((await search({ type: 'Future.Type:v2' }, userCookie)).outcome).toBe('forbidden');
      expect((await search({ type: '1bad' }, userCookie)).outcome).toBe('forbidden');
    });

    it('invalid JSON → 200 error envelope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/audit-trail/search',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'content-type': 'application/json',
        },
        payload: '{not json',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Envelope>().outcome).toBe('error');
    });

    it('permission is judged before validation: a non-admin with a bad query gets forbidden', async () => {
      expect((await search({ pageSize: 999 }, userCookie)).outcome).toBe('forbidden');
    });
  });

  describe('entityAudit', () => {
    it('401 without a session cookie', async () => {
      expect(
        (
          await post('/entity/audit', {
            type: 'voc',
            id: vocWithEvents,
            scopeId: null,
          })
        ).statusCode,
      ).toBe(401);
    });

    it.each([
      ['admin', () => adminCookie],
      ['the reporter who can read the VOC', () => readerCookie],
    ])('%s gets the VOC events, newest first, as exact AuditEvents', async (_who, cookie) => {
      const res = await post(
        '/entity/audit',
        { type: 'voc', id: vocWithEvents, scopeId: null },
        cookie(),
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.json<Envelope>();
      expect(body.correlationId).toBe(res.headers['x-correlation-id']);
      expect(body.outcome).toBe('ok');
      expect(body.data).toEqual({
        events: [
          {
            id: seeded.B,
            at: at(2),
            actor: seedExternal,
            action: 'update',
            source: 'user',
            target: { type: 'voc', id: vocWithEvents, scopeId: null },
          },
          {
            id: seeded.A,
            at: at(1),
            actor: seedExternal,
            action: 'create',
            source: 'user',
            target: { type: 'voc', id: vocWithEvents, scopeId: null },
          },
        ],
        nextCursor: null,
      });
    });

    it('a user who cannot read the VOC → forbidden; console:access does not open it', async () => {
      const ref = { type: 'voc', id: vocWithEvents, scopeId: null };
      expect(await entityAudit(ref, strangerCookie)).toMatchObject({
        outcome: 'forbidden',
        data: null,
      });
    });

    it('a missing uuid and a non-uuid id answer the same forbidden body shape', async () => {
      const missing = await entityAudit(
        { type: 'voc', id: randomUUID(), scopeId: null },
        adminCookie,
      );
      const malformed = await entityAudit(
        { type: 'voc', id: 'not-a-uuid', scopeId: null },
        adminCookie,
      );
      const unreadable = await entityAudit(
        { type: 'voc', id: vocWithEvents, scopeId: null },
        strangerCookie,
      );
      for (const body of [missing, malformed, unreadable]) {
        expect(body).toMatchObject({
          outcome: 'forbidden',
          data: null,
          message: 'Not readable',
        });
      }
    });

    it('scopeId set → error; survey_response and unknown type → error', async () => {
      expect(
        (await entityAudit({ type: 'voc', id: vocWithEvents, scopeId: 'x' }, adminCookie)).outcome,
      ).toBe('error');
      for (const type of ['survey_response', 'equipment']) {
        expect(
          (await entityAudit({ type, id: randomUUID(), scopeId: null }, adminCookie)).outcome,
        ).toBe('error');
      }
      expect((await entityAudit({ type: 'voc' }, adminCookie)).outcome).toBe('error');
    });

    describe('cursor pages (#857, ADR-0085)', () => {
      const pageOf = (cursor?: unknown, id = vocPaged, cookie = adminCookie) =>
        entityAudit(
          {
            type: 'voc',
            id,
            scopeId: null,
            ...(cursor === undefined ? {} : { cursor }),
          },
          cookie,
        );

      it('pages 50 + 3 in at-desc, id-asc order without overlap or gap across a tie', async () => {
        const first = await pageOf();
        expect(first.outcome).toBe('ok');
        expect(first.data?.events).toHaveLength(50);
        const cursor = first.data?.nextCursor;
        expect(typeof cursor === 'string' && cursor.length > 0).toBe(true);
        const second = await pageOf(cursor);
        expect(second.outcome).toBe('ok');
        expect(second.data?.events).toHaveLength(3);
        expect(second.data?.nextCursor).toBeNull();
        const ids = [...(first.data?.events ?? []), ...(second.data?.events ?? [])].map(
          (e) => e.id,
        );
        expect(ids).toEqual(pagedOrder);
      });

      it('orders rows of one millisecond by id, not by microseconds', async () => {
        const body = await pageOf(undefined, vocTie);
        expect(body.data?.events?.map((e) => e.id)).toEqual(tieOrder);
        expect(body.data?.nextCursor).toBeNull();
      });

      it.each([
        ['conformance garbage', '__conformance_invalid_cursor'],
        ['a number', 7],
      ])('a bad cursor (%s) → error Invalid cursor', async (_name, cursor) => {
        expect(await pageOf(cursor)).toMatchObject({
          outcome: 'error',
          data: null,
          message: 'Invalid cursor',
        });
      });

      it('a cursor issued for another destination → error Invalid cursor', async () => {
        const cursor = (await pageOf()).data?.nextCursor;
        expect(await pageOf(cursor, vocWithEvents)).toMatchObject({
          outcome: 'error',
          data: null,
          message: 'Invalid cursor',
        });
      });

      it('an unreadable caller gets forbidden for an issued and a garbage cursor, never error', async () => {
        const cursor = (await pageOf()).data?.nextCursor;
        for (const c of [cursor, '__conformance_invalid_cursor']) {
          expect(await pageOf(c, vocPaged, strangerCookie)).toMatchObject({
            outcome: 'forbidden',
            data: null,
            message: 'Not readable',
          });
        }
      });

      it('POST /entity still rejects a cursor key', async () => {
        const res = await post(
          '/entity',
          { type: 'voc', id: vocPaged, scopeId: null, cursor: 'x' },
          adminCookie,
        );
        expect(res.json<Envelope>()).toMatchObject({
          outcome: 'error',
          message: 'Invalid entity reference',
        });
      });
    });

    it('a readable entity with no events → empty', async () => {
      expect(
        await entityAudit({ type: 'voc', id: vocWithoutEvents, scopeId: null }, adminCookie),
      ).toMatchObject({
        outcome: 'empty',
        data: null,
      });
    });
  });
});
