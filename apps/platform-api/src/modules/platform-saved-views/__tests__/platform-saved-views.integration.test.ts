// #1105a — platform saved views against a real Postgres through the real Fastify server (throwaway DB only,
// apps/platform-api/AGENTS.md → Verification). Every response is parsed with the shared response schema, so
// "the Zod response schemas accept the actual response" is asserted on every call.

import { type SavedViewCommand, savedViewResponseSchemas } from '@ap/contract-schemas';
import { auditEventTypeSchema } from '@ap/feature-shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-saved-views');
const MENU = `${PREFIX}-menu`;
const URL = '/api/v1/platform/saved-views/commands';

type Role = 'admin' | 'developer' | 'user';
type Acct = { id: string; cookie: string; csrf: string; name: string };
type Op = SavedViewCommand['op'];
// biome-ignore lint/suspicious/noExplicitAny: test responses are validated by the shared schema, then read loosely
type Any = any;

const menuDraft = (name: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  kind: 'menu-view',
  name,
  menuId: MENU,
  menuSchemaVersion: 1,
  context: { from: '2026-01-01T00:00:00' },
  page: [],
  chartOptions: {},
  layout: null,
  panels: null,
  ...extra,
});
const condDraft = (name: string) => ({
  schemaVersion: 1,
  kind: 'condition-set',
  name,
  context: {},
});
const KEY = { menuId: MENU };

describe.skipIf(!runIntegration)('platform saved views (#1105a, ADR-0099)', () => {
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let foreignWorkspaceId = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;

  async function account(role: Role, displayName = `SV ${role} ${n}`): Promise<Acct> {
    const externalId = `${PREFIX}-${role}-${n++}`;
    const { id } = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      displayName,
      roleLevel: role,
    });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/bootstrap',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(boot.statusCode).toBe(200);
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken, name: displayName };
  }

  const send = (a: Acct, url: string, payload: unknown, csrf = a.csrf) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${a.cookie}`,
        'x-csrf-token': csrf,
        'content-type': 'application/json',
      },
      payload: JSON.stringify(payload),
    });

  /** One command; asserts 200 + no-store and that the response is accepted by the shared schema for that op. */
  async function call(a: Acct, op: Op, fields: Record<string, unknown> = {}): Promise<Any> {
    const res = await send(a, URL, { version: 1, op, ...fields });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json();
    return (savedViewResponseSchemas as Record<string, { parse: (v: unknown) => unknown }>)[
      op
    ]?.parse(body);
  }
  const save = async (a: Acct, draft: Record<string, unknown> = menuDraft(`v-${n++}`)) => {
    const r = await call(a, 'save', { draft });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return r.value.view as Any;
  };
  const q = (sqlText: string, params: unknown[] = []) => migrate.pool.query(sqlText, params);
  const audits = async (types?: string[]) =>
    (
      await q(
        `select event_type, subject_id, detail, summary from core.audit_log where workspace_id = $1 and actor_id = any($2) and event_type like 'saved_view_%' ${types ? 'and event_type = any($3)' : ''} order by created_at, id`,
        types ? [WORKSPACE_ID, actorIds, types] : [WORKSPACE_ID, actorIds],
      )
    ).rows as Any[];
  const rowSnapshot = async () =>
    JSON.stringify(
      (
        await q(
          'select id, version, name, visibility_kind, approval, content, pending from platform.saved_views where owner_id = any($1) order by id',
          [actorIds],
        )
      ).rows,
    );

  let alice: Acct;
  let bob: Acct;
  let carol: Acct;
  let dev: Acct;
  let admin: Acct;
  let admin2: Acct;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    await migrate.pool.query('delete from core.rate_limits');
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    alice = await account('user', `${PREFIX} Alice Kim`);
    bob = await account('user', `${PREFIX} Bob Lee`);
    carol = await account('user', `${PREFIX} Carol Park`);
    dev = await account('developer');
    admin = await account('admin');
    admin2 = await account('admin');
    // A second workspace with its own internal member: must never appear in this workspace's reads.
    foreignWorkspaceId = (
      await q(
        'insert into core.workspaces (id, name) values (gen_random_uuid(), $1) returning id',
        [`${PREFIX}-foreign`],
      )
    ).rows[0].id;
    workspaceIds.push(foreignWorkspaceId);
  });

  beforeEach(async () => {
    await q('delete from core.rate_limits');
  });

  afterAll(async () => {
    if (actorIds.length > 0) {
      for (const [table, column] of [
        ['platform.saved_view_imports', 'actor_id'],
        ['platform.saved_view_defaults', 'actor_id'],
        ['platform.saved_views', 'owner_id'],
        ['platform.saved_view_groups', 'created_by'],
        ['core.audit_log', 'actor_id'],
        ['permission.permission_grants', 'actor_id'],
        ['permission.permission_denies', 'actor_id'],
        ['core.sessions', 'actor_id'],
      ] as const) {
        await q(`delete from ${table} where ${column} = any($1)`, [actorIds]);
      }
      await q('delete from platform.saved_view_group_members where actor_id = any($1)', [actorIds]);
      await q('delete from platform.saved_view_people where actor_id = any($1)', [actorIds]);
      await q('delete from core.actors where id = any($1)', [actorIds]);
    }
    for (const id of workspaceIds) {
      await q('delete from platform.saved_view_groups where workspace_id = $1', [id]);
      await q('delete from platform.saved_views where workspace_id = $1', [id]);
      await q('delete from core.actors where workspace_id = $1', [id]);
      await q('delete from core.workspaces where id = $1', [id]);
    }
    await q('delete from core.rate_limits');
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('the new audit events are in the closed vocabulary', () => {
    for (const t of [
      'saved_view_official_requested',
      'saved_view_official_approved',
      'saved_view_official_rejected',
      'saved_view_official_revoked',
      'saved_view_visibility_changed',
      'saved_view_group_created',
      'saved_view_group_updated',
      'saved_view_import_submitted',
    ]) {
      expect(auditEventTypeSchema.safeParse(t).success, t).toBe(true);
    }
  });

  describe('transport and identity', () => {
    it('session user id, ownerId, lookup, search and sharing targets are one id (core.actors.id)', async () => {
      const boot = await app.inject({
        method: 'GET',
        url: '/api/v1/platform/bootstrap',
        headers: { cookie: `${SESSION_COOKIE_NAME}=${alice.cookie}` },
      });
      expect(boot.json().session.user.id).toBe(alice.id);
      const view = await save(alice);
      expect(view.ownerId).toBe(alice.id);
      const lookup = await send(alice, '/api/v1/platform/people/lookup', {
        ids: [bob.id, 'not-a-uuid', '00000000-0000-4000-8000-000000000000', alice.id],
      });
      expect(lookup.statusCode).toBe(200);
      expect(lookup.headers['cache-control']).toBe('no-store');
      expect(
        lookup
          .json()
          .items.map((i: Any) => i.userId)
          .sort(),
      ).toEqual([alice.id, bob.id].sort());
      expect(lookup.json().items.every((i: Any) => i.affiliation === '')).toBe(true);
      const found = await call(alice, 'searchPeople', { query: 'Bob Lee' });
      expect(found.map((p: Any) => p.userId)).toContain(bob.id);
      const shared = await call(alice, 'setVisibility', {
        id: view.id,
        visibility: {
          kind: 'people',
          userIds: [found.find((p: Any) => p.userId === bob.id).userId],
        },
        expectedVersion: view.version,
      });
      expect(shared.ok).toBe(true);
      expect((await call(bob, 'get', { id: view.id })).view.id).toBe(view.id);
    });

    it('people lookup (read-only) works with the cookie alone, in the exact adapter call shape; commands still need CSRF', async () => {
      const lookup = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/people/lookup',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${alice.cookie}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ ids: [bob.id] }),
      });
      expect(lookup.statusCode).toBe(200);
      expect(lookup.headers['cache-control']).toBe('no-store');
      expect(lookup.json().items.map((i: Any) => i.userId)).toEqual([bob.id]);
      const anon = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/people/lookup',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ ids: [bob.id] }),
      });
      expect(anon.statusCode).toBe(401);
      const command = await app.inject({
        method: 'POST',
        url: URL,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${alice.cookie}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({ version: 1, op: 'listGroups' }),
      });
      expect(command.statusCode).toBe(403);
    });

    it('a forged identity or a missing CSRF token never reaches the store', async () => {
      const before = await rowSnapshot();
      const forged = await send(alice, URL, {
        version: 1,
        op: 'save',
        draft: { ...condDraft('x'), ownerId: bob.id },
      });
      expect(forged.statusCode).toBe(422);
      expect((await send(alice, URL, { version: 1, op: 'listGroups' }, 'wrong')).statusCode).toBe(
        403,
      );
      expect(await rowSnapshot()).toBe(before);
    });
  });

  describe('views and object ACL', () => {
    it('list is menu-filtered, private foreign views are not enumerated, a known id is denied (id/reason only), a missing one is null', async () => {
      const mine = await save(alice, menuDraft('alice private'));
      const cond = await save(alice, condDraft('alice cond'));
      const aliceList = await call(alice, 'list', { key: KEY });
      expect(aliceList.map((i: Any) => i.view.id)).toContain(mine.id);
      expect(aliceList.map((i: Any) => i.view.id)).not.toContain(cond.id);
      expect(
        (await call(alice, 'list', { key: { menuId: null } })).map((i: Any) => i.view.id),
      ).toContain(cond.id);
      expect((await call(bob, 'list', { key: KEY })).map((i: Any) => i.view?.id)).not.toContain(
        mine.id,
      );
      expect(await call(bob, 'get', { id: mine.id })).toEqual({
        id: mine.id,
        denied: true,
        reason: 'no-access',
      });
      expect(await call(bob, 'get', { id: '00000000-0000-4000-8000-000000000000' })).toBeNull();
      expect(await call(bob, 'get', { id: 'opaque-not-a-uuid' })).toBeNull();
      expect((await call(bob, 'remove', { id: mine.id })).reason).toBe('invalid');
    });

    it('another workspace’s view and members never appear', async () => {
      const foreign = await insertActorRow(dbHandle, {
        workspaceId: foreignWorkspaceId,
        externalId: `${PREFIX}-foreign-a`,
        displayName: `${PREFIX} Foreign Kim`,
        roleLevel: 'user',
      });
      const row = await q(
        `insert into platform.saved_views (workspace_id, owner_id, kind, menu_id, name, content, updated_at_ms, visibility_kind, approval) values ($1, $2, 'menu-view', $3, 'foreign official', '{"context":{}}', 1, 'official', 'approved') returning id`,
        [foreignWorkspaceId, foreign.id, MENU],
      );
      const foreignViewId = row.rows[0].id as string;
      expect((await call(alice, 'list', { key: KEY })).map((i: Any) => i.view?.id)).not.toContain(
        foreignViewId,
      );
      expect(await call(alice, 'get', { id: foreignViewId })).toBeNull();
      expect(
        (await send(alice, '/api/v1/platform/people/lookup', { ids: [foreign.id] })).json().items,
      ).toEqual([]);
      expect(await call(alice, 'searchPeople', { query: 'Foreign Kim' })).toEqual([]);
      const mine = await save(alice);
      const res = await call(alice, 'setVisibility', {
        id: mine.id,
        visibility: { kind: 'people', userIds: [foreign.id] },
        expectedVersion: mine.version,
      });
      expect(res).toEqual({ ok: false, reason: 'invalid', detail: 'unknown person' });
      const grp = await q(
        `insert into platform.saved_view_groups (workspace_id, name, created_by) values ($1, 'foreign grp', $2) returning id`,
        [foreignWorkspaceId, foreign.id],
      );
      expect(
        (
          await call(alice, 'setVisibility', {
            id: mine.id,
            visibility: { kind: 'groups', groupIds: [grp.rows[0].id] },
            expectedVersion: mine.version,
          })
        ).detail,
      ).toBe('unknown group');
      expect(
        (await call(alice, 'createGroup', { name: 'x', memberIds: [foreign.id] })).detail,
      ).toBe('unknown person');
    });

    it('update: expectedVersion conflict leaves rows and audits unchanged; a no-op keeps the version; owner-only remove', async () => {
      const v = await save(alice, menuDraft('before'));
      const ok = await call(alice, 'update', {
        id: v.id,
        patch: { name: 'after' },
        expectedVersion: v.version,
      });
      expect(ok.value.view).toMatchObject({ name: 'after', version: v.version + 1 });
      const snap = await rowSnapshot();
      const auditCount = (await audits()).length;
      expect(
        await call(alice, 'update', {
          id: v.id,
          patch: { name: 'stale' },
          expectedVersion: v.version,
        }),
      ).toEqual({ ok: false, reason: 'conflict' });
      const same = await call(alice, 'update', {
        id: v.id,
        patch: { name: 'after' },
        expectedVersion: v.version + 1,
      });
      expect(same.value.view.version).toBe(v.version + 1);
      expect(await rowSnapshot()).toBe(snap);
      expect((await audits()).length).toBe(auditCount);
      expect(
        (
          await call(alice, 'update', {
            id: v.id,
            patch: { name: '   ' },
            expectedVersion: v.version + 1,
          })
        ).reason,
      ).toBe('invalid');
      expect(
        (
          await send(alice, URL, {
            version: 1,
            op: 'update',
            id: v.id,
            patch: { rows: [] },
            expectedVersion: v.version + 1,
          })
        ).statusCode,
      ).toBe(422);
      expect((await call(alice, 'remove', { id: v.id })).ok).toBe(true);
      expect(await call(alice, 'get', { id: v.id })).toBeNull();
    });

    it('a condition set refuses page fields; a forbidden page key is invalid', async () => {
      const c = await save(alice, condDraft('c'));
      expect(
        (await call(alice, 'update', { id: c.id, patch: { page: [] }, expectedVersion: c.version }))
          .detail,
      ).toBe('a condition set has no page');
      const m = await save(alice);
      // transient UI state is refused by the wire schema itself (HTTP validation), before any store access
      expect(
        (
          await send(alice, URL, {
            version: 1,
            op: 'update',
            id: m.id,
            patch: { chartOptions: { zoomLevel: 3 } },
            expectedVersion: m.version,
          })
        ).statusCode,
      ).toBe(422);
    });
  });

  describe('sharing paths', () => {
    it('people ∪ group ∪ owner: cutting one path keeps the others; denied after all are cut', async () => {
      const v = await save(alice);
      const g = (await call(alice, 'createGroup', { name: `${PREFIX} g1`, memberIds: [bob.id] }))
        .value.group;
      const shared = await call(alice, 'setVisibility', {
        id: v.id,
        visibility: { kind: 'groups', groupIds: [g.id] },
        expectedVersion: v.version,
      });
      expect(shared.ok).toBe(true);
      expect((await call(bob, 'get', { id: v.id })).view.id).toBe(v.id);
      expect((await call(carol, 'get', { id: v.id })).denied).toBe(true);
      await call(alice, 'updateGroup', { id: g.id, patch: { removeMembers: [bob.id] } });
      expect((await call(bob, 'get', { id: v.id })).denied).toBe(true);
      await call(alice, 'updateGroup', { id: g.id, patch: { addMembers: [bob.id] } });
      expect((await call(bob, 'get', { id: v.id })).view.id).toBe(v.id);
      const toPeople = await call(alice, 'setVisibility', {
        id: v.id,
        visibility: { kind: 'people', userIds: [bob.id] },
        expectedVersion: shared.value.view.version,
      });
      expect(toPeople.ok).toBe(true);
      await call(alice, 'updateGroup', { id: g.id, patch: { removeMembers: [bob.id] } });
      expect((await call(bob, 'get', { id: v.id })).view.id).toBe(v.id);
      const priv = await call(alice, 'setVisibility', {
        id: v.id,
        visibility: { kind: 'private' },
        expectedVersion: toPeople.value.view.version,
      });
      expect(priv.ok).toBe(true);
      expect((await call(bob, 'get', { id: v.id })).denied).toBe(true);
      const rows = await q(
        'select count(*)::int as n from platform.saved_view_people p where p.view_id = $1',
        [v.id],
      );
      expect(rows.rows[0].n).toBe(0);
    });

    it('a group member sees but cannot edit or share; a group manager can; groups are objects of the viewer’s visibility', async () => {
      const g = (await call(alice, 'createGroup', { name: `${PREFIX} g2`, memberIds: [bob.id] }))
        .value.group;
      const v = await save(alice);
      await call(alice, 'setVisibility', {
        id: v.id,
        visibility: { kind: 'groups', groupIds: [g.id] },
        expectedVersion: v.version,
      });
      const asBob = await call(bob, 'get', { id: v.id });
      expect(asBob.capabilities).toMatchObject({ canView: true, canEdit: false, canShare: false });
      expect(
        (
          await call(bob, 'update', {
            id: v.id,
            patch: { name: 'hijack' },
            expectedVersion: asBob.view.version,
          })
        ).reason,
      ).toBe('forbidden');
      expect(
        (
          await call(bob, 'setVisibility', {
            id: v.id,
            visibility: { kind: 'private' },
            expectedVersion: asBob.view.version,
          })
        ).reason,
      ).toBe('forbidden');
      // carol cannot see group g (not a member), so she cannot be given a view through it by someone else, nor learn it exists
      const cv = await save(carol);
      expect(
        (
          await call(carol, 'setVisibility', {
            id: cv.id,
            visibility: { kind: 'groups', groupIds: [g.id] },
            expectedVersion: cv.version,
          })
        ).detail,
      ).toBe('unknown group');
    });

    it('sharing to non-uuid, unknown and oversize targets is invalid without leaking, never a 500', async () => {
      const v = await save(alice);
      for (const userIds of [
        ['not-a-uuid'],
        ['00000000-0000-4000-8000-000000000001'],
        ['a\u0000b'],
      ]) {
        expect(
          (
            await call(alice, 'setVisibility', {
              id: v.id,
              visibility: { kind: 'people', userIds },
              expectedVersion: v.version,
            })
          ).reason,
        ).toBe('invalid');
      }
      const many = Array.from(
        { length: 201 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      );
      expect(
        (
          await call(alice, 'setVisibility', {
            id: v.id,
            visibility: { kind: 'people', userIds: many },
            expectedVersion: v.version,
          })
        ).detail,
      ).toBe('too-many-people');
      expect(
        (
          await call(alice, 'setVisibility', {
            id: v.id,
            visibility: { kind: 'official' },
            expectedVersion: v.version,
          })
        ).detail,
      ).toBe('use requestOfficial');
    });

    it('a no-op share change and a concurrent pair with the same expectedVersion write one change and one audit', async () => {
      const v = await save(alice);
      const [a, b] = await Promise.all([
        call(alice, 'setVisibility', {
          id: v.id,
          visibility: { kind: 'people', userIds: [bob.id] },
          expectedVersion: v.version,
        }),
        call(alice, 'setVisibility', {
          id: v.id,
          visibility: { kind: 'people', userIds: [carol.id] },
          expectedVersion: v.version,
        }),
      ]);
      expect([a.ok, b.ok].sort()).toEqual([false, true]);
      expect([a, b].find((r) => !r.ok)).toEqual({ ok: false, reason: 'conflict' });
      expect(
        (await audits(['saved_view_visibility_changed'])).filter((r) => r.subject_id === v.id),
      ).toHaveLength(1);
      const winner = a.ok ? a : b;
      const again = await call(alice, 'setVisibility', {
        id: v.id,
        visibility: winner.value.view.visibility,
        expectedVersion: winner.value.view.version,
      });
      expect(again.value.view.version).toBe(winner.value.view.version);
      expect(
        (await audits(['saved_view_visibility_changed'])).filter((r) => r.subject_id === v.id),
      ).toHaveLength(1);
    });
  });

  describe('official approval', () => {
    it('request → pending (visibility unchanged) → approve publishes; developer role alone and the plain owner cannot approve', async () => {
      const v = await save(alice, menuDraft('to publish'));
      const req = await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version });
      expect(req.value.view).toMatchObject({
        approval: 'pending',
        visibility: { kind: 'private' },
      });
      expect(
        (
          await call(alice, 'requestOfficial', {
            id: v.id,
            expectedVersion: req.value.view.version,
          })
        ).detail,
      ).toBe('approval-state');
      expect((await call(bob, 'get', { id: v.id })).denied).toBe(true);
      expect((await call(dev, 'get', { id: v.id })).denied).toBe(true);
      expect((await call(admin, 'get', { id: v.id })).capabilities.canApprove).toBe(true);
      const version = req.value.view.version;
      expect(
        (await call(alice, 'decide', { id: v.id, decision: 'approve', expectedVersion: version }))
          .reason,
      ).toBe('forbidden');
      expect(
        (await call(dev, 'decide', { id: v.id, decision: 'approve', expectedVersion: version }))
          .reason,
      ).toBe('invalid');
      expect(
        (await call(bob, 'decide', { id: v.id, decision: 'approve', expectedVersion: version }))
          .reason,
      ).toBe('invalid');
      const approved = await call(admin, 'decide', {
        id: v.id,
        decision: 'approve',
        note: ' ok ',
        expectedVersion: version,
      });
      expect(approved.value.view).toMatchObject({
        approval: 'approved',
        visibility: { kind: 'official' },
        approvalNote: 'ok',
        ownerId: alice.id,
      });
      expect((await call(bob, 'get', { id: v.id })).view).toMatchObject({
        name: 'to publish',
        approval: 'approved',
      });
      const kinds = (
        await audits(['saved_view_official_requested', 'saved_view_official_approved'])
      )
        .filter((r) => r.subject_id === v.id)
        .map((r) => r.event_type);
      expect(kinds).toEqual(['saved_view_official_requested', 'saved_view_official_approved']);
    });

    it('concurrent approvals with the same expectedVersion: one wins, one conflict, one audit', async () => {
      const v = await save(alice);
      const r = await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version });
      const [a, b] = await Promise.all([
        call(admin, 'decide', {
          id: v.id,
          decision: 'approve',
          expectedVersion: r.value.view.version,
        }),
        call(admin2, 'decide', {
          id: v.id,
          decision: 'approve',
          expectedVersion: r.value.view.version,
        }),
      ]);
      expect([a.ok, b.ok].sort()).toEqual([false, true]);
      expect([a, b].find((x) => !x.ok).reason).toBe('conflict');
      expect(
        (await audits(['saved_view_official_approved'])).filter((x) => x.subject_id === v.id),
      ).toHaveLength(1);
    });

    it('stale expectedVersion: an unauthorized actor gets forbidden with no change or audit; an authorized approver gets conflict, also after the object left the pending state', async () => {
      const v = await save(alice);
      const r = await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version });
      const stale = r.value.view.version - 1;
      const decideAs = (who: Any, expectedVersion: number, decision = 'approve') =>
        call(who, 'decide', { id: v.id, decision, expectedVersion });
      // owner without the console grant: forbidden even with a stale version, never conflict
      expect((await decideAs(alice, stale)).reason).toBe('forbidden');
      expect((await call(alice, 'revoke', { id: v.id, expectedVersion: stale })).reason).toBe(
        'forbidden',
      );
      expect(
        (await audits(['saved_view_official_approved'])).filter((x) => x.subject_id === v.id),
      ).toHaveLength(0);
      expect((await call(alice, 'get', { id: v.id })).view.version).toBe(r.value.view.version);
      // authorized approver, stale version on a pending view
      expect((await decideAs(admin, stale)).reason).toBe('conflict');
      const approved = await decideAs(admin, r.value.view.version);
      expect(approved.ok).toBe(true);
      // the object is no longer pending: still conflict for a stale version, approval-state only for a fresh one
      expect((await decideAs(admin2, r.value.view.version)).reason).toBe('conflict');
      expect((await decideAs(admin2, r.value.view.version, 'reject')).reason).toBe('conflict');
      expect((await decideAs(admin2, approved.value.view.version)).detail).toBe('approval-state');
      // a non-approver still sees forbidden on the now-approved object
      expect((await decideAs(alice, r.value.view.version)).reason).toBe('forbidden');
      expect(
        (await audits(['saved_view_official_approved'])).filter((x) => x.subject_id === v.id),
      ).toHaveLength(1);
    });

    it('editing an official copy makes a separate pending change: viewers keep the approved copy until approval; a rejection stays private', async () => {
      const v = await save(alice, menuDraft('official v1'));
      let cur = (await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version }))
        .value.view;
      cur = (
        await call(admin, 'decide', { id: v.id, decision: 'approve', expectedVersion: cur.version })
      ).value.view;
      const edited = await call(alice, 'update', {
        id: v.id,
        patch: { name: 'official v2', layout: { a: 1 } },
        expectedVersion: cur.version,
      });
      expect(edited.value.view).toMatchObject({
        name: 'official v2',
        approval: 'pending',
        visibility: { kind: 'official' },
      });
      expect((await call(bob, 'get', { id: v.id })).view).toMatchObject({
        name: 'official v1',
        approval: 'approved',
      });
      expect((await call(admin, 'get', { id: v.id })).view.name).toBe('official v2');
      const requests = await call(admin, 'listApprovalRequests', { key: KEY });
      expect(requests.find((r: Any) => r.viewId === v.id).changes).toEqual(
        expect.arrayContaining(['이름 "official v1" → "official v2"', '레이아웃 변경']),
      );
      expect(
        (await call(bob, 'listApprovalRequests', { key: KEY })).find((r: Any) => r.viewId === v.id),
      ).toBeUndefined();
      const rejected = await call(admin, 'decide', {
        id: v.id,
        decision: 'reject',
        note: 'no thanks',
        expectedVersion: edited.value.view.version,
      });
      expect(rejected.value.view).toMatchObject({
        approval: 'rejected',
        approvalNote: 'no thanks',
      });
      expect((await call(bob, 'get', { id: v.id })).view).toMatchObject({
        name: 'official v1',
        approval: 'approved',
      });
      expect(
        (await call(alice, 'listApprovalRequests', { key: KEY })).find(
          (r: Any) => r.viewId === v.id,
        ),
      ).toMatchObject({ rejectReason: 'no thanks' });
      const again = await call(alice, 'requestOfficial', {
        id: v.id,
        expectedVersion: rejected.value.view.version,
      });
      const approved = await call(admin, 'decide', {
        id: v.id,
        decision: 'approve',
        expectedVersion: again.value.view.version,
      });
      expect(approved.value.view).toMatchObject({ name: 'official v2', approval: 'approved' });
      expect((await call(bob, 'get', { id: v.id })).view.name).toBe('official v2');
    });

    it('revoke: private again, owner kept, approved copy intact, pending cleared, other users’ defaults stop working', async () => {
      const v = await save(alice, menuDraft('revokable'));
      let cur = (await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version }))
        .value.view;
      cur = (
        await call(admin, 'decide', { id: v.id, decision: 'approve', expectedVersion: cur.version })
      ).value.view;
      expect((await call(bob, 'setDefault', { key: KEY, id: v.id })).ok).toBe(true);
      expect(await call(bob, 'getDefaultId', { key: KEY })).toBe(v.id);
      const edited = await call(alice, 'update', {
        id: v.id,
        patch: { name: 'unapproved edit' },
        expectedVersion: cur.version,
      });
      expect(
        (await call(alice, 'revoke', { id: v.id, expectedVersion: edited.value.view.version }))
          .reason,
      ).toBe('forbidden');
      expect(
        (await call(dev, 'revoke', { id: v.id, expectedVersion: edited.value.view.version }))
          .reason,
      ).toBe('forbidden');
      const revoked = await call(admin, 'revoke', {
        id: v.id,
        expectedVersion: edited.value.view.version,
      });
      expect(revoked.value.view).toMatchObject({
        visibility: { kind: 'private' },
        approval: 'none',
        ownerId: alice.id,
      });
      const row = (
        await q('select name, pending, visibility_kind from platform.saved_views where id = $1', [
          v.id,
        ])
      ).rows[0];
      expect(row).toMatchObject({ name: 'revokable', pending: null, visibility_kind: 'private' });
      expect(await call(bob, 'getDefaultId', { key: KEY })).toBeNull();
      expect((await call(bob, 'get', { id: v.id })).denied).toBe(true);
      expect((await call(alice, 'get', { id: v.id })).view).toMatchObject({
        name: 'revokable',
        ownerId: alice.id,
      });
      expect(
        (await audits(['saved_view_official_revoked'])).filter((x) => x.subject_id === v.id),
      ).toHaveLength(1);
      expect(
        (await call(admin, 'revoke', { id: v.id, expectedVersion: revoked.value.view.version }))
          .reason,
      ).toBe('invalid');
    });

    it('audit details carry ids/versions only: no title, payload, people query or note', async () => {
      const rows = await audits();
      expect(rows.length).toBeGreaterThan(0);
      const text = JSON.stringify(rows.map((r) => [r.detail, r.summary]));
      for (const forbidden of [
        'official v1',
        'to publish',
        'Bob Lee',
        'no thanks',
        '"context"',
        'layout',
      ])
        expect(text).not.toContain(forbidden);
    });
  });

  describe('defaults', () => {
    it('a default needs a reachable view of that menu; losing access ends it; concurrent first sets leave one row', async () => {
      const mine = await save(alice);
      const other = await save(alice, menuDraft('other menu', { menuId: `${MENU}-2` }));
      expect((await call(alice, 'setDefault', { key: KEY, id: other.id })).reason).toBe('invalid');
      expect((await call(bob, 'setDefault', { key: KEY, id: mine.id })).reason).toBe('invalid');
      await Promise.all([
        call(alice, 'setDefault', { key: KEY, id: mine.id }),
        call(alice, 'setDefault', { key: KEY, id: mine.id }),
      ]);
      expect(await call(alice, 'getDefaultId', { key: KEY })).toBe(mine.id);
      expect(
        (
          await q(
            'select count(*)::int as n from platform.saved_view_defaults where actor_id = $1 and menu_key = $2',
            [alice.id, MENU],
          )
        ).rows[0].n,
      ).toBe(1);
      const shared = await call(alice, 'setVisibility', {
        id: mine.id,
        visibility: { kind: 'people', userIds: [bob.id] },
        expectedVersion: mine.version,
      });
      await call(bob, 'setDefault', { key: KEY, id: mine.id });
      expect(await call(bob, 'getDefaultId', { key: KEY })).toBe(mine.id);
      await call(alice, 'setVisibility', {
        id: mine.id,
        visibility: { kind: 'private' },
        expectedVersion: shared.value.view.version,
      });
      expect(await call(bob, 'getDefaultId', { key: KEY })).toBeNull();
      await call(alice, 'setVisibility', {
        id: mine.id,
        visibility: { kind: 'people', userIds: [bob.id] },
        expectedVersion: shared.value.view.version + 1,
      });
      expect(await call(bob, 'getDefaultId', { key: KEY })).toBeNull();
      expect((await call(alice, 'setDefault', { key: KEY, id: null })).ok).toBe(true);
      expect(await call(alice, 'getDefaultId', { key: KEY })).toBeNull();
      expect(await call(alice, 'getDefaultId', { key: { menuId: 'a\u0000b' } })).toBeNull();
      expect(
        (await call(alice, 'setDefault', { key: { menuId: 'a\u0000b' }, id: null })).reason,
      ).toBe('invalid');
    });
  });

  describe('groups', () => {
    it('create → manager is the session user; membership edits are manager/console only; the last manager cannot be removed; audit has ids only', async () => {
      const created = await call(alice, 'createGroup', {
        name: `  ${PREFIX} g3  `,
        memberIds: [bob.id, bob.id],
      });
      expect(created.value.group).toMatchObject({
        kind: 'custom',
        name: `${PREFIX} g3`,
        memberCount: 1,
        managerIds: [alice.id],
      });
      expect(created.value.capabilities).toMatchObject({ canEditMembers: true });
      const id = created.value.group.id;
      expect((await call(carol, 'listGroups')).map((g: Any) => g.group.id)).not.toContain(id);
      expect((await call(carol, 'updateGroup', { id, patch: { name: 'x' } })).reason).toBe(
        'invalid',
      );
      expect(
        (await call(bob, 'listGroups')).find((g: Any) => g.group.id === id).capabilities,
      ).toMatchObject({ canView: true, canEditMembers: false });
      expect(
        (await call(bob, 'updateGroup', { id, patch: { addMembers: [carol.id] } })).reason,
      ).toBe('forbidden');
      expect(
        (
          await call(admin, 'updateGroup', {
            id,
            patch: { addMembers: [carol.id], name: 'renamed' },
          })
        ).value.group,
      ).toMatchObject({ name: 'renamed', memberCount: 2 });
      expect(
        (await call(alice, 'updateGroup', { id, patch: { removeMembers: [alice.id] } })).detail,
      ).toBe('last-manager');
      expect(
        (await call(alice, 'updateGroup', { id, patch: { addMembers: ['not-a-uuid'] } })).detail,
      ).toBe('unknown person');
      expect((await call(alice, 'updateGroup', { id, patch: { name: ' ' } })).reason).toBe(
        'invalid',
      );
      const unchanged = (await audits(['saved_view_group_updated'])).length;
      await call(alice, 'updateGroup', {
        id,
        patch: { removeMembers: ['not-a-uuid', '00000000-0000-4000-8000-000000000009'] },
      });
      expect((await audits(['saved_view_group_updated'])).length).toBe(unchanged);
      expect(
        (await audits(['saved_view_group_created'])).some(
          (r) => r.subject_id === id && r.detail.member_count === 1,
        ),
      ).toBe(true);
      const upd = (await audits(['saved_view_group_updated'])).find((r) => r.subject_id === id);
      expect(upd.detail).toEqual({
        group_id: id,
        added_ids: [carol.id],
        removed_ids: [],
        renamed: true,
      });
    });

    it('createGroup rejects unknown members and invalid names; concurrent first creates both succeed', async () => {
      expect(
        (
          await call(alice, 'createGroup', {
            name: 'x',
            memberIds: ['00000000-0000-4000-8000-000000000001'],
          })
        ).detail,
      ).toBe('unknown person');
      expect((await call(alice, 'createGroup', { name: '  ', memberIds: [] })).reason).toBe(
        'invalid',
      );
      expect(
        (await call(alice, 'createGroup', { name: 'bad\u0000name', memberIds: [] })).reason,
      ).toBe('invalid');
      const both = await Promise.all([
        call(alice, 'createGroup', { name: `${PREFIX} c1`, memberIds: [] }),
        call(alice, 'createGroup', { name: `${PREFIX} c2`, memberIds: [] }),
      ]);
      expect(both.every((r) => r.ok)).toBe(true);
    });

    it('a concurrent read sees a group either before or after a membership change, never a torn state', async () => {
      const g = (await call(alice, 'createGroup', { name: `${PREFIX} snap`, memberIds: [bob.id] }))
        .value.group;
      const [read, write] = await Promise.all([
        call(alice, 'listGroups'),
        call(alice, 'updateGroup', {
          id: g.id,
          patch: { addMembers: [carol.id], name: `${PREFIX} snap2` },
        }),
      ]);
      const seen = read.find((e: Any) => e.group.id === g.id).group;
      expect([`${PREFIX} snap`, `${PREFIX} snap2`]).toContain(seen.name);
      expect(seen.memberCount).toBe(seen.name.endsWith('2') ? 2 : 1);
      expect(write.ok).toBe(true);
    });
  });

  describe('people', () => {
    it('lookup is exact: unknown, non-uuid, system and other-workspace ids are omitted; 200 ids are accepted; a search keeps an exact id hit', async () => {
      const system = await q(
        `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1, $2, $3, $4, 'user', 'system') returning id`,
        [WORKSPACE_ID, `${PREFIX}-system`, `${PREFIX}-system@local`, `${PREFIX} System`],
      );
      actorIds.push(system.rows[0].id);
      const ids = [
        alice.id,
        system.rows[0].id,
        ...Array.from({ length: 197 }, (_, i) => `opaque-${i}`),
      ];
      const res = await send(alice, '/api/v1/platform/people/lookup', { ids });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.map((i: Any) => i.userId)).toEqual([alice.id]);
      expect(
        (
          await send(alice, '/api/v1/platform/people/lookup', {
            ids: Array.from({ length: 201 }, (_, i) => `x${i}`),
          })
        ).statusCode,
      ).toBe(422);
      expect(await call(alice, 'searchPeople', { query: `${PREFIX} System` })).toEqual([]);
      const crowd: string[] = [];
      for (let i = 0; i < 25; i += 1)
        crowd.push(
          (
            await insertActorRow(dbHandle, {
              workspaceId: WORKSPACE_ID,
              externalId: `${PREFIX}-crowd-${i}`,
              displayName: `${PREFIX} crowd ${String(i).padStart(2, '0')}`,
              roleLevel: 'user',
            })
          ).id,
        );
      actorIds.push(...crowd);
      const capped = await call(alice, 'searchPeople', { query: `${PREFIX} crowd` });
      expect(capped).toHaveLength(20);
      const last = crowd[24] as string;
      expect(capped.map((p: Any) => p.userId)).not.toContain(last);
      expect((await call(alice, 'searchPeople', { query: last }))[0]).toMatchObject({
        userId: last,
        affiliation: '',
      });
      expect(await call(alice, 'searchPeople', { query: '   ' })).toEqual([]);
      expect(await call(alice, 'searchPeople', { query: 'a\u0000b' })).toEqual([]);
      expect(await call(alice, 'searchPeople', { query: '100%_\\' })).toEqual([]);
    });
  });

  describe('invalid Unicode never reaches PostgreSQL', () => {
    it.each([
      ['NUL in a name', menuDraft('a\u0000b')],
      ['NUL in a page key', menuDraft('p', { page: { 'k\u0000': ['v'] } })],
      ['NUL in a layout value', menuDraft('l', { layout: { a: 'x\u0000y' } })],
      ['NUL inside opaque panels', menuDraft('o', { panels: { 'p\u0000': 1 } })],
      ['a lone surrogate', menuDraft('s\ud800')],
    ])('save: %s → invalid unicode, nothing written', async (_label, draft) => {
      const before = await rowSnapshot();
      expect(await call(alice, 'save', { draft })).toEqual({
        ok: false,
        reason: 'invalid',
        detail: 'unicode',
      });
      expect(await rowSnapshot()).toBe(before);
    });

    it('update and decide notes and list keys with NUL are invalid/empty, not 500', async () => {
      const v = await save(alice);
      expect(
        (
          await call(alice, 'update', {
            id: v.id,
            patch: { name: 'x\u0000' },
            expectedVersion: v.version,
          })
        ).detail,
      ).toBe('unicode');
      expect(await call(alice, 'list', { key: { menuId: 'a\u0000b' } })).toEqual([]);
      expect(await call(alice, 'listApprovalRequests', { key: { menuId: 'a\u0000b' } })).toEqual(
        [],
      );
      expect(await call(alice, 'get', { id: 'a\u0000b' })).toBeNull();
    });
  });

  describe('one-time browser import', () => {
    const rows = (...names: string[]) =>
      names.map((name) => ({ legacyKey: `lk-${name}`, draft: menuDraft(name) }));

    it('imports private owned views, maps defaults to committed rows only, and a verbatim retry returns the same ids without duplicates', async () => {
      const token = uid('imp');
      const input = {
        importToken: token,
        rows: rows('i1', 'i2'),
        defaults: [{ key: KEY, legacyKey: 'lk-i1' }],
      };
      const first = await call(alice, 'importLocal', input);
      expect(first.ok).toBe(true);
      const ids = first.value.results.map((r: Any) => [r.status, r.id]);
      expect(ids.map(([s]: Any) => s)).toEqual(['imported', 'imported']);
      expect(first.value.defaults).toEqual([
        { key: KEY, legacyKey: 'lk-i1', id: first.value.results[0].id },
      ]);
      expect(await call(alice, 'getDefaultId', { key: KEY })).toBe(first.value.results[0].id);
      const stored = await q(
        'select owner_id, visibility_kind, approval from platform.saved_views where id = any($1)',
        [ids.map(([, id]: Any) => id)],
      );
      expect(stored.rows).toEqual([
        { owner_id: alice.id, visibility_kind: 'private', approval: 'none' },
        { owner_id: alice.id, visibility_kind: 'private', approval: 'none' },
      ]);
      const retry = await call(alice, 'importLocal', input);
      expect(retry.value.results.map((r: Any) => [r.status, r.id])).toEqual(
        ids.map(([, id]: Any) => ['already_imported', id]),
      );
      expect(
        (
          await q(
            'select count(*)::int as n from platform.saved_view_imports where actor_id = $1 and import_token = $2',
            [alice.id, token],
          )
        ).rows[0].n,
      ).toBe(2);
      expect(
        (await audits(['saved_view_import_submitted'])).filter((r) => r.detail.imported === 2),
      ).toHaveLength(1);
    });

    it('concurrent replays commit each row once', async () => {
      const input = { importToken: uid('imp'), rows: rows('c1', 'c2', 'c3'), defaults: [] };
      const [a, b] = await Promise.all([
        call(bob, 'importLocal', input),
        call(bob, 'importLocal', input),
      ]);
      const all = [...a.value.results, ...b.value.results];
      expect(all.filter((r: Any) => r.status === 'imported')).toHaveLength(3);
      expect(all.filter((r: Any) => r.status === 'already_imported')).toHaveLength(3);
      expect(new Set(all.map((r: Any) => r.id)).size).toBe(3);
    });

    it('a removed imported view is not resurrected by a retry; token reuse with other content is rejected', async () => {
      const input = { importToken: uid('imp'), rows: rows('t1'), defaults: [] };
      const first = await call(alice, 'importLocal', input);
      const id = first.value.results[0].id;
      expect((await call(alice, 'remove', { id })).ok).toBe(true);
      const retry = await call(alice, 'importLocal', input);
      expect(retry.value.results).toEqual([{ legacyKey: 'lk-t1', status: 'already_imported', id }]);
      expect(await call(alice, 'get', { id })).toBeNull();
      const reused = await call(alice, 'importLocal', {
        ...input,
        rows: [{ legacyKey: 'lk-t1', draft: menuDraft('t1 changed') }],
      });
      expect(reused.value.results).toEqual([
        { legacyKey: 'lk-t1', status: 'rejected', reason: 'invalid', detail: 'import-token-reuse' },
      ]);
      expect(
        (
          await q(
            'select count(*)::int as n from platform.saved_views where owner_id = $1 and name = $2',
            [alice.id, 't1 changed'],
          )
        ).rows[0].n,
      ).toBe(0);
    });

    it('a bad row is rejected alone and recoverable; good rows commit; its default is not mapped; an existing server default is not overwritten', async () => {
      const server = await save(carol, menuDraft('server default'));
      await call(carol, 'setDefault', { key: KEY, id: server.id });
      const input = {
        importToken: uid('imp'),
        rows: [...rows('p1'), { legacyKey: 'lk-bad', draft: menuDraft('bad\u0000') }],
        defaults: [{ key: KEY, legacyKey: 'lk-bad' }],
      };
      const first = await call(carol, 'importLocal', input);
      expect(first.value.results.map((r: Any) => r.status)).toEqual(['imported', 'rejected']);
      expect(first.value.results[1]).toEqual({
        legacyKey: 'lk-bad',
        status: 'rejected',
        reason: 'invalid',
        detail: 'unicode',
      });
      expect(first.value.defaults).toEqual([]);
      const second = await call(carol, 'importLocal', {
        importToken: uid('imp'),
        rows: rows('p2'),
        defaults: [{ key: KEY, legacyKey: 'lk-p2' }],
      });
      expect(second.value.defaults).toEqual([]);
      expect(await call(carol, 'getDefaultId', { key: KEY })).toBe(server.id);
      const fixed = await call(carol, 'importLocal', {
        ...input,
        rows: [...rows('p1'), { legacyKey: 'lk-bad', draft: menuDraft('bad') }],
        defaults: [],
      });
      expect(fixed.value.results.map((r: Any) => r.status)).toEqual([
        'already_imported',
        'imported',
      ]);
    });

    it('an import never carries sharing, group or admin authority (the strict wire refuses it)', async () => {
      const res = await send(alice, URL, {
        version: 1,
        op: 'importLocal',
        importToken: 't',
        rows: [{ legacyKey: 'k', draft: { ...menuDraft('x'), visibility: { kind: 'official' } } }],
        defaults: [],
      });
      expect(res.statusCode).toBe(422);
    });
  });
  describe('final-review fixes (C1–C6)', () => {
    const groupState = async () =>
      JSON.stringify([
        (
          await q(
            'select group_id, actor_id, is_member, is_manager from platform.saved_view_group_members where group_id in (select id from platform.saved_view_groups where created_by = any($1)) order by group_id, actor_id',
            [actorIds],
          )
        ).rows,
        (
          await q(
            'select id, name from platform.saved_view_groups where created_by = any($1) order by id',
            [actorIds],
          )
        ).rows,
      ]);
    const fullState = async () =>
      JSON.stringify([await rowSnapshot(), await groupState(), (await audits()).length]);

    /**
     * Lock barrier: a second connection (migrate pool; the app pool has max 10, so the request runs on another
     * connection) holds the workspace advisory lock, `start` is issued, and `change` runs only once pg_locks shows
     * the request WAITING on that very lock (and the request is still unsettled). A request that never queues
     * fails the test instead of passing on a timeout.
     */
    async function afterLockWait<T>(start: () => Promise<T>, change: () => Promise<unknown>) {
      const holder = await migrate.pool.connect();
      try {
        await holder.query('begin');
        await holder.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `platform-saved-views:${WORKSPACE_ID}`,
        ]);
        let settled = false;
        const pending = start().finally(() => {
          settled = true;
        });
        const deadline = Date.now() + 15_000;
        for (;;) {
          const { rows } = await holder.query(
            `with k as (select hashtextextended($1, 0) as v)
             select count(*)::int as n from pg_locks, k
             where locktype = 'advisory' and not granted and pid <> pg_backend_pid()
               and classid = ((v >> 32) & 4294967295)::oid and objid = (v & 4294967295)::oid`,
            [`platform-saved-views:${WORKSPACE_ID}`],
          );
          if (rows[0].n > 0) break;
          if (Date.now() > deadline)
            throw new Error('the request never queued on the workspace lock');
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(settled).toBe(false);
        await change();
        await holder.query('commit');
        return await pending;
      } catch (error) {
        await holder.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        holder.release();
      }
    }

    describe('C2 console:access is judged again after the workspace lock', () => {
      const grantApprover = async (g: Acct) => {
        await q(
          "insert into permission.permission_grants (workspace_id, actor_id, capability, granted_by_actor_id) values ($1, $2, 'workspace.admin', $3)",
          [WORKSPACE_ID, g.id, admin.id],
        );
      };
      const changes: Array<[string, (g: Acct) => Promise<unknown>]> = [
        [
          'grant revoked',
          (g) =>
            q(
              "update permission.permission_grants set revoked_at = now(), revoked_by_actor_id = $2, revoked_reason = 'lock-wait' where actor_id = $1 and capability = 'workspace.admin'",
              [g.id, admin.id],
            ),
        ],
        [
          'explicit deny',
          (g) =>
            q(
              "insert into permission.permission_denies (workspace_id, actor_id, capability, reason, created_by_actor_id) values ($1, $2, 'workspace.admin', 'lock-wait', $3)",
              [WORKSPACE_ID, g.id, admin.id],
            ),
        ],
        [
          'grant expired',
          (g) =>
            q(
              "update permission.permission_grants set expires_at = now() - interval '1 second' where actor_id = $1 and capability = 'workspace.admin'",
              [g.id],
            ),
        ],
      ];
      type Scenario = { run: () => Promise<Any>; reason: string };
      const scenarios: Record<string, (g: Acct) => Promise<Scenario>> = {
        approve: async (g) => {
          const v = await save(alice, menuDraft(`lock-approve-${n++}`));
          const r = await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version });
          return {
            run: () =>
              call(g, 'decide', {
                id: v.id,
                decision: 'approve',
                expectedVersion: r.value.view.version,
              }),
            reason: 'invalid',
          };
        },
        revoke: async (g) => {
          const v = await save(alice, menuDraft(`lock-revoke-${n++}`));
          const r = await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version });
          const a = await call(admin, 'decide', {
            id: v.id,
            decision: 'approve',
            expectedVersion: r.value.view.version,
          });
          return {
            run: () => call(g, 'revoke', { id: v.id, expectedVersion: a.value.view.version }),
            reason: 'forbidden',
          };
        },
        'console group edit': async (g) => {
          const created = await call(alice, 'createGroup', {
            name: `${PREFIX} lock-g-${n++}`,
            memberIds: [bob.id],
          });
          return {
            run: () =>
              call(g, 'updateGroup', {
                id: created.value.group.id,
                patch: { addMembers: [carol.id], name: 'taken over' },
              }),
            reason: 'invalid',
          };
        },
      };

      it.each(
        Object.keys(scenarios).flatMap((op) =>
          changes.map(([label, change]) => [op, label, change] as const),
        ),
      )(
        '%s is refused when the grant is lost while waiting on the lock (%s); state, version and audit stay',
        async (op, _label, change) => {
          const g = await account('user');
          await grantApprover(g);
          const scenario = await (scenarios[op] as (g: Acct) => Promise<Scenario>)(g);
          const before = await fullState();
          const result = await afterLockWait(scenario.run, () => change(g));
          expect(result.ok, JSON.stringify(result)).toBe(false);
          expect(result.reason).toBe(scenario.reason);
          expect(await fullState()).toBe(before);
        },
      );

      it('control: with the grant intact the same waiting approval commits (the barrier is not what refuses it)', async () => {
        const g = await account('user');
        await grantApprover(g);
        const scenario = await (scenarios.approve as (g: Acct) => Promise<Scenario>)(g);
        const before = await audits(['saved_view_official_approved']);
        const result = await afterLockWait(scenario.run, async () => undefined);
        expect(result.ok, JSON.stringify(result)).toBe(true);
        expect(result.value.view.approval).toBe('approved');
        expect(await audits(['saved_view_official_approved'])).toHaveLength(before.length + 1);
      });
    });

    describe('C1 import identity strings are checked before SQL', () => {
      it.each(['bad\u0000token', 'bad\ud800token'])(
        'token %j is a normal invalid envelope and writes nothing',
        async (importToken) => {
          const a = await account('user');
          const before = await fullState();
          const res = await call(a, 'importLocal', {
            importToken,
            rows: [{ legacyKey: 'lk-t', draft: condDraft('t') }],
            defaults: [],
          });
          expect(res).toEqual({ ok: false, reason: 'invalid', detail: 'unicode' });
          expect(await fullState()).toBe(before);
        },
      );

      it('a bad legacyKey (NUL / lone surrogate) is rejected alone; good rows and their default commit, retry recovers', async () => {
        const a = await account('user');
        const token = uid('imp');
        const first = await call(a, 'importLocal', {
          importToken: token,
          rows: [
            { legacyKey: 'lk-good', draft: menuDraft('good') },
            { legacyKey: 'lk-\u0000', draft: menuDraft('nul') },
            { legacyKey: 'lk-\ud800', draft: menuDraft('lone') },
          ],
          defaults: [
            { key: KEY, legacyKey: 'lk-good' },
            { key: KEY, legacyKey: 'lk-\u0000' },
          ],
        });
        expect(first.ok, JSON.stringify(first)).toBe(true);
        const unicode = (legacyKey: string) => ({
          legacyKey,
          status: 'rejected',
          reason: 'invalid',
          detail: 'unicode',
        });
        expect(first.value.results[0]).toMatchObject({ legacyKey: 'lk-good', status: 'imported' });
        expect(first.value.results.slice(1)).toEqual([unicode('lk-\u0000'), unicode('lk-\ud800')]);
        const goodId = first.value.results[0].id;
        expect(first.value.defaults).toEqual([{ key: KEY, legacyKey: 'lk-good', id: goodId }]);
        expect(await call(a, 'getDefaultId', { key: KEY })).toBe(goodId);
        const mapped = await q(
          'select legacy_key from platform.saved_view_imports where actor_id = $1 and import_token = $2',
          [a.id, token],
        );
        expect(mapped.rows).toEqual([{ legacy_key: 'lk-good' }]);
        const submitted = (await audits(['saved_view_import_submitted'])).filter((r) =>
          r.detail.view_ids?.includes(goodId),
        );
        expect(submitted).toHaveLength(1);
        expect(submitted[0].detail).toMatchObject({ imported: 1, rejected: 2 });
        const retry = await call(a, 'importLocal', {
          importToken: token,
          rows: [
            { legacyKey: 'lk-good', draft: menuDraft('good') },
            { legacyKey: 'lk-fixed', draft: menuDraft('nul') },
          ],
          defaults: [],
        });
        expect(retry.value.results.map((r: Any) => r.status)).toEqual([
          'already_imported',
          'imported',
        ]);
      });
    });

    describe('C3 an edit that opens an official application is audited', () => {
      it('official edit and rejected→pending each write one requested event (ids only); no-op and failed calls write none', async () => {
        const v = await save(alice, menuDraft('audit-official'));
        const requested = async () =>
          (await audits(['saved_view_official_requested'])).filter((r) => r.subject_id === v.id);
        let cur = (await call(alice, 'requestOfficial', { id: v.id, expectedVersion: v.version }))
          .value.view;
        cur = (
          await call(admin, 'decide', {
            id: v.id,
            decision: 'approve',
            expectedVersion: cur.version,
          })
        ).value.view;
        expect(await requested()).toHaveLength(1);
        const edited = await call(alice, 'update', {
          id: v.id,
          patch: { name: 'audit-official secret title' },
          expectedVersion: cur.version,
        });
        expect(edited.ok).toBe(true);
        let events = await requested();
        expect(events).toHaveLength(2);
        expect(events[1].detail).toEqual({ view_id: v.id, version: edited.value.view.version });
        expect(JSON.stringify(events[1])).not.toContain('secret title');
        const same = await call(alice, 'update', {
          id: v.id,
          patch: { name: 'audit-official secret title' },
          expectedVersion: edited.value.view.version,
        });
        expect(same.ok).toBe(true);
        const stale = await call(alice, 'update', {
          id: v.id,
          patch: { name: 'stale write' },
          expectedVersion: cur.version,
        });
        expect(stale.ok).toBe(false);
        expect(await requested()).toHaveLength(2);
        const rejected = await call(admin, 'decide', {
          id: v.id,
          decision: 'reject',
          note: 'n',
          expectedVersion: edited.value.view.version,
        });
        const again = await call(alice, 'update', {
          id: v.id,
          patch: { name: 'audit-official third' },
          expectedVersion: rejected.value.view.version,
        });
        expect(again.value.view.approval).toBe('pending');
        events = await requested();
        expect(events).toHaveLength(3);
        expect(events[2].detail).toEqual({ view_id: v.id, version: again.value.view.version });
      });
    });

    describe('C4 share targets are de-duplicated after UUID normalization', () => {
      it('the same group in two letter cases is one share, never a 500; a repeat is a no-op', async () => {
        const v = await save(alice);
        const g = (
          await call(alice, 'createGroup', { name: `${PREFIX} c4-${n++}`, memberIds: [bob.id] })
        ).value.group.id as string;
        const visibility = { kind: 'groups', groupIds: [g, g.toUpperCase()] };
        const shared = await call(alice, 'setVisibility', {
          id: v.id,
          visibility,
          expectedVersion: v.version,
        });
        expect(shared.ok, JSON.stringify(shared)).toBe(true);
        const count = async () =>
          (
            await q(
              'select count(*)::int as n from platform.saved_view_group_shares where view_id = $1',
              [v.id],
            )
          ).rows[0].n;
        expect(await count()).toBe(1);
        const audited = (await audits(['saved_view_visibility_changed'])).length;
        const repeat = await call(alice, 'setVisibility', {
          id: v.id,
          visibility,
          expectedVersion: shared.value.view.version,
        });
        expect(repeat.value.view.version).toBe(shared.value.view.version);
        expect(await count()).toBe(1);
        expect((await audits(['saved_view_visibility_changed'])).length).toBe(audited);
      });

      it('the same person in two letter cases is one share', async () => {
        const v = await save(alice);
        const r = await call(alice, 'setVisibility', {
          id: v.id,
          visibility: { kind: 'people', userIds: [bob.id, bob.id.toUpperCase()] },
          expectedVersion: v.version,
        });
        expect(r.ok, JSON.stringify(r)).toBe(true);
        expect(
          (
            await q(
              'select count(*)::int as n from platform.saved_view_people where view_id = $1',
              [v.id],
            )
          ).rows[0].n,
        ).toBe(1);
      });
    });

    describe('C5 group membership is judged on the final set', () => {
      it('500 cap and no-op follow remove-then-add; the last manager stays protected', async () => {
        const ids: string[] = [];
        for (let i = 0; i < 501; i++) {
          const { id } = await insertActorRow(dbHandle, {
            workspaceId: WORKSPACE_ID,
            externalId: `${PREFIX}-m-${n++}`,
            displayName: `${PREFIX} member ${i}`,
            roleLevel: 'user',
          });
          actorIds.push(id);
          ids.push(id);
        }
        const members = ids.slice(0, 500);
        const extra = ids[500] as string;
        const created = await call(alice, 'createGroup', {
          name: `${PREFIX} c5-${n++}`,
          memberIds: members,
        });
        expect(created.ok, JSON.stringify(created)).toBe(true);
        const id = created.value.group.id as string;
        expect(created.value.group.memberCount).toBe(500);

        let before = await fullState();
        const over = await call(alice, 'updateGroup', { id, patch: { addMembers: [extra] } });
        expect(over).toMatchObject({ ok: false, reason: 'invalid', detail: 'too-many-members' });
        expect(await fullState()).toBe(before);

        const noop = await call(alice, 'updateGroup', {
          id,
          patch: { addMembers: [members[1]], removeMembers: [members[1]] },
        });
        expect(noop.ok).toBe(true);
        expect(await fullState()).toBe(before);

        const lastManager = await call(alice, 'updateGroup', {
          id,
          patch: { addMembers: [alice.id], removeMembers: [alice.id] },
        });
        expect(lastManager).toMatchObject({ ok: false, detail: 'last-manager' });
        expect(await fullState()).toBe(before);

        const swap = await call(alice, 'updateGroup', {
          id,
          patch: { addMembers: [extra], removeMembers: [members[0]] },
        });
        expect(swap.ok, JSON.stringify(swap)).toBe(true);
        expect(swap.value.group.memberCount).toBe(500);
        const updates = (await audits(['saved_view_group_updated'])).filter(
          (r) => r.subject_id === id,
        );
        expect(updates).toHaveLength(1);
        expect(updates[0].detail).toMatchObject({ added_ids: [extra], removed_ids: [members[0]] });
        before = await fullState();
        expect(before).toContain(extra);
      });
    });
  });
});
