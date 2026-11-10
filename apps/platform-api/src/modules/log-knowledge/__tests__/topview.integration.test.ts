// #1656 — the model Top View pointer reads and writes through the real `buildServer` over `POST /api/v1/menu-action`
// against a real Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration`,
// app as platform_app, fixtures and cleanup as platform_migrate). Each write is judged on the wire answer,
// the `knowledge.*` rows and the `core.audit_log` rows written in the same transaction.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { layoutFixture } from '../../eqv/__tests__/fixture.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `ITV${randomUUID().slice(0, 6).toUpperCase()}`;

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  data: Record<string, unknown> | null;
  version: string | null;
  fieldErrors: { path: string[]; code: string }[];
  replayed: boolean;
}

describe.skipIf(!runIntegration)('model Top View pointer (#1656)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let manager: Person;
  let reader: Person;
  const actorIds: string[] = [];
  let n = 0;
  let hiddenSwId = '';
  const layoutId = `itv-${TAG.toLowerCase()}`;
  const ids = {} as { vendor: string; model: string; hidden: string; sw1: string; sw2: string; sw3: string; otherSw: string; rev: string };

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(action: string, input: Record<string, unknown>, opts: { who?: Person; expectedVersion?: string } = {}): Promise<Answer> {
    const who = opts.who ?? admin;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }
  const kw = (name: string, input: Record<string, unknown>, opts: { who?: Person; expectedVersion?: string } = {}) => act(`logKnowledge.${name}`, input, opts);

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = reader) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logKnowledge.${endpoint}`, context: {}, params }),
    });
    return res.json<{
      outcome: string;
      data: {
        resolved: { fromSoftwareId: string | null; document: unknown; layoutId: string; revision: string };
        resolvedError?: string;
        target: { softwareId: string };
        links: unknown[];
        rows: { layoutId: string; revision: string }[];
      };
    }>();
  }

  const auditOf = async (modelId: string) =>
    (await sql(`select event_type, subject_type, detail from core.audit_log where subject_id = $1 and event_type like 'knowledge.model_topview.%' order by created_at, id`, [modelId])).rows as {
      event_type: string;
      subject_type: string;
      detail: Record<string, unknown>;
    }[];
  const linkRows = async (modelId: string) => (await sql('select * from knowledge.model_topview_link where model_id = $1', [modelId])).rows;
  /** The concurrency token (`<linkId>:<version>`) of the row at (model, start SW), `'0'` when none. */
  const tokenOf = async (modelId: string, from: string | null) => {
    const row = (await linkRows(modelId)).find((r) => r.from_software_id === from);
    return row ? `${row.id}:${row.version}` : '0';
  };
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    manager = await person('developer');
    reader = await person('developer'); // no `eqv.view`, no catalog right
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'knowledge.catalog.manage', null, $3)`,
      [WORKSPACE_ID, manager.id, admin.id],
    );
    ids.vendor = (await kw('vendorCreate', { code: `${TAG}-v`, name: 'Vendor' })).data?.id as string;
    ids.model = (await kw('modelCreate', { vendorId: ids.vendor, code: `${TAG}-m`, name: 'Model', processIds: [] })).data?.id as string;
    ids.hidden = (await kw('modelCreate', { vendorId: ids.vendor, code: `${TAG}-h`, name: 'Hidden', processIds: [] })).data?.id as string;
    for (const [key, label] of [['sw1', 'v1'], ['sw2', 'v2'], ['sw3', 'v3']] as const) {
      ids[key] = (await kw('softwareCreate', { modelId: ids.model, versionLabel: `${TAG}-${label}`, name: '' })).data?.id as string;
    }
    ids.otherSw = (await kw('softwareCreate', { modelId: ids.hidden, versionLabel: `${TAG}-x`, name: '' })).data?.id as string;
    await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '0' });
    const published = await act('eqv.publishRevision', { layoutId }, { expectedVersion: '1' });
    ids.rev = published.data?.revision as string;
    await sql(`update knowledge.equipment_model set access_mode = 'restricted' where id = $1`, [ids.hidden]);
  });

  afterAll(async () => {
    await sql('delete from knowledge.model_topview_link where created_by = any($1)', [actorIds]);
    await sql('delete from eqv.layout_revision where published_by = any($1)', [actorIds]);
    await sql('delete from eqv.layout_draft where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.software_version where created_by = any($1)', [actorIds]);
    for (const table of ['equipment_model', 'vendor']) await sql(`delete from knowledge.${table} where created_by = any($1)`, [actorIds]);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('reads as unlinked before any link', async () => {
    const a = await read('modelTopView', { modelId: ids.model });
    expect(a.data).toMatchObject({ resolved: null, links: [], target: { softwareId: ids.sw3 } });
  });

  it('links the model default with expectedVersion 0 and audits it', async () => {
    const a = await kw('linkTopView', { modelId: ids.model, fromSoftwareId: null, layoutId, revision: ids.rev }, { who: manager, expectedVersion: '0' });
    expect(a.outcome).toBe('ok');
    expect(a.version).toBe(await tokenOf(ids.model, null));
    expect(a.version).toMatch(/^[0-9a-f-]{36}:1$/);
    const audit = await auditOf(ids.model);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ event_type: 'knowledge.model_topview.linked', subject_type: 'knowledge_model' });
    expect(audit[0]?.detail).toMatchObject({ layoutId, revision: ids.rev, fromSoftwareId: null });
    expect(audit[0]?.detail).not.toHaveProperty('document');
  });

  it('a reader without eqv.view reads the document through the Hub model ACL', async () => {
    const a = await read('modelTopView', { modelId: ids.model });
    expect(a.outcome).toBe('ok');
    expect(a.data.resolved).toMatchObject({ layoutId, revision: ids.rev, fromSoftwareId: null });
    expect(a.data.resolved.document).toBeTruthy();
    const older = await read('modelTopView', { modelId: ids.model, softwareId: ids.sw1 });
    expect(older.data.resolved.fromSoftwareId).toBeNull();
  });

  it('a SW row applies from its release order on', async () => {
    const a = await kw('linkTopView', { modelId: ids.model, fromSoftwareId: ids.sw2, layoutId, revision: ids.rev }, { who: manager, expectedVersion: '0' });
    expect(a.outcome).toBe('ok');
    expect((await read('modelTopView', { modelId: ids.model, softwareId: ids.sw1 })).data.resolved.fromSoftwareId).toBeNull();
    expect((await read('modelTopView', { modelId: ids.model, softwareId: ids.sw3 })).data.resolved.fromSoftwareId).toBe(ids.sw2);
    expect((await read('modelTopView', { modelId: ids.model })).data.target.softwareId).toBe(ids.sw3);
  });

  it('a software version of another model is invalid for the read', async () => {
    expect((await read('modelTopView', { modelId: ids.model, softwareId: ids.otherSw })).outcome).toBe('error');
  });

  it('replaces with the row version, refuses a stale or wrong version as conflict', async () => {
    const stale = await kw('linkTopView', { modelId: ids.model, fromSoftwareId: null, layoutId, revision: ids.rev }, { who: manager, expectedVersion: '0' });
    expect(stale.outcome).toBe('conflict');
    const ok = await kw('linkTopView', { modelId: ids.model, fromSoftwareId: null, layoutId, revision: ids.rev }, { who: manager, expectedVersion: await tokenOf(ids.model, null) });
    expect(ok.outcome).toBe('ok');
    expect(ok.version).toBe(await tokenOf(ids.model, null));
    expect(ok.version).toMatch(/:2$/);
    expect((await linkRows(ids.model)).filter((r) => r.from_software_id === null)).toHaveLength(1);
  });

  // `expectedVersion` is the current row version of the key: the model default row exists at version 2 here, so an unknown Revision
  // is judged after a matching version (a stale version would be `conflict`, which the replace test above covers).
  it.each([
    ['unknown model', () => ({ modelId: randomUUID(), fromSoftwareId: null, layoutId, revision: ids.rev }), 'modelId:not_found', '0'],
    ['hidden model', () => ({ modelId: ids.hidden, fromSoftwareId: null, layoutId, revision: ids.rev }), 'modelId:not_found', '0'],
    ['software of another model', () => ({ modelId: ids.model, fromSoftwareId: ids.otherSw, layoutId, revision: ids.rev }), 'fromSoftwareId:software_not_of_model', '0'],
    ['unknown revision', () => ({ modelId: ids.model, fromSoftwareId: null, layoutId, revision: `sha256:${'0'.repeat(64)}` }), 'revision:revision_not_found', 'default-row'],
  ])('refuses %s with a field error and writes no audit row', async (_label, input, code, expectedVersion) => {
    const before = (await auditOf(ids.model)).length;
    const a = await kw('linkTopView', input(), { who: manager, expectedVersion: expectedVersion === 'default-row' ? await tokenOf(ids.model, null) : expectedVersion });
    expect(a.outcome).toBe('invalid');
    expect(fe(a)).toContain(code);
    expect((await auditOf(ids.model)).length).toBe(before);
  });

  it('refuses a non-manager on writes and on the picker read', async () => {
    const w = await kw('linkTopView', { modelId: ids.model, fromSoftwareId: null, layoutId, revision: ids.rev }, { who: reader, expectedVersion: '2' });
    expect(w.outcome).toBe('forbidden');
    expect((await read('topViewRevisionOptions', {}, reader)).outcome).toBe('forbidden');
    const rows = (await read('topViewRevisionOptions', {}, manager)).data.rows;
    expect(rows.some((r) => r.layoutId === layoutId && r.revision === ids.rev)).toBe(true);
  });

  it('answers a hidden model like a missing one', async () => {
    expect((await read('modelTopView', { modelId: ids.hidden })).data as unknown).toBeNull();
    expect((await read('modelTopView', { modelId: randomUUID() })).data as unknown).toBeNull();
  });

  it('unlinks with the version, audits it, and a missing row is not_found', async () => {
    const gone = await kw('unlinkTopView', { modelId: ids.model, fromSoftwareId: ids.sw2 }, { who: manager, expectedVersion: await tokenOf(ids.model, ids.sw2) });
    expect(gone.outcome).toBe('ok');
    expect((await auditOf(ids.model)).map((a) => a.event_type)).toContain('knowledge.model_topview.unlinked');
    const again = await kw('unlinkTopView', { modelId: ids.model, fromSoftwareId: ids.sw2 }, { who: manager, expectedVersion: '1' });
    expect(again.outcome).toBe('not_found');
  });

  it('a start SW the manager cannot see answers exactly like an unknown one: no version, no unlink, no audit', async () => {
    const hiddenSw = (await kw('softwareCreate', { modelId: ids.model, versionLabel: `${TAG}-hs`, name: '' })).data?.id as string;
    const inserted = await sql(
      `insert into knowledge.model_topview_link (workspace_id, model_id, from_software_id, layout_id, layout_revision, created_by, updated_by) values ($1, $2, $3, $4, $5, $6, $6) returning id`,
      [WORKSPACE_ID, ids.model, hiddenSw, layoutId, ids.rev, manager.id],
    );
    await sql(`update knowledge.software_version set access_mode = 'restricted' where id = $1`, [hiddenSw]);
    hiddenSwId = hiddenSw;
    const real = `${inserted.rows[0].id}:1`;
    const rowsBefore = await linkRows(ids.model);
    const auditBefore = (await auditOf(ids.model)).length;
    const base = { modelId: ids.model, layoutId, revision: ids.rev };
    for (const expectedVersion of ['0', real]) {
      const hiddenLink = await kw('linkTopView', { ...base, fromSoftwareId: hiddenSw }, { who: manager, expectedVersion });
      const unknownLink = await kw('linkTopView', { ...base, fromSoftwareId: randomUUID() }, { who: manager, expectedVersion });
      expect(hiddenLink).toEqual(expect.objectContaining({ outcome: unknownLink.outcome, version: unknownLink.version, data: unknownLink.data, fieldErrors: unknownLink.fieldErrors }));
      const hiddenUnlink = await kw('unlinkTopView', { modelId: ids.model, fromSoftwareId: hiddenSw }, { who: manager, expectedVersion });
      const unknownUnlink = await kw('unlinkTopView', { modelId: ids.model, fromSoftwareId: randomUUID() }, { who: manager, expectedVersion });
      expect(hiddenUnlink).toEqual(expect.objectContaining({ outcome: unknownUnlink.outcome, version: unknownUnlink.version, fieldErrors: unknownUnlink.fieldErrors }));
      expect(JSON.stringify([hiddenLink, hiddenUnlink])).not.toContain(real);
    }
    expect(fe(await kw('linkTopView', { ...base, fromSoftwareId: hiddenSw }, { who: manager, expectedVersion: '0' }))).toContain('fromSoftwareId:software_not_of_model');
    expect(await linkRows(ids.model)).toEqual(rowsBefore);
    expect((await auditOf(ids.model)).length).toBe(auditBefore);
  });

  it('a token of an unlinked row never matches a row created later at the same key', async () => {
    const key = { modelId: ids.model, fromSoftwareId: ids.sw3 };
    const l1 = await kw('linkTopView', { ...key, layoutId, revision: ids.rev }, { who: manager, expectedVersion: '0' });
    expect(l1.outcome).toBe('ok');
    const tokenA = l1.version as string;
    expect((await kw('unlinkTopView', key, { who: manager, expectedVersion: tokenA })).outcome).toBe('ok');
    const l2 = await kw('linkTopView', { ...key, layoutId, revision: ids.rev }, { who: manager, expectedVersion: '0' });
    expect(l2.outcome).toBe('ok');
    expect(l2.version).not.toBe(tokenA);
    const rowsBefore = await linkRows(ids.model);
    const auditBefore = (await auditOf(ids.model)).length;
    expect((await kw('linkTopView', { ...key, layoutId, revision: ids.rev }, { who: manager, expectedVersion: tokenA })).outcome).toBe('conflict');
    expect((await kw('unlinkTopView', key, { who: manager, expectedVersion: tokenA })).outcome).toBe('conflict');
    expect(await linkRows(ids.model)).toEqual(rowsBefore);
    expect((await auditOf(ids.model)).length).toBe(auditBefore);
    expect(await tokenOf(ids.model, ids.sw3)).toBe(l2.version);
    // Leave the key empty again: the next test reads the model default.
    expect((await kw('unlinkTopView', key, { who: manager, expectedVersion: l2.version as string })).outcome).toBe('ok');
  });

  it('returns every visible SW of the model in release order as softwareOptions', async () => {
    const a = await read('modelTopView', { modelId: ids.model }, manager);
    const options = (a.data as unknown as { softwareOptions: { softwareId: string; releaseOrder: number }[] }).softwareOptions;
    expect(options.map((o) => o.softwareId)).toEqual(expect.arrayContaining([ids.sw1, ids.sw2, ids.sw3]));
    expect(options.map((o) => o.releaseOrder)).toEqual([...options.map((o) => o.releaseOrder)].sort((x, y) => x - y));
    expect(hiddenSwId).not.toBe('');
    expect(options.map((o) => o.softwareId)).not.toContain(hiddenSwId);
  });

  it('returns more than 500 visible SWs of one model, all of them, in release order', async () => {
    const big = (await kw('modelCreate', { vendorId: ids.vendor, code: `${TAG}-big`, name: 'Big', processIds: [] })).data?.id as string;
    const total = 501;
    await sql(
      `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by)
       select $1, $2, 'b' || g, 'b' || g, '', $3, $3 from generate_series(1, $4::int) g`,
      [WORKSPACE_ID, big, admin.id, total],
    );
    const a = await read('modelTopView', { modelId: big }, manager);
    const options = (a.data as unknown as { softwareOptions: { softwareId: string; releaseOrder: number }[] }).softwareOptions;
    expect(options).toHaveLength(total);
    expect(new Set(options.map((o) => o.softwareId)).size).toBe(total);
    expect(options.map((o) => o.releaseOrder)).toEqual([...options.map((o) => o.releaseOrder)].sort((x, y) => x - y));
  });

  it('reads revision_unavailable when the Revision of a pointer cannot be read', async () => {
    const swap = await sql(`select id from knowledge.model_topview_link where model_id = $1 and from_software_id is null`, [ids.model]);
    await sql(`update knowledge.model_topview_link set layout_revision = $2 where id = $1`, [swap.rows[0].id, `sha256:${'1'.repeat(64)}`]);
    const a = await read('modelTopView', { modelId: ids.model });
    expect(a.data).toMatchObject({ resolved: null, resolvedError: 'revision_unavailable' });
  });
});
