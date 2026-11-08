// #1493 (log-rules R-c) — `knowledgeLookup.listEffectiveRequirements` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`). The port runs as platform_app; fixtures as platform_migrate.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { toCodeKey } from '../domain/code-key.js';
import { knowledgeLookup } from '../knowledge-lookup.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `RQK${randomUUID().slice(0, 6).toUpperCase()}`;
const DOC = JSON.stringify({ docLabel: 'Synthetic log spec', docVersion: 'v1' });

describe.skipIf(!runIntegration)('effective requirement keys (#1493)', () => {
  let app: DbHandle;
  let migrate: DbHandle;
  let actorId = '';
  let other = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0].id as string;
  const read = (workspace: string, model: string, software: string | null) =>
    app.db.transaction((tx) => knowledgeLookup.listEffectiveRequirements(tx, workspace, model, software, actorId));
  const pin = (workspace: string, model: string, software: string | null) =>
    app.db.transaction((tx) => knowledgeLookup.getEffectiveSpecPin(tx, workspace, model, software, actorId));
  const keysOf = (r: { requirements: { key: string }[] }) => r.requirements.map((x) => x.key);

  const catalog = (table: string, workspace: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: workspace, code, code_key: toCodeKey(code), name: code, created_by: actorId, updated_by: actorId, ...extra };
    return one(
      `insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, n) => `$${n + 1}`).join(',')}) returning id`,
      Object.values(cols),
    );
  };
  const model = async (workspace: string, vendor: string, name: string) => catalog('equipment_model', workspace, `${TAG}-${name}`, { vendor_id: vendor });
  const software = (workspace: string, modelId: string, label: string) =>
    one(
      `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`,
      [workspace, modelId, label, toCodeKey(label), actorId],
    );
  const publish = async (workspace: string, modelId: string, no: number, modules: string[], events: [string, string][]) => {
    const rev = await one(
      `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,$3,'draft',$4::jsonb,1,$5) returning id`,
      [workspace, modelId, no, DOC, actorId],
    );
    const moduleIds: Record<string, string> = {};
    for (const key of modules) {
      moduleIds[key] = await one(`insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name) values ($1,$2,$3,$4) returning id`, [workspace, rev, key, `Module ${key}`]);
    }
    for (const [moduleKey, eventKey] of events) {
      await sql(
        `insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json) values ($1,$2,$3,$4,$5,'[]'::jsonb)`,
        [workspace, rev, moduleIds[moduleKey], eventKey, `Event ${eventKey}`],
      );
    }
    await sql(
      `update knowledge.model_spec_revision set state = 'published', content_sha256 = $2, published_by = $3, published_at = now() where id = $1`,
      [rev, String(no).padStart(64, '0'), actorId],
    );
    return rev;
  };
  const change = (
    workspace: string,
    modelId: string,
    softwareId: string,
    kind: 'event' | 'module',
    targetKey: string,
    changeKind: 'added' | 'removed',
    body: Record<string, unknown>,
    endsBefore: string | null = null,
  ) =>
    one(
      `insert into knowledge.spec_sw_change (workspace_id, model_id, software_id, target_kind, target_key, change_kind, change_json, note, based_on_rev_no, created_by, ends_before_software_id)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,'n',1,$8,$9) returning id`,
      [workspace, modelId, softwareId, kind, targetKey, changeKind, JSON.stringify(body), actorId, endsBefore],
    );

  let vendor = '';
  let vendorOther = '';

  beforeAll(async () => {
    app = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    actorId = (await insertActorRow(app, { workspaceId: WORKSPACE_ID, externalId: `${TAG}-admin`, roleLevel: 'admin' })).id;
    actorIds.push(actorId);
    other = await one('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`]);
    workspaceIds.push(other);
    vendor = await catalog('vendor', WORKSPACE_ID, `${TAG}-v`);
    vendorOther = await catalog('vendor', other, `${TAG}-vo`);
  }, 60_000);

  afterAll(async () => {
    const both = [WORKSPACE_ID, other];
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    await sql('delete from knowledge.spec_sw_change where created_by = any($1)', [actorIds]);
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    for (const table of ['software_version', 'equipment_model', 'vendor']) {
      await sql(`delete from knowledge.${table} where workspace_id = any($1) and created_by = any($2)`, [both, actorIds]);
    }
    for (const [table, column] of [['core.sessions', 'actor_id'], ['core.actors', 'id']]) await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await migrate?.close();
  });

  it('ok: module keys then event keys of the published revision, as stored, with the pin of that revision', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'ok');
    const rev = await publish(WORKSPACE_ID, m, 1, ['SPINDLE', 'AXIS'], [['SPINDLE', 'START'], ['AXIS', 'HOME'], ['AXIS', 'MOVE']]);
    const r = await read(WORKSPACE_ID, m, null);
    expect(r.state).toBe('ok');
    expect(keysOf(r)).toEqual(['AXIS', 'SPINDLE', 'AXIS/HOME', 'AXIS/MOVE', 'SPINDLE/START']);
    expect(r.requirements.find((x) => x.key === 'AXIS/HOME')).toEqual({ key: 'AXIS/HOME', kind: 'event', moduleKey: 'AXIS', eventKey: 'HOME' });
    expect(r.requirements[0]).toEqual({ key: 'AXIS', kind: 'module', moduleKey: 'AXIS' });
    expect(r.specPin?.revisionId).toBe(rev);
    expect(await read(WORKSPACE_ID, m, null)).toEqual(r);
  });

  it('no_spec: a model with no published revision is never an empty ok; a draft does not count', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'nospec');
    expect(await read(WORKSPACE_ID, m, null)).toEqual({ state: 'no_spec', specPin: null, requirements: [] });
    await sql(
      `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,1,'draft',$3::jsonb,1,$4)`,
      [WORKSPACE_ID, m, DOC, actorId],
    );
    expect((await read(WORKSPACE_ID, m, null)).state).toBe('no_spec');
  });

  it('model_unknown: unknown model, model of another workspace, software of another model', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'mu');
    const m2 = await model(WORKSPACE_ID, vendor, 'mu2');
    await publish(WORKSPACE_ID, m, 1, ['A'], []);
    const foreign = await model(other, vendorOther, 'mf');
    await publish(other, foreign, 1, ['F'], []);
    const sw2 = await software(WORKSPACE_ID, m2, 'v1');
    const gone = { state: 'model_unknown', specPin: null, requirements: [] };
    expect(await read(WORKSPACE_ID, randomUUID(), null)).toEqual(gone);
    expect(await read(WORKSPACE_ID, foreign, null)).toEqual(gone); // asked in our workspace
    expect(await read(other, m, null)).toEqual(gone); // the other workspace asking for our model
    expect(await read(WORKSPACE_ID, m, sw2)).toEqual(gone); // software of another model
    expect(await read(WORKSPACE_ID, m, randomUUID())).toEqual(gone);
    expect(keysOf(await read(other, foreign, null))).toEqual(['F']);
  });

  it('a software change that adds or removes an event makes the effective set differ from the base revision, and the pin agrees with getEffectiveSpecPin', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'sw');
    const rev = await publish(WORKSPACE_ID, m, 1, ['SPINDLE'], [['SPINDLE', 'START'], ['SPINDLE', 'STOP']]);
    const sw1 = await software(WORKSPACE_ID, m, 'v1');
    const sw2 = await software(WORKSPACE_ID, m, 'v2');
    const sw3 = await software(WORKSPACE_ID, m, 'v3');
    await change(WORKSPACE_ID, m, sw2, 'event', 'SPINDLE/STOP', 'removed', { before: { name: 'Event STOP' } }, sw3);
    await change(WORKSPACE_ID, m, sw2, 'event', 'SPINDLE/COOL', 'added', { after: { name: 'Cool' } });
    await change(WORKSPACE_ID, m, sw2, 'module', 'LUBE', 'added', { after: { name: 'Lube' } });
    const base = await read(WORKSPACE_ID, m, null);
    expect(keysOf(base)).toEqual(['SPINDLE', 'SPINDLE/START', 'SPINDLE/STOP']);
    expect(keysOf(await read(WORKSPACE_ID, m, sw1))).toEqual(keysOf(base));
    const at2 = await read(WORKSPACE_ID, m, sw2);
    expect(keysOf(at2)).toEqual(['SPINDLE', 'LUBE', 'SPINDLE/START', 'SPINDLE/COOL']);
    expect(at2.requirements.find((x) => x.key === 'SPINDLE/COOL')).toMatchObject({ kind: 'event', moduleKey: 'SPINDLE', eventKey: 'COOL' });
    // the removal ends before sw3 but the additions have no end: sw3 keeps COOL and LUBE and gets STOP back
    expect(keysOf(await read(WORKSPACE_ID, m, sw3))).toEqual(['SPINDLE', 'LUBE', 'SPINDLE/START', 'SPINDLE/STOP', 'SPINDLE/COOL']);
    for (const sw of [null, sw1, sw2, sw3]) {
      const r = await read(WORKSPACE_ID, m, sw);
      expect(r.specPin).toEqual(await pin(WORKSPACE_ID, m, sw));
      expect(r.specPin?.revisionId).toBe(rev);
    }
    expect(at2.specPin?.changeSetDigest).not.toBe(base.specPin?.changeSetDigest);
  });

  it('pin and keys are one snapshot: a change committed while the read waits on the model lock is in both', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'snap');
    await publish(WORKSPACE_ID, m, 1, ['M'], [['M', 'E1']]);
    const sw = await software(WORKSPACE_ID, m, 'v1');
    const before = await read(WORKSPACE_ID, m, sw);
    expect(keysOf(before)).toEqual(['M', 'M/E1']);

    const writer = await migrate.pool.connect();
    try {
      await writer.query('begin');
      await writer.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`spec-change:${WORKSPACE_ID.toLowerCase()}:${m.toLowerCase()}`]);
      const pending = read(WORKSPACE_ID, m, sw); // blocks on the lock the writer holds
      await new Promise((resolve) => setTimeout(resolve, 300));
      await writer.query(
        `insert into knowledge.spec_sw_change (workspace_id, model_id, software_id, target_kind, target_key, change_kind, change_json, note, based_on_rev_no, created_by)
         values ($1,$2,$3,'event','M/E2','added','{"after":{"name":"E2"}}'::jsonb,'n',1,$4)`,
        [WORKSPACE_ID, m, sw, actorId],
      );
      await writer.query('commit');
      const after = await pending;
      expect(keysOf(after)).toEqual(['M', 'M/E1', 'M/E2']);
      expect(after.specPin).toEqual(await pin(WORKSPACE_ID, m, sw));
      expect(after.specPin?.changeSetDigest).not.toBe(before.specPin?.changeSetDigest);
    } finally {
      writer.release();
    }
  });

  const waitForBlockedLockWaiter = async () => {
    for (let i = 0; i < 100; i += 1) {
      const waiting = await sql(`select 1 from pg_locks where locktype = 'advisory' and not granted limit 1`);
      if (waiting.rowCount) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('the reader never blocked on the model lock');
  };

  it('reads the software release order after the model lock: a reorder committed while it waits is honoured (review C1)', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'reorder');
    await publish(WORKSPACE_ID, m, 1, ['M'], [['M', 'E1']]);
    const sw1 = await software(WORKSPACE_ID, m, 'v1');
    const sw2 = await software(WORKSPACE_ID, m, 'v2');
    await change(WORKSPACE_ID, m, sw2, 'event', 'M/E2', 'added', { after: { name: 'E2' } }); // starts at sw2 (order 2)
    expect(keysOf(await read(WORKSPACE_ID, m, sw2))).toEqual(['M', 'M/E1', 'M/E2']);
    const writer = await migrate.pool.connect();
    try {
      await writer.query('begin');
      await writer.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`spec-change:${WORKSPACE_ID.toLowerCase()}:${m.toLowerCase()}`]);
      const pending = read(WORKSPACE_ID, m, sw2); // blocks on the lock the writer holds
      await waitForBlockedLockWaiter();
      await writer.query('update knowledge.software_version set release_order = 3 where id = $1', [sw2]); // the change still starts at sw2
      await writer.query('commit');
      const after = await pending;
      expect(keysOf(after)).toEqual(['M', 'M/E1', 'M/E2']);
      expect(after.specPin).toEqual(await pin(WORKSPACE_ID, m, sw2));
      expect(keysOf(await read(WORKSPACE_ID, m, sw1))).toEqual(['M', 'M/E1']);
    } finally {
      writer.release();
    }
  });

  it('a pool-backed handle is wrapped in one transaction of its own; a transaction handle is used as is (review C2)', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'pooled');
    await publish(WORKSPACE_ID, m, 1, ['M'], [['M', 'E1']]);
    const spy = vi.spyOn(app.db, 'transaction');
    try {
      expect(keysOf(await knowledgeLookup.listEffectiveRequirements(app.db, WORKSPACE_ID, m, null, actorId))).toEqual(['M', 'M/E1']); // `Db`, not a transaction
      expect(spy).toHaveBeenCalledTimes(1); // the model lock and every read ran inside that one transaction
      spy.mockClear();
      expect(keysOf(await read(WORKSPACE_ID, m, null))).toEqual(['M', 'M/E1']); // already a transaction: one wrapper (the helper's), none added
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('ambiguous_key: a key with "/" in the effective spec is refused with the offending keys, not returned', async () => {
    const m = await model(WORKSPACE_ID, vendor, 'amb');
    await publish(WORKSPACE_ID, m, 1, ['A'], [['A', 'B']]);
    const sw = await software(WORKSPACE_ID, m, 'v1');
    await change(WORKSPACE_ID, m, sw, 'event', 'A/C%2FD', 'added', { after: { name: 'slash' } });
    const r = await read(WORKSPACE_ID, m, sw);
    expect(r).toMatchObject({ state: 'ambiguous_key', requirements: [], ambiguousKeys: ['A/C/D'] });
    expect((await read(WORKSPACE_ID, m, null)).state).toBe('ok');
  });
});
