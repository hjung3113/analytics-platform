// #623 — platform port `getEntity` + `accessDirectory`, and the shared entity read gate on
// `entityAudit` (ADR-0069 decisions 6, 7, 9). Route-level against a real Postgres (throwaway DB
// only). Every assertion is scoped to rows this suite created: other suites leave actors and
// rows in the shared workspace.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertTaskRow } from '../../../test-support/task-fixtures.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-entity-access');

type Role = 'admin' | 'developer' | 'user';
type Envelope = {
  outcome: string;
  data: Record<string, unknown> | null;
  assessments: unknown[];
  trust: unknown;
  correlationId: string;
  message?: string;
};
type Person = { id: string; cookie: string };
type Row = {
  id: string;
  name: string;
  title: { ko: string; en: string };
  role: string;
  permissions: string[];
  sites: unknown[];
};

describe.skipIf(!runIntegration)('platform port entity + access reads (#623)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  const isolatedActorIds: string[] = []; // kept out of actorIds: the directory tests assert exact sets
  let msId = '';
  let n = 0;

  let admin: Person;
  let developer: Person;
  let grantedUser: Person; // user role + active finding.read grant on the MS
  let plainUser: Person;
  let reporter: Person;
  let vocId = '';
  let archivedVocId = '';
  let findingId = '';
  let findingDisplay = '';
  let taskId = '';
  let taskDisplay = '';
  let vocDisplay = '';

  async function newPerson(roleLevel: Role, displayName?: string): Promise<Person> {
    const externalId = `${PREFIX}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      roleLevel,
      ...(displayName ? { displayName } : {}),
    });
    actorIds.push(id);
    const cookie = randomUUID();
    await migrateHandle.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
       values ($1, $2, $3, now() + interval '1 hour', now(), now(), 'integration-test')`,
      [cookie, id, WORKSPACE_ID],
    );
    return { id, cookie };
  }

  const post = (path: string, payload: unknown, cookie?: string) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/platform${path}`,
      headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {},
      payload: payload as object,
    });
  const call = async (path: string, payload: unknown, who: Person) => {
    const res = await post(path, payload, who.cookie);
    expect(res.statusCode).toBe(200);
    return res.json<Envelope>();
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    msId = await insertMsDirectly(migrateHandle, WORKSPACE_ID, `${PREFIX}-ms`, 'Entity access MS');
    // Names sort as N1 < N2 < N3 < N4 < N5 so the name sort is predictable among this suite's rows.
    admin = await newPerson('admin', `${PREFIX} N1 admin`);
    developer = await newPerson('developer', `${PREFIX} N2 developer`);
    grantedUser = await newPerson('user', `${PREFIX} N3 granted`);
    plainUser = await newPerson('user', `${PREFIX} N4 plain`);
    reporter = await newPerson('user', `${PREFIX} N5 reporter`);

    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      reporter.id,
      'Entity voc',
    );
    vocId = voc.id;
    const archived = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      reporter.id,
      'Archived voc',
    );
    archivedVocId = archived.id;
    await migrateHandle.pool.query(
      'update voc.vocs set archived_at = now(), archived_by_actor_id = $2 where id = $1',
      [archivedVocId, admin.id],
    );
    vocDisplay = (
      await migrateHandle.pool.query<{ display_id: string }>(
        'select display_id from voc.vocs where id = $1',
        [vocId],
      )
    ).rows[0]?.display_id as string;
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Entity finding',
      sourceId: vocId,
      severity: 'high',
      status: 'active',
      createdBy: admin.id,
    });
    findingId = finding.id;
    findingDisplay = finding.display_id;
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Entity task',
      status: 'todo',
      priority: 'high',
      dueDate: '2026-12-31',
      createdBy: admin.id,
    });
    taskId = task.id;
    taskDisplay = task.display_id;
    // The Finding provider's `canRead` allows this actor; the Finding detail endpoint does not.
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      grantedUser.id,
      'finding.read',
      msId,
      admin.id,
    );
    await grantCapability(
      migrateHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.read',
      msId,
      admin.id,
    );
  });

  afterAll(async () => {
    const q = (text: string, params: unknown[] = []) => migrateHandle.pool.query(text, params);
    await q('delete from task.tasks where primary_managed_system_id = $1', [msId]);
    await q('delete from finding.findings where primary_managed_system_id = $1', [msId]);
    await q('delete from permission.permission_grants where managed_system_id = $1', [msId]);
    await q('delete from voc.vocs where primary_managed_system_id = $1', [msId]);
    const allActorIds = [...actorIds, ...isolatedActorIds];
    if (allActorIds.length > 0) {
      await q('delete from permission.permission_grants where actor_id = any($1::uuid[])', [
        allActorIds,
      ]);
      await q('delete from core.sessions where actor_id = any($1::uuid[])', [allActorIds]);
      await q('delete from core.actors where id = any($1::uuid[])', [allActorIds]);
    }
    if (msId) await q('delete from core.managed_systems where id = $1', [msId]);
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  const entityOf = () => ({
    voc: {
      ref: () => ({ type: 'voc', id: vocId, scopeId: null }),
      data: () => ({
        type: 'voc',
        id: vocId,
        displayId: vocDisplay,
        title: 'Entity voc',
        status: 'received',
      }),
    },
    finding: {
      ref: () => ({ type: 'finding', id: findingId, scopeId: null }),
      data: () => ({
        type: 'finding',
        id: findingId,
        displayId: findingDisplay,
        title: 'Entity finding',
        status: 'active',
        severity: 'high',
        managedSystemId: msId,
      }),
    },
    task: {
      ref: () => ({ type: 'task', id: taskId, scopeId: null }),
      data: () => ({
        type: 'task',
        id: taskId,
        displayId: taskDisplay,
        title: 'Entity task',
        status: 'todo',
        priority: 'high',
        managedSystemId: msId,
        dueDate: '2026-12-31',
      }),
    },
  });
  const KINDS = ['voc', 'finding', 'task'] as const;

  describe('getEntity', () => {
    it('401 without a session cookie', async () => {
      expect((await post('/entity', entityOf().voc.ref())).statusCode).toBe(401);
    });

    it.each(KINDS)(
      '%s: a reader who passes the detail gate → ok with the exact projection',
      async (kind) => {
        const res = await post('/entity', entityOf()[kind].ref(), admin.cookie);
        expect(res.statusCode).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        const body = res.json<Envelope>();
        expect(body.correlationId).toBe(res.headers['x-correlation-id']);
        expect(body).toMatchObject({ outcome: 'ok', assessments: [], trust: null });
        expect(body.data).toEqual(entityOf()[kind].data());
      },
    );

    it('voc: the reporter reads their own VOC', async () => {
      expect((await call('/entity', entityOf().voc.ref(), reporter)).data).toEqual(
        entityOf().voc.data(),
      );
    });

    it('voc: a user who is not the reporter → forbidden', async () => {
      expect(await call('/entity', entityOf().voc.ref(), plainUser)).toMatchObject({
        outcome: 'forbidden',
        data: null,
        message: 'Not readable',
      });
    });

    it('finding: a user with an active finding.read grant (provider canRead allows) → forbidden', async () => {
      expect(await call('/entity', entityOf().finding.ref(), grantedUser)).toMatchObject({
        outcome: 'forbidden',
        data: null,
        message: 'Not readable',
      });
    });

    it.each([
      ['a user with finding.read (fails the elevated-role gate)', () => grantedUser],
      ['a developer with finding.read but no finding.manage', () => developer],
    ])('task: %s → forbidden', async (_name, who) => {
      expect(await call('/entity', entityOf().task.ref(), who())).toMatchObject({
        outcome: 'forbidden',
        data: null,
        message: 'Not readable',
      });
    });

    it.each(KINDS)(
      '%s: a missing uuid and a non-uuid id answer one forbidden body',
      async (kind) => {
        const missing = await call(
          '/entity',
          { type: kind, id: randomUUID(), scopeId: null },
          admin,
        );
        const malformed = await call(
          '/entity',
          { type: kind, id: 'not-a-uuid', scopeId: null },
          admin,
        );
        for (const body of [missing, malformed]) {
          expect(body).toMatchObject({ outcome: 'forbidden', data: null, message: 'Not readable' });
        }
        expect({ ...missing, correlationId: '' }).toEqual({ ...malformed, correlationId: '' });
      },
    );

    it('voc: an archived VOC → forbidden, like a missing one', async () => {
      expect(
        await call('/entity', { type: 'voc', id: archivedVocId, scopeId: null }, admin),
      ).toMatchObject({ outcome: 'forbidden', data: null, message: 'Not readable' });
    });

    it.each([
      ['scopeId set', { type: 'voc', id: randomUUID(), scopeId: 'x' }],
      ['voc_cluster', { type: 'voc_cluster', id: randomUUID(), scopeId: null }],
      ['task_request', { type: 'task_request', id: randomUUID(), scopeId: null }],
      ['unknown type', { type: 'equipment', id: randomUUID(), scopeId: null }],
      ['missing id', { type: 'voc' }],
      ['unknown key', { type: 'voc', id: randomUUID(), scopeId: null, x: 1 }],
      ['array body', []],
    ])('%s → error envelope', async (_name, ref) => {
      expect(await call('/entity', ref, admin)).toMatchObject({
        outcome: 'error',
        data: null,
        message: expect.any(String),
      });
    });

    it('invalid JSON → 200 error envelope', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/entity',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}`,
          'content-type': 'application/json',
        },
        payload: '{not json',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Envelope>().outcome).toBe('error');
    });
  });

  describe('entityAudit shares the gate', () => {
    it.each(['finding', 'task'] as const)(
      '%s: unreadable → forbidden, readable without events → empty',
      async (kind) => {
        expect(await call('/entity/audit', entityOf()[kind].ref(), grantedUser)).toMatchObject({
          outcome: 'forbidden',
          data: null,
          message: 'Not readable',
        });
        expect(await call('/entity/audit', entityOf()[kind].ref(), admin)).toMatchObject({
          outcome: 'empty',
          data: null,
        });
      },
    );

    it.each(['voc_cluster', 'task_request'])(
      '%s is no longer an audit type → error',
      async (type) => {
        expect(
          (await call('/entity/audit', { type, id: randomUUID(), scopeId: null }, admin)).outcome,
        ).toBe('error');
      },
    );
  });

  describe('console access is independent of entity reads', () => {
    it('a user with only a workspace-scoped workspace.admin grant opens the directory but reads no entity', async () => {
      const consoleUser = await newPerson('user', `${PREFIX} N6 console`);
      actorIds.splice(actorIds.indexOf(consoleUser.id), 1);
      isolatedActorIds.push(consoleUser.id);
      await grantCapability(
        migrateHandle,
        WORKSPACE_ID,
        consoleUser.id,
        'workspace.admin',
        null,
        admin.id,
      );

      const directory = await call('/access-directory/search', { pageSize: 100 }, consoleUser);
      expect(directory.outcome).toBe('ok');

      for (const kind of ['voc', 'finding', 'task'] as const) {
        for (const path of ['/entity', '/entity/audit']) {
          expect(await call(path, entityOf()[kind].ref(), consoleUser)).toMatchObject({
            outcome: 'forbidden',
            data: null,
            message: 'Not readable',
          });
        }
      }
    });
  });

  describe('accessDirectory', () => {
    const list = async (query: Record<string, unknown>, who: Person = admin) => {
      const body = await call('/access-directory/search', query, who);
      return body;
    };
    const mine = (body: Envelope): Row[] => {
      const ids = new Set(actorIds);
      return ((body.data?.items ?? []) as Row[]).filter((r) => ids.has(r.id));
    };
    const all = (extra: Record<string, unknown> = {}) => list({ pageSize: 100, ...extra });
    const ids = (rows: Row[]) => rows.map((r) => r.id);
    const asc = (...p: Person[]) => p.map((x) => x.id).sort();
    const CANON = [
      'platform:view',
      'notice:view',
      'voc:view',
      'console:access',
      'feedbackops:access',
    ];

    it('401 without a session cookie', async () => {
      expect((await post('/access-directory/search', {})).statusCode).toBe(401);
    });

    it.each([
      ['empty query', {}],
      ['a bad query (permission first)', { pageSize: 999, nope: 1 }],
    ])('non-admin with %s → forbidden', async (_name, query) => {
      for (const who of [plainUser, developer]) {
        expect(await list(query, who)).toMatchObject({
          outcome: 'forbidden',
          data: null,
          message: 'No permission console:access',
        });
      }
    });

    it('admin → exact AccessPrincipal rows for internal members only, canonical permissions, sites []', async () => {
      // Rows of other suites may fill the first page; ask for this suite's by role+name via paging all.
      const rows: Row[] = [];
      for (let page = 1; ; page++) {
        const body = await list({ pageSize: 100, page });
        const items = (body.data?.items ?? []) as Row[];
        rows.push(...items);
        if (items.length === 0 || rows.length >= (body.data?.total as number)) break;
      }
      const byId = new Map(rows.map((r) => [r.id, r]));
      const base = { sites: [] };
      expect(byId.get(admin.id)).toEqual({
        ...base,
        id: admin.id,
        name: `${PREFIX} N1 admin`,
        title: { ko: '관리자', en: 'Admin' },
        role: 'admin',
        permissions: CANON,
      });
      expect(byId.get(developer.id)).toEqual({
        ...base,
        id: developer.id,
        name: `${PREFIX} N2 developer`,
        title: { ko: '개발자', en: 'Developer' },
        role: 'developer',
        permissions: CANON.filter((p) => p !== 'console:access'),
      });
      expect(byId.get(grantedUser.id)).toEqual({
        ...base,
        id: grantedUser.id,
        name: `${PREFIX} N3 granted`,
        title: { ko: '사용자', en: 'User' },
        role: 'user',
        permissions: CANON.filter((p) => p !== 'console:access'),
      });
      expect(byId.get(plainUser.id)).toMatchObject({
        permissions: ['platform:view', 'notice:view', 'voc:view'],
      });
    });

    it('system actors are not principals', async () => {
      const ext = `${PREFIX}-system`;
      const sys = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $4, 'user', 'system') returning id`,
        [WORKSPACE_ID, ext, `${ext}@local`, `${PREFIX} N0 system`],
      );
      const sysId = sys.rows[0]?.id as string;
      actorIds.push(sysId);
      const body = await all({ sort: { field: 'name', desc: false } });
      expect(mine(body).map((r) => r.id)).not.toContain(sysId);
    });

    it.each([
      ['role', { role: 'developer' }, (): string[] => [developer.id]],
      ['permission console:access', { permission: 'console:access' }, (): string[] => [admin.id]],
      [
        'permission feedbackops:access',
        { permission: 'feedbackops:access' },
        (): string[] => [admin.id, developer.id, grantedUser.id].sort(),
      ],
    ])('filter %s narrows correctly', async (_name, query, expected) => {
      const rows = mine(await all({ ...query, sort: { field: 'name', desc: false } }));
      expect(ids(rows).sort()).toEqual(expected());
    });

    it('filter role matches exactly (case-sensitive)', async () => {
      expect((await list({ role: 'Developer' })).outcome).toBe('empty');
    });

    it.each([
      [
        'name asc',
        { field: 'name', desc: false },
        () => [admin.id, developer.id, grantedUser.id, plainUser.id, reporter.id],
      ],
      [
        'name desc',
        { field: 'name', desc: true },
        () => [reporter.id, plainUser.id, grantedUser.id, developer.id, admin.id],
      ],
      [
        'role asc',
        { field: 'role', desc: false },
        () => [admin.id, developer.id, ...asc(grantedUser, plainUser, reporter)],
      ],
      [
        'role desc (id stays ascending)',
        { field: 'role', desc: true },
        () => [...asc(grantedUser, plainUser, reporter), developer.id, admin.id],
      ],
      [
        'permissionCount asc',
        { field: 'permissionCount', desc: false },
        () => [...asc(plainUser, reporter), ...asc(developer, grantedUser), admin.id],
      ],
      [
        'permissionCount desc',
        { field: 'permissionCount', desc: true },
        () => [admin.id, ...asc(developer, grantedUser), ...asc(plainUser, reporter)],
      ],
      [
        'grantCount asc (all zero → id order)',
        { field: 'grantCount', desc: false },
        () => asc(admin, developer, grantedUser, plainUser, reporter),
      ],
      [
        'grantCount desc (all zero → id order)',
        { field: 'grantCount', desc: true },
        () => asc(admin, developer, grantedUser, plainUser, reporter),
      ],
    ])('sort %s', async (_name, sort, expected) => {
      expect(ids(mine(await all({ sort })))).toEqual(expected());
    });

    it('default sort is role ascending with the id tie-break', async () => {
      expect(ids(mine(await all()))).toEqual([
        admin.id,
        developer.id,
        ...asc(grantedUser, plainUser, reporter),
      ]);
    });

    it('paginates; a page past the end is ok with [] and the true total; no match → empty', async () => {
      const first = await list({ page: 1, pageSize: 2, sort: { field: 'role', desc: false } });
      expect(first.outcome).toBe('ok');
      expect((first.data?.items as Row[]).length).toBe(2);
      const total = first.data?.total as number;
      expect(total).toBeGreaterThanOrEqual(5);
      const past = await list({ page: total + 1, pageSize: 100 });
      expect(past).toMatchObject({ outcome: 'ok', data: { items: [], total } });
      const far = await list({ page: Number.MAX_SAFE_INTEGER, pageSize: 100 });
      expect(far).toMatchObject({ outcome: 'ok', data: { items: [], total } });
      expect(await list({ role: `${PREFIX}-nobody` })).toMatchObject({
        outcome: 'empty',
        data: null,
      });
    });

    it.each([
      ['unknown key', { nope: 1 }],
      ['empty role', { role: '' }],
      ['role with whitespace', { role: 'a b' }],
      ['role with &', { role: 'a&b' }],
      ['role over 80 chars', { role: 'a'.repeat(81) }],
      ['non-string role', { role: 5 }],
      ['malformed permission', { permission: 'admin all' }],
      ['non-string permission', { permission: 3 }],
      ['page 0', { page: 0 }],
      ['page fractional', { page: 1.5 }],
      ['page beyond the safe integer range', { page: 2 ** 53 }],
      ['pageSize 0', { pageSize: 0 }],
      ['pageSize 101', { pageSize: 101 }],
      ['sort not an object', { sort: 'name' }],
      ['sort extra key', { sort: { field: 'name', desc: false, x: 1 } }],
      ['sort bad field', { sort: { field: 'id', desc: false } }],
      ['sort non-boolean desc', { sort: { field: 'name', desc: 'yes' } }],
      ['array body', []],
    ])('malformed query (%s) → error envelope', async (_name, query) => {
      expect(await list(query as Record<string, unknown>)).toMatchObject({
        outcome: 'error',
        data: null,
        message: 'Invalid access filter',
      });
    });

    it('timing: ~300 seeded actors in one unfiltered read (reported, not asserted)', async () => {
      const values: string[] = [];
      const params: unknown[] = [WORKSPACE_ID];
      for (let i = 0; i < 300; i++) {
        const ext = `${PREFIX}-bulk-${i}`;
        params.push(
          ext,
          `${ext}@local`,
          `${PREFIX} bulk ${i}`,
          i % 10 === 0 ? 'developer' : 'user',
        );
        const o = 2 + i * 4;
        values.push(`($1, $${o}, $${o + 1}, $${o + 2}, $${o + 3}, 'internal_member')`);
      }
      const inserted = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ${values.join(',')} returning id`,
        params,
      );
      actorIds.push(...inserted.rows.map((r) => r.id));
      const startedAt = performance.now();
      const body = await list({ pageSize: 100 });
      const elapsed = Math.round(performance.now() - startedAt);
      console.info(`accessDirectory timing: ${elapsed} ms for total=${body.data?.total as number}`);
      expect(body.outcome).toBe('ok');
      expect(body.data?.total as number).toBeGreaterThanOrEqual(305);
    });
  });
});
