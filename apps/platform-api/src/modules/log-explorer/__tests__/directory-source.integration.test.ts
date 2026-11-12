import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { sourceAssemblyFromEnv } from '../source-assembly.js';

const APP = process.env.DATABASE_URL ?? ''; const MIGRATE = process.env.DATABASE_URL_MIGRATE ?? ''; const WS = process.env.WORKSPACE_ID ?? '';
const tag = `SRC${randomUUID().slice(0, 8)}`;
const BODY = 'synthetic first\nsynthetic evidence row\nsynthetic third\n';
const SHA = createHash('sha256').update(BODY).digest('hex');
const SET = { sourceOwner: 'fixture-owner', files: [{ fileRef: 'sample.log', order: 1, sha256: SHA }, { fileRef: 'second.log', order: 2, sha256: SHA }] };

describe.skipIf(!(APP && MIGRATE && WS))('directory Source HTTP with registered Round manifest', () => {
  let db: DbHandle; let migrate: DbHandle; let app: FastifyInstance;
  let root = ''; let grantFile = ''; let reader = ''; let admin = ''; let stranger = ''; let cookie = ''; let otherCookie = '';
  let vendor = ''; let model = ''; let project = ''; let round = ''; let otherRound = '';
  let revokeDuringRead = false;
  const sql = (query: string, args: unknown[] = []) => migrate.pool.query(query, args);
  const grant = () => writeFile(grantFile, JSON.stringify([{ workspaceId: WS, actorId: reader, sourceOwner: SET.sourceOwner }]));
  const request = async (extra: Record<string, unknown> = {}, session = cookie) => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${session}` }, payload: { endpoint: 'logExplorer.window', context: {}, params: { sourceOwner: SET.sourceOwner, roundId: round, fileRef: SET.files[0]?.fileRef, line: 2, before: 1, after: 1, ...extra } } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<{ outcome: string; data: { state: string; reason: string | null; rows: { text: string; line: number; fileOrder: number }[] } }>();
  };
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; db = createDb(APP); migrate = createDb(MIGRATE);
    root = await mkdtemp(join(tmpdir(), 'source-http-')); grantFile = join(root, 'grants.json');
    await writeFile(join(root, 'sample.log'), BODY); await writeFile(join(root, 'second.log'), BODY);
    admin = (await insertActorRow(db, { workspaceId: WS, externalId: `${tag}-admin`, roleLevel: 'admin' })).id;
    reader = (await insertActorRow(db, { workspaceId: WS, externalId: `${tag}-reader`, roleLevel: 'developer' })).id;
    stranger = (await insertActorRow(db, { workspaceId: WS, externalId: `${tag}-other`, roleLevel: 'developer' })).id;
    await grantCapability(db, WS, reader, 'explorer.source.read', null, admin);
    await grantCapability(db, WS, stranger, 'explorer.source.read', null, admin);
    await grant();
    const assembly = sourceAssemblyFromEnv({ LOG_EXPLORER_SOURCE_PROVIDER: 'directory', LOG_EXPLORER_SOURCE_ROOTS: JSON.stringify({ [SET.sourceOwner]: root }), LOG_EXPLORER_SOURCE_GRANTS_FILE: grantFile });
    const port = assembly.sourceReadPort; if (!port) throw new Error('fixture_port_required');
    app = await buildServer({ config: loadConfig(), dbHandle: db, logExplorer: { sourceOwnerAccess: assembly.sourceOwnerAccess, sourceReadPort: { ...port, getWindow: async (input, ctx) => { const answer = await port.getWindow(input, ctx); if (revokeDuringRead) await writeFile(grantFile, '[]'); return answer; } } } });
    await app.ready(); cookie = await loginAs(app, `${tag}-reader`); otherCookie = await loginAs(app, `${tag}-other`);
    vendor = (await sql('insert into knowledge.vendor (workspace_id, created_by, updated_by, name, code, code_key) values ($1,$2,$2,$3,$3,$4) returning id', [WS, admin, `${tag}-v`, `${tag}-v`.toLowerCase()])).rows[0].id as string;
    model = (await sql('insert into knowledge.equipment_model (workspace_id, created_by, updated_by, name, code, code_key, vendor_id, active) values ($1,$2,$2,$3,$3,$4,$5,true) returning id', [WS, admin, `${tag}-m`, `${tag}-m`.toLowerCase(), vendor])).rows[0].id as string;
    project = (await sql("insert into log_lifecycle.development_project (workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,'new',$3,$3,$3) returning id", [WS, model, reader])).rows[0].id as string;
    for (const seq of [1, 2]) {
      const sampleSet = seq === 1 ? SET : { sourceOwner: SET.sourceOwner, files: [{ fileRef: 'different.log', order: 1, sha256: SHA }] };
      const id = (await sql("insert into log_lifecycle.validation_round (workspace_id, project_id, seq, stage, status, closed_at, closed_by, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,$3,'registered','closed',now(),$6,$4::jsonb,$5,$6,$6) returning id", [WS, project, seq, JSON.stringify(sampleSet), 'd'.repeat(64), reader])).rows[0].id as string;
      if (seq === 1) round = id; else otherRound = id;
    }
  }, 60_000);
  afterAll(async () => {
    if (app) await app.close();
    if (migrate) {
      await sql('delete from log_lifecycle.validation_round where project_id=$1', [project]);
      await sql('delete from log_lifecycle.development_project where id=$1', [project]);
      await sql('delete from knowledge.equipment_model where id=$1', [model]);
      await sql('delete from knowledge.vendor where id=$1', [vendor]);
      for (const [table, column] of [['core.audit_log', 'actor_id'], ['permission.permission_grants', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) await sql(`delete from ${table} where ${column} = any($1)`, [[reader, admin, stranger].filter(Boolean)]);
    }
    await db?.close(); await migrate?.close(); if (root) await rm(root, { recursive: true, force: true });
  });
  it('opens EvidenceRef file/line against the registered manifest, including the second file order', async () => {
    const evidence = { fileRef: 'sample.log', line: 2, fileSha256: SHA };
    expect(evidence.fileSha256).toBe(SET.files[0]?.sha256);
    expect((await request({ fileRef: evidence.fileRef, line: evidence.line })).data).toMatchObject({ state: 'ok', rows: [{ line: 1, text: 'synthetic first', fileOrder: 1 }, { line: 2, text: 'synthetic evidence row' }, { line: 3, text: 'synthetic third' }] });
    expect((await request({ fileRef: 'second.log' })).data.rows[0]?.fileOrder).toBe(2);
  });
  it.each([{ fileRef: 'unknown.log' }, { roundId: randomUUID() }, { sourceOwner: 'other-owner' }, { fileRef: '../sample.log' }])('does not disclose an unregistered location: %j', async extra => {
    const response = await request(extra); expect(response.data.rows).toEqual([]);
    expect(JSON.stringify(response)).not.toContain('synthetic evidence row');
  });
  it('does not open another Round manifest or an unbound window', async () => {
    expect((await request({ roundId: otherRound })).data).toMatchObject({ state: 'source_absent', reason: 'source_missing', rows: [] });
    expect((await request({ roundId: undefined })).data.rows).toEqual([]);
  });
  it('hides hash mismatch and missing files as source_missing, without auditing bodies or paths', async () => {
    await writeFile(join(root, 'sample.log'), 'replacement private body');
    expect((await request()).data).toMatchObject({ state: 'source_absent', reason: 'source_missing', rows: [] });
    await rm(join(root, 'sample.log'));
    expect((await request()).data).toMatchObject({ state: 'source_absent', reason: 'source_missing', rows: [] });
    await writeFile(join(root, 'sample.log'), BODY);
    const audits = (await sql("select detail from core.audit_log where actor_id=$1 and event_type='explorer.source.read'", [reader])).rows;
    expect(audits.length).toBeGreaterThan(0);
    for (const secret of [BODY, 'replacement private body', root, 'sample.log']) expect(JSON.stringify(audits)).not.toContain(secret);
  });
  it('requires the exact owner grant and honours revocation during a read and on the next request', async () => {
    expect((await request({}, otherCookie)).data).toMatchObject({ state: 'permission_denied', rows: [] });
    revokeDuringRead = true;
    try { expect((await request()).data).toMatchObject({ state: 'permission_denied', rows: [] }); }
    finally { revokeDuringRead = false; }
    expect((await request()).data).toMatchObject({ state: 'permission_denied', rows: [] });
    await grant(); expect((await request()).data.state).toBe('ok');
  });
});
