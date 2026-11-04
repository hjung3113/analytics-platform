// #1196 b2 — the model spec TSV text input through the real `buildServer` over `POST /api/v1/menu-action`
// against a real Postgres (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`). A text call and
// the equivalent structured call must store the same rows and publish the same `content_sha256`; streaming in
// chunks (each with its own header) must equal one call; a parse or planning error must leave the draft and its
// version untouched; the input contract (exactly one of rows or text, `format` provenance) and the capability
// wall are the structured path's own.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../domain/code-key.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `ITSV${randomUUID().slice(0, 6).toUpperCase()}`;
const DOC = { docLabel: 'Synthetic log spec', docVersion: 'v1' };

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  version: string | null;
  fieldErrors: { path: string[]; code: string }[];
}

const field = (name: string) => ({ name, type: 'float', unit: 'rpm', description: `${name} value` });
/** The structured equivalent of `FULL_TSV` below (the b1 suite's CONTENT shape). */
const CONTENT = {
  modules: [{ name: 'Spindle' }, { name: 'Spindle Motor', parentModule: 'spindle' }],
  events: [
    { module: 'Spindle', name: 'Start', fields: [field('speed')], triggerRule: 'on start' },
    { module: 'Spindle Motor', name: 'Run', fields: [] },
    { module: 'Spindle Motor', name: 'Stop', fields: [field('speed')] },
  ],
  relations: [
    { sourceModule: 'Spindle', sourceEvent: 'Start', predicate: 'precedes', targetModule: 'Spindle Motor', targetEvent: 'Run' },
    { sourceModule: 'Spindle Motor', sourceEvent: 'Run', predicate: 'precedes', targetModule: 'Spindle Motor', targetEvent: 'Stop', ruleRef: 'sec 4' },
  ],
};

const T = (...cells: string[]) => cells.join('\t');
const TSV_HEADER = T('kind', 'module', 'parent_module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json', 'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref');
const TSV_MODULES = [T('module', 'Spindle'), T('module', 'Spindle Motor', 'Spindle')].join('\n');
const TSV_EVENTS = [
  T('event', 'Spindle', '', 'Start', 'on start', '', JSON.stringify([field('speed')])),
  T('event', 'Spindle Motor', '', 'Run'),
  T('event', 'Spindle Motor', '', 'Stop', '', '', JSON.stringify([field('speed')])),
].join('\n');
const TSV_RELATIONS = [
  T('relation', '', '', '', '', '', '', 'Spindle', 'Start', 'precedes', 'Spindle Motor', 'Run'),
  T('relation', '', '', '', '', '', '', 'Spindle Motor', 'Run', 'precedes', 'Spindle Motor', 'Stop', 'sec 4'),
].join('\n');
const FULL_TSV = [TSV_HEADER, TSV_MODULES, TSV_EVENTS, TSV_RELATIONS].join('\n');

describe.skipIf(!runIntegration)('model spec TSV text input (#1196 b2)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let vendorId = '';
  const actorIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join(':')}:${e.code}`);

  async function person(roleLevel: 'admin' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(
    action: string,
    input: Record<string, unknown>,
    opts: { who?: Person; expectedVersion?: string } = {},
  ): Promise<Answer> {
    const who = opts.who ?? admin;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logKnowledge.${action}`,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0].id as string;
  async function newModel(label: string): Promise<string> {
    const code = `${TAG}-${label}`;
    return one(
      `insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id`,
      [WORKSPACE_ID, vendorId, code, toCodeKey(code), admin.id],
    );
  }
  async function newDraft(model: string) {
    const a = await act('specDraftCreate', { modelId: model, sourceDocRef: DOC });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.revisionId as string, version: a.data.version as string };
  }
  /** A draft whose one save call carried `text` in the given format. */
  async function filledText(model: string, format: 'tsv' | 'paste') {
    const draft = await newDraft(model);
    const saved = await act('specDraftSave', { revisionId: draft.id, mode: 'append', text: FULL_TSV, format }, { expectedVersion: draft.version });
    expect(saved.outcome, JSON.stringify(saved)).toBe('ok');
    return { id: draft.id, version: saved.version as string };
  }
  const counts = async (id: string) =>
    Object.fromEntries(
      await Promise.all(
        ['spec_module', 'spec_event', 'spec_event_relation'].map(async (t) => [
          t,
          Number((await sql(`select count(*)::int as n from knowledge.${t} where spec_rev_id = $1`, [id])).rows[0].n),
        ]),
      ),
    );
  const revisionRow = async (id: string) => (await sql('select * from knowledge.model_spec_revision where id = $1', [id])).rows[0] as Record<string, unknown>;
  const audit = async (id: string) =>
    (await sql('select event_type, detail from core.audit_log where subject_id = $1 order by created_at, id', [id]))
      .rows as { event_type: string; detail: Record<string, unknown> }[];

  // The suite sends far more writes than one actor's rate window allows; a 429 would hide the real assertion.
  beforeEach(async () => { await sql('delete from core.rate_limits'); });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    const vendorCode = `${TAG}-v`;
    vendorId = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [WORKSPACE_ID, vendorCode, toCodeKey(vendorCode), admin.id]);
  }, 60_000);

  afterAll(async () => {
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    await sql(`delete from knowledge.spec_event_relation where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`update knowledge.spec_module set parent_module_id = null where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.equipment_model where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.vendor where created_by = any($1)', [actorIds]);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('text (tsv and paste) and the equivalent structured rows store the same rows and publish the same hash', async () => {
    const structured = await newDraft(await newModel('rows'));
    const structuredSaved = await act('specDraftSave', { revisionId: structured.id, mode: 'append', ...CONTENT }, { expectedVersion: structured.version });
    expect(structuredSaved.outcome, JSON.stringify(structuredSaved)).toBe('ok');
    const tsv = await filledText(await newModel('tsv'), 'tsv');
    const paste = await filledText(await newModel('paste'), 'paste');
    expect(await counts(tsv.id)).toEqual({ spec_module: 2, spec_event: 3, spec_event_relation: 2 });
    expect(await counts(tsv.id)).toEqual(await counts(structured.id));
    const published = await Promise.all(
      [structuredSaved.version as string, tsv.version, paste.version].map(async (version, i) => {
        const revisionId = [structured.id, tsv.id, paste.id][i] as string;
        return (await act('specPublish', { revisionId }, { expectedVersion: version })).data.contentSha256 as string;
      }),
    );
    expect(published[1]).toBe(published[0]);
    expect(published[2]).toBe(published[0]);
    expect(published[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('streaming in two chunks, each with its own header row, equals one call', async () => {
    const one = await filledText(await newModel('one'), 'tsv');
    const split = await newDraft(await newModel('split'));
    const first = await act('specDraftSave', { revisionId: split.id, mode: 'append', text: [TSV_HEADER, TSV_MODULES, TSV_EVENTS].join('\n'), format: 'tsv' }, { expectedVersion: split.version });
    expect(first.outcome, JSON.stringify(first)).toBe('ok');
    const second = await act('specDraftSave', { revisionId: split.id, mode: 'append', text: [TSV_HEADER, TSV_RELATIONS].join('\n'), format: 'tsv' }, { expectedVersion: first.version as string });
    expect(second.outcome, JSON.stringify(second)).toBe('ok');
    const a = await act('specPublish', { revisionId: one.id }, { expectedVersion: one.version });
    const b = await act('specPublish', { revisionId: split.id }, { expectedVersion: second.version as string });
    expect(b.data.contentSha256).toBe(a.data.contentSha256);
  });

  it('a parse error answers row-numbered field errors and leaves the draft, its version and the audit untouched', async () => {
    const draft = await newDraft(await newModel('parse'));
    const bad = [TSV_HEADER, TSV_MODULES, T('thing', 'X'), T('module', 'A', '', '', '', '', '', 'X')].join('\n');
    const a = await act('specDraftSave', { revisionId: draft.id, mode: 'append', text: bad, format: 'tsv' }, { expectedVersion: draft.version });
    expect(a.outcome, JSON.stringify(a)).toBe('invalid');
    expect(fe(a)).toEqual(['text:line 4:column kind:unknown_value', 'text:line 5:column source_module:unexpected_value']);
    expect(await counts(draft.id)).toEqual({ spec_module: 0, spec_event: 0, spec_event_relation: 0 });
    expect(await revisionRow(draft.id)).toMatchObject({ state: 'draft', row_version: 1 });
    expect(await audit(draft.id)).toHaveLength(1); // the create only
  });

  // #1196 fix C2: an inherited object key as the `kind` cell is an unknown_value (HTTP 200, `invalid`), never a 500.
  it('a prototype-property kind cell is an unknown_value, not a server error', async () => {
    const draft = await newDraft(await newModel('proto'));
    const bad = [TSV_HEADER, T('constructor', 'X')].join('\n');
    const a = await act('specDraftSave', { revisionId: draft.id, mode: 'append', text: bad, format: 'tsv' }, { expectedVersion: draft.version });
    expect(a.outcome, JSON.stringify(a)).toBe('invalid');
    expect(fe(a)).toEqual(['text:line 2:column kind:unknown_value']);
    expect(await counts(draft.id)).toEqual({ spec_module: 0, spec_event: 0, spec_event_relation: 0 });
  });

  it('a planning error of a text call is numbered by its line and column', async () => {
    const draft = await newDraft(await newModel('plan'));
    // line 4: an event whose module is nowhere in the call or the draft
    const bad = [TSV_HEADER, TSV_MODULES, T('event', 'Nowhere', '', 'E')].join('\n');
    const a = await act('specDraftSave', { revisionId: draft.id, mode: 'append', text: bad, format: 'tsv' }, { expectedVersion: draft.version });
    expect(fe(a)).toEqual(['text:line 4:column module:not_found']);
    expect(await revisionRow(draft.id)).toMatchObject({ state: 'draft', row_version: 1 });
  });

  it('the input contract: rows and text together, and neither, are input:rows_or_text; text needs its format', async () => {
    const draft = await newDraft(await newModel('contract'));
    const save = (input: Record<string, unknown>) => act('specDraftSave', { revisionId: draft.id, mode: 'append', ...input }, { expectedVersion: draft.version });
    expect(fe(await save({ ...CONTENT, text: FULL_TSV, format: 'tsv' }))).toEqual(['input:rows_or_text']);
    expect(fe(await save({}))).toEqual(['input:rows_or_text']);
    expect(fe(await save({ text: FULL_TSV }))).toEqual(['format:required']);
    expect(fe(await save({ ...CONTENT, format: 'tsv' }))).toEqual(['text:required']);
    expect(await revisionRow(draft.id)).toMatchObject({ state: 'draft', row_version: 1 });
  });

  it('a user without the capability is refused, and nothing is written', async () => {
    const draft = await newDraft(await newModel('perm'));
    const a = await act('specDraftSave', { revisionId: draft.id, mode: 'append', text: FULL_TSV, format: 'tsv' }, { who: user, expectedVersion: draft.version });
    expect(a.outcome).toBe('forbidden');
    expect(await counts(draft.id)).toEqual({ spec_module: 0, spec_event: 0, spec_event_relation: 0 });
  });

  it('the audit row records the input provenance and never the text', async () => {
    const tsv = await filledText(await newModel('audittsv'), 'tsv');
    const paste = await filledText(await newModel('auditpaste'), 'paste');
    const tsvTrail = await audit(tsv.id);
    expect(tsvTrail.at(-1)?.detail).toMatchObject({ mode: 'append', input: 'tsv', added: { modules: 2, events: 3, relations: 2 } });
    const pasteTrail = await audit(paste.id);
    expect(pasteTrail.at(-1)?.detail).toMatchObject({ mode: 'append', input: 'paste' });
    const details = [...tsvTrail, ...pasteTrail].map((row) => JSON.stringify(row.detail)).join('');
    for (const forbidden of ['Spindle', 'on start', 'speed', '\t']) expect(details).not.toContain(forbidden);
  });
});
