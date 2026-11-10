// #1645 — the eqv module through the real `buildServer` over `app.inject`, against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`, app as platform_app, fixtures and cleanup as platform_migrate). Needs migration 0121.
// Actors differ in exactly the capability under test: nothing, `eqv.view`, `eqv.layout.edit`, `eqv.layout.publish`, and an Admin.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { recordDraft } from '../audit.js';
import { insertDraft } from '../repositories/eqv-write.js';
import { cyclicLayoutFixture, layoutFixture } from './fixture.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `eqv${randomUUID().replace(/[^a-f]/g, '').slice(0, 6)}`;

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  version?: string | null;
  fieldErrors?: { path: string[]; code: string }[];
}

const READS: [string, Record<string, unknown>][] = [
  ['eqv.layouts', {}],
  ['eqv.layoutDraft', { layoutId: 'any-layout' }],
  ['eqv.layoutRevisions', { layoutId: 'any-layout' }],
  ['eqv.layoutRevision', { layoutId: 'any-layout', revision: `sha256:${'a'.repeat(64)}` }],
  ['eqv.templates', {}],
  ['eqv.template', { templateId: 'any-template' }],
  ['eqv.equipment-options', {}],
];

describe.skipIf(!runIntegration)('eqv module (#1645)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let nobody: Person; // a developer without any eqv capability
  let viewer: Person; // eqv.view only
  let editor: Person; // eqv.layout.edit only
  let publisher: Person; // eqv.layout.publish only
  const actorIds: string[] = [];
  let n = 0;
  let seq = 0;
  const layoutIds: string[] = [];

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const newLayoutId = () => {
    const id = `${TAG}-l${seq++}`;
    layoutIds.push(id);
    return id;
  };

  async function person(roleLevel: 'admin' | 'developer', capability?: string): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    if (capability) await grantCapability(dbHandle, WORKSPACE_ID, id, capability, null, admin.id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = admin): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
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

  const auditRows = async (subjectType: string, eventType?: string) =>
    (
      await sql(
        `select event_type, subject_id, detail from core.audit_log where workspace_id = $1 and subject_type = $2 and actor_id = any($3) ${eventType ? 'and event_type = $4' : ''} order by created_at`,
        eventType ? [WORKSPACE_ID, subjectType, actorIds, eventType] : [WORKSPACE_ID, subjectType, actorIds],
      )
    ).rows as { event_type: string; subject_id: string; detail: Record<string, unknown> }[];
  const count = async (table: string, where: string, params: unknown[]) =>
    Number((await sql(`select count(*) from eqv.${table} where ${where}`, params)).rows[0].count);

  /** Creates a draft (expectedVersion '0') and returns its layout id. */
  async function createDraft(who: Person = admin): Promise<string> {
    const layoutId = newLayoutId();
    const answer = await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { who, expectedVersion: '0' });
    expect(answer.outcome).toBe('ok');
    return layoutId;
  }
  /** Draft → published Revision: returns [layoutId, revision]. */
  async function publishOne(): Promise<[string, string]> {
    const layoutId = await createDraft();
    const answer = await act('eqv.publishRevision', { layoutId }, { expectedVersion: '1' });
    expect(answer.outcome).toBe('ok');
    return [layoutId, answer.data.revision as string];
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    nobody = await person('developer');
    viewer = await person('developer', 'eqv.view');
    editor = await person('developer', 'eqv.layout.edit');
    publisher = await person('developer', 'eqv.layout.publish');
  });

  beforeEach(async () => {
    await sql(`delete from core.rate_limits where key like any($1)`, [actorIds.map((id) => `${WORKSPACE_ID}:${id}%`)]);
  });

  afterAll(async () => {
    await sql('delete from eqv.template where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.layout_revision where workspace_id = $1 and published_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.layout_draft where workspace_id = $1 and created_by = any($2)', [WORKSPACE_ID, actorIds]);
    await sql('delete from eqv.equipment where workspace_id = $1 and equipment_id like $2', [WORKSPACE_ID, `${TAG}%`]);
    await sql('delete from core.idempotency_keys where actor_id = any($1)', [actorIds]);
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['permission.permission_denies', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('permission: a denied call is refused on the server', () => {
    it.each(READS)('read %s without eqv.view → forbidden', async (endpoint, params) => {
      for (const who of [nobody, editor, publisher]) expect((await read(endpoint, params, who)).outcome, endpoint).toBe('forbidden');
    });

    it.each(READS)('read %s with eqv.view only is allowed', async (endpoint, params) => {
      expect((await read(endpoint, params, viewer)).outcome, endpoint).not.toBe('forbidden');
    });

    it('saveDraft needs eqv.layout.edit: nobody, a viewer and a publisher are refused and nothing is written', async () => {
      const layoutId = newLayoutId();
      for (const who of [nobody, viewer, publisher]) {
        expect((await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { who, expectedVersion: '0' })).outcome).toBe('forbidden');
      }
      expect(await count('layout_draft', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(0);
    });

    it('publishRevision and promoteTemplate need eqv.layout.publish: an editor, a viewer and nobody are refused', async () => {
      const [layoutId, revision] = await publishOne();
      for (const who of [nobody, viewer, editor]) {
        expect((await act('eqv.publishRevision', { layoutId }, { who, expectedVersion: '1' })).outcome).toBe('forbidden');
        expect(
          (await act('eqv.promoteTemplate', { layoutId, revision, templateId: `${TAG}-t-denied`, name: 'x' }, { who })).outcome,
        ).toBe('forbidden');
      }
      expect(await count('template', 'workspace_id = $1 and template_id = $2', [WORKSPACE_ID, `${TAG}-t-denied`])).toBe(0);
    });

    it('a holder of the capability (not Admin) can use it', async () => {
      const layoutId = newLayoutId();
      expect((await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { who: editor, expectedVersion: '0' })).outcome).toBe('ok');
      expect((await act('eqv.publishRevision', { layoutId }, { who: publisher, expectedVersion: '1' })).outcome).toBe('ok');
    });
  });

  describe('saveDraft', () => {
    it('creates with expectedVersion 0 (first row has version 1), then saves with the version seen and bumps it', async () => {
      const layoutId = newLayoutId();
      const first = await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '0' });
      expect(first).toMatchObject({ outcome: 'ok', version: '1', data: { layoutId, version: '1' } });
      expect(JSON.stringify(first.data)).not.toContain('components');
      const second = await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '1' });
      expect(second).toMatchObject({ outcome: 'ok', version: '2' });
      // The draft's uuid never changes across saves.
      expect(second.data.id).toBe(first.data.id);
      expect(await count('layout_draft', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(1);
    });

    it('answers conflict for a stale version and for 0 on an existing draft, and writes nothing', async () => {
      const layoutId = await createDraft();
      await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '1' });
      const stale = await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '1' });
      expect(stale).toMatchObject({ outcome: 'conflict', version: '2' });
      const zero = await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '0' });
      expect(zero).toMatchObject({ outcome: 'conflict', version: '2' });
      expect((await sql('select version from eqv.layout_draft where workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).rows[0].version).toBe(2);
    });

    it('a creation race: one creates, the other gets conflict, one row', async () => {
      const layoutId = newLayoutId();
      const [a, b] = await Promise.all([
        act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { who: admin, expectedVersion: '0' }),
        act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { who: editor, expectedVersion: '0' }),
      ]);
      expect([a.outcome, b.outcome].sort()).toEqual(['conflict', 'ok']);
      expect(await count('layout_draft', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(1);
      expect(await auditRows('eqv_layout', 'eqv.layout.draft_created').then((rows) => rows.filter((r) => r.detail.layoutId === layoutId))).toHaveLength(1);
    });

    it('refuses a parentId cycle before anything is stored (EV#170)', async () => {
      const layoutId = newLayoutId();
      const answer = await act('eqv.saveDraft', { layoutId, document: cyclicLayoutFixture(layoutId) }, { expectedVersion: '0' });
      expect(answer.outcome).toBe('invalid');
      expect(answer.fieldErrors?.map((e) => e.code)).toContain('hierarchy-cycle');
      expect(await count('layout_draft', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(0);
    });

    it('refuses a document id that differs from the layout id, and a Template document', async () => {
      const layoutId = newLayoutId();
      const mismatch = await act('eqv.saveDraft', { layoutId, document: layoutFixture(`${layoutId}-other`) }, { expectedVersion: '0' });
      expect(mismatch).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['document', 'id'], code: 'id_mismatch' }] });
      const template = { ...layoutFixture(layoutId), kind: 'template', roleCardinality: {} };
      expect((await act('eqv.saveDraft', { layoutId, document: template }, { expectedVersion: '0' })).outcome).toBe('invalid');
      expect(await count('layout_draft', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(0);
    });

    it('writes one audit row per write with ids and versions only (subject id = the draft uuid)', async () => {
      const layoutId = newLayoutId();
      const first = await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '0' });
      await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '1' });
      const rows = (await auditRows('eqv_layout')).filter((r) => r.detail.layoutId === layoutId);
      expect(rows.map((r) => [r.event_type, r.detail])).toEqual([
        ['eqv.layout.draft_created', { layoutId, version: 1 }],
        ['eqv.layout.draft_saved', { layoutId, version: 2 }],
      ]);
      expect(rows.every((r) => r.subject_id === first.data.id)).toBe(true);
    });

    it('rolls the audit row back with the transaction', async () => {
      const layoutId = newLayoutId();
      await expect(
        dbHandle.db.transaction(async (tx) => {
          const row = await insertDraft(tx, { workspaceId: WORKSPACE_ID, layoutId, document: layoutFixture(layoutId), actorId: admin.id });
          await recordDraft({ tx, actor: { actor_id: admin.id, workspace_id: WORKSPACE_ID, role_level: 'admin' }, type: 'created', subjectId: row.id, layoutId, version: 1, summary: 'rollback probe' });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await count('layout_draft', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(0);
      expect((await auditRows('eqv_layout')).filter((r) => r.detail.layoutId === layoutId)).toHaveLength(0);
    });
  });

  describe('publishRevision', () => {
    it('publishes the draft the author saw as an immutable Revision (hash of the validated layout)', async () => {
      const layoutId = await createDraft();
      const answer = await act('eqv.publishRevision', { layoutId }, { expectedVersion: '1' });
      expect(answer).toMatchObject({ outcome: 'ok', version: '1', data: { layoutId, created: true } });
      expect(answer.data.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(JSON.stringify(answer.data)).not.toContain('components');
      const row = await read('eqv.layoutRevision', { layoutId, revision: answer.data.revision });
      expect(row).toMatchObject({ outcome: 'ok', data: { id: answer.data.id, layoutId, revision: answer.data.revision } });
      expect((await read('eqv.layoutRevisions', { layoutId })).data.rows).toHaveLength(1);
    });

    it('is idempotent on the same hash: ok with the existing Revision, one row, one audit row', async () => {
      const layoutId = await createDraft();
      const first = await act('eqv.publishRevision', { layoutId }, { expectedVersion: '1' });
      const again = await act('eqv.publishRevision', { layoutId }, { expectedVersion: '1' });
      expect(again).toMatchObject({ outcome: 'ok', data: { id: first.data.id, revision: first.data.revision, created: false } });
      expect(await count('layout_revision', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(1);
      expect((await auditRows('eqv_layout_revision', 'eqv.layout.revision_published')).filter((r) => r.detail.layoutId === layoutId)).toHaveLength(1);
    });

    it('answers conflict for a draft version the author did not see, and not_found without a draft', async () => {
      const layoutId = await createDraft();
      await act('eqv.saveDraft', { layoutId, document: layoutFixture(layoutId) }, { expectedVersion: '1' });
      expect(await act('eqv.publishRevision', { layoutId }, { expectedVersion: '1' })).toMatchObject({ outcome: 'conflict', version: '2' });
      expect(await count('layout_revision', 'workspace_id = $1 and layout_id = $2', [WORKSPACE_ID, layoutId])).toBe(0);
      expect((await act('eqv.publishRevision', { layoutId: newLayoutId() }, { expectedVersion: '1' })).outcome).toBe('not_found');
    });
  });

  describe('promoteTemplate', () => {
    it('promotes a published Revision to a Template, with the audit row and the source pointer', async () => {
      const [layoutId, revision] = await publishOne();
      const templateId = `${TAG}-tpl`;
      const answer = await act('eqv.promoteTemplate', { layoutId, revision, templateId, name: 'My template' });
      expect(answer).toMatchObject({ outcome: 'ok', data: { templateId } });
      const detail = await read('eqv.template', { templateId });
      expect(detail.data).toMatchObject({ templateId, name: 'My template', promotedFromLayoutId: layoutId, promotedFromRevision: revision });
      expect(detail.data.document).toMatchObject({ kind: 'template', id: templateId, promotedFrom: { layoutId, layoutRevision: revision } });
      expect((await read('eqv.templates', {})).data.rows.map((r: { templateId: string }) => r.templateId)).toContain(templateId);
      const rows = (await auditRows('eqv_template')).filter((r) => r.detail.templateId === templateId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ event_type: 'eqv.template.promoted', subject_id: answer.data.id, detail: { templateId, layoutId, revision } });
    });

    it('refuses a bundled Template id, a duplicate id, an unknown Revision and a draft-only layout', async () => {
      const [layoutId, revision] = await publishOne();
      expect(await act('eqv.promoteTemplate', { layoutId, revision, templateId: 'cluster-single', name: 'x' })).toMatchObject({
        outcome: 'invalid',
        fieldErrors: [{ path: ['templateId'], code: 'bundled_template_id' }],
      });
      const templateId = `${TAG}-dup`;
      expect((await act('eqv.promoteTemplate', { layoutId, revision, templateId, name: 'one' })).outcome).toBe('ok');
      expect(await act('eqv.promoteTemplate', { layoutId, revision, templateId, name: 'two' })).toMatchObject({
        outcome: 'invalid',
        fieldErrors: [{ path: ['templateId'], code: 'duplicate' }],
      });
      expect(await act('eqv.promoteTemplate', { layoutId, revision: `sha256:${'b'.repeat(64)}`, templateId: `${TAG}-none`, name: 'x' })).toMatchObject({
        outcome: 'invalid',
        fieldErrors: [{ path: ['revision'], code: 'not_found' }],
      });
      const draftOnly = await createDraft();
      expect((await act('eqv.promoteTemplate', { layoutId: draftOnly, revision, templateId: `${TAG}-nodraft`, name: 'x' })).outcome).toBe('invalid');
      expect(await count('template', 'workspace_id = $1 and template_id = any($2)', [WORKSPACE_ID, [`${TAG}-none`, `${TAG}-nodraft`, 'cluster-single']])).toBe(0);
    });
  });

  describe('reads', () => {
    it('lists drafts and answers empty for an unknown draft', async () => {
      const layoutId = await createDraft();
      const list = await read('eqv.layouts', {});
      expect(list.data.rows.map((r: { layoutId: string }) => r.layoutId)).toContain(layoutId);
      const draft = await read('eqv.layoutDraft', { layoutId });
      expect(draft).toMatchObject({ outcome: 'ok', data: { layoutId, version: '1' } });
      expect((await read('eqv.layoutDraft', { layoutId: newLayoutId() })).outcome).toBe('empty');
    });

    it('answers a bad id as an error, not an empty page', async () => {
      expect((await read('eqv.layoutDraft', { layoutId: 'Bad Id' })).outcome).toBe('error');
    });

    it('equipment options answer exactly { options: [{ id, label, dataRange: null }] }', async () => {
      const modelId = randomUUID();
      await sql('insert into eqv.equipment (workspace_id, equipment_id, label, model_id) values ($1, $2, $3, $4)', [WORKSPACE_ID, `${TAG}-eq1`, 'Synthetic one', modelId]);
      const answer = await read('eqv.equipment-options', {}, viewer);
      expect(answer.outcome).toBe('ok');
      expect(Object.keys(answer.data)).toEqual(['options']);
      const mine = (answer.data.options as { id: string }[]).filter((o) => o.id.startsWith(TAG));
      expect(mine).toEqual([{ id: `${TAG}-eq1`, label: 'Synthetic one', dataRange: null }]);
    });
  });

  describe('permission wall: Revisions and Templates cannot change', () => {
    it('platform_app can neither update nor delete a Revision or a Template, and cannot change a draft identity', async () => {
      const [layoutId, revision] = await publishOne();
      const templateId = `${TAG}-wall`;
      await act('eqv.promoteTemplate', { layoutId, revision, templateId, name: 'wall' });
      const run = (text: string, params: unknown[]) => dbHandle.pool.query(text, params);
      await expect(run(`update eqv.layout_revision set document = '{}'::jsonb where workspace_id = $1 and layout_id = $2`, [WORKSPACE_ID, layoutId])).rejects.toThrow(/permission denied/);
      await expect(run(`delete from eqv.layout_revision where workspace_id = $1 and layout_id = $2`, [WORKSPACE_ID, layoutId])).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.template set name = 'x' where workspace_id = $1 and template_id = $2`, [WORKSPACE_ID, templateId])).rejects.toThrow(/permission denied/);
      await expect(run(`delete from eqv.template where workspace_id = $1 and template_id = $2`, [WORKSPACE_ID, templateId])).rejects.toThrow(/permission denied/);
      await expect(run(`update eqv.layout_draft set layout_id = 'moved' where workspace_id = $1 and layout_id = $2`, [WORKSPACE_ID, layoutId])).rejects.toThrow(/permission denied/);
      await expect(run(`insert into eqv.equipment (workspace_id, equipment_id, label, model_id) values ($1, 'x', 'x', $2)`, [WORKSPACE_ID, randomUUID()])).rejects.toThrow(/permission denied/);
    });
  });
});
