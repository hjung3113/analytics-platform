// Integration tests for the startup sync of registry-owned Managed Systems (#1289 node i, ADR-0110 decision 5):
// idempotency, the uniqueness/adoption rules, the no-permission link table, reserved external_key protection and
// archive refusal. Sync cases run in throwaway workspaces (isolation); HTTP cases run in WORKSPACE_ID and clean up.
//
// Needs migration 0086 (core.space_links, managed_systems_registry_key_active_uq).

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import type { JobLog } from '../../../lib/job-log.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { createAuditService } from '../../core/audit/index.js';
import { createPlatformSystemsSync } from '../platform-systems-sync.js';
import { platformManagedSystemId } from '../read-projections.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

type Declared = Array<{ space_id: string; name: string }>;

function recordingLog() {
  const lines: Array<{ level: 'info' | 'warn' | 'error'; msg: string; meta?: Record<string, unknown> }> = [];
  const log: JobLog = {
    info: (msg, meta) => lines.push({ level: 'info', msg, ...(meta ? { meta } : {}) }),
    warn: (msg, meta) => lines.push({ level: 'warn', msg, ...(meta ? { meta } : {}) }),
    error: (msg, meta) => lines.push({ level: 'error', msg, ...(meta ? { meta } : {}) }),
  };
  return { log, lines };
}

async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const header = res.headers['set-cookie'];
  const arr = Array.isArray(header) ? header : header ? [header] : [];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  throw new Error(`mock-login failed: ${res.statusCode}`);
}

describe.skipIf(!runIntegration)('platform systems startup sync', () => {
  let appHandle: DbHandle;
  let ops: DbHandle;
  let dir: string;
  const workspaces: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appHandle = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'platform-systems-'));
  });

  afterAll(async () => {
    for (const ws of workspaces) {
      await ops.pool.query('delete from core.space_links where workspace_id = $1', [ws]);
      await ops.pool.query('delete from core.audit_log where workspace_id = $1', [ws]);
      await ops.pool.query('delete from core.managed_systems where workspace_id = $1', [ws]);
      await ops.pool.query('delete from core.actors where workspace_id = $1', [ws]);
      await ops.pool.query('delete from core.workspaces where id = $1', [ws]);
    }
    await rm(dir, { recursive: true, force: true });
    await appHandle?.close();
    await ops?.close();
  });

  async function newWorkspace(options: { systemActor?: boolean } = {}): Promise<string> {
    const id = randomUUID();
    workspaces.push(id);
    await ops.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [id, 'sync test']);
    if (options.systemActor !== false) await addSystemActor(id);
    return id;
  }

  async function addSystemActor(workspaceId: string): Promise<string> {
    const res = await ops.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, 'system', 'system@platform.local', 'System', 'admin', 'system') returning id`,
      [workspaceId],
    );
    return res.rows[0]?.id ?? '';
  }

  async function writeDeclaration(systems: Declared): Promise<string> {
    const path = join(dir, `${randomUUID()}.json`);
    await writeFile(path, JSON.stringify({ version: 1, systems }));
    return path;
  }

  function syncOf(workspaceId: string, filePath: string | undefined) {
    const rec = recordingLog();
    const sync = createPlatformSystemsSync({
      db: appHandle.db,
      auditService: createAuditService(),
      log: rec.log,
      workspaceId,
      filePath,
    });
    return { sync, ...rec };
  }

  const rows = async (workspaceId: string) =>
    (
      await ops.pool.query<{
        id: string;
        slug: string;
        name: string;
        external_key: string | null;
        archived_at: Date | null;
      }>(
        'select id, slug, name, external_key, archived_at from core.managed_systems where workspace_id = $1 order by slug',
        [workspaceId],
      )
    ).rows;
  const links = async (workspaceId: string) =>
    (
      await ops.pool.query<{ space_id: string; managed_system_id: string; declared: boolean }>(
        'select space_id, managed_system_id, declared from core.space_links where workspace_id = $1 order by space_id',
        [workspaceId],
      )
    ).rows;

  const DECLARED: Declared = [
    { space_id: 'mars', name: 'MARS' },
    { space_id: 'bravo', name: 'BRAVO' },
  ];

  it('registers 「플랫폼」 and each declared system with the system actor, links them, and a second run changes nothing', async () => {
    const ws = await newWorkspace();
    const file = await writeDeclaration(DECLARED);
    const first = await syncOf(ws, file).sync.run();
    expect(first.registered.sort()).toEqual(['bravo', 'mars', 'platform']);

    const afterFirst = await rows(ws);
    expect(afterFirst.map((r) => [r.slug, r.name, r.external_key])).toEqual([
      ['bravo', 'BRAVO', 'space:bravo'],
      ['mars', 'MARS', 'space:mars'],
      ['platform', '플랫폼', 'platform'],
    ]);
    expect(await links(ws)).toEqual([
      { space_id: 'bravo', managed_system_id: afterFirst[0]?.id, declared: true },
      { space_id: 'mars', managed_system_id: afterFirst[1]?.id, declared: true },
    ]);
    const audit = await ops.pool.query(
      `select a.event_type, a.detail, ac.external_id from core.audit_log a join core.actors ac on ac.id = a.actor_id
        where a.workspace_id = $1 and a.event_type = 'managed_system_registered' order by a.detail->>'slug'`,
      [ws],
    );
    expect(audit.rows.map((r) => [r.detail.slug, r.detail.external_key, r.external_id])).toEqual([
      ['bravo', 'space:bravo', 'system'],
      ['mars', 'space:mars', 'system'],
      ['platform', 'platform', 'system'],
    ]);

    const second = await syncOf(ws, file).sync.run();
    expect(second.registered).toEqual([]);
    expect(second.renamed).toEqual([]);
    expect(await rows(ws)).toEqual(afterFirst);
    const auditCount = await ops.pool.query(`select count(*)::int as n from core.audit_log where workspace_id = $1`, [ws]);
    expect(auditCount.rows[0]?.n).toBe(3);
  });

  it('the public-read 「플랫폼」 arm resolves exactly the synced id', async () => {
    const ws = await newWorkspace();
    await syncOf(ws, undefined).sync.run();
    const platform = (await rows(ws)).find((r) => r.slug === 'platform');
    expect(await platformManagedSystemId(appHandle.db, ws)).toBe(platform?.id);
  });

  it('a changed name is updated in place with a managed_system_updated audit row', async () => {
    const ws = await newWorkspace();
    await syncOf(ws, await writeDeclaration(DECLARED)).sync.run();
    const before = (await rows(ws)).find((r) => r.slug === 'mars');
    const result = await syncOf(ws, await writeDeclaration([{ space_id: 'mars', name: 'MARS 2' }, DECLARED[1] as Declared[number]])).sync.run();
    expect(result.renamed).toEqual(['mars']);
    const after = (await rows(ws)).find((r) => r.slug === 'mars');
    expect(after).toMatchObject({ id: before?.id, name: 'MARS 2' });
    const audit = await ops.pool.query(
      `select detail from core.audit_log where workspace_id = $1 and event_type = 'managed_system_updated'`,
      [ws],
    );
    expect(audit.rows[0]?.detail).toMatchObject({ managed_system_id: before?.id, changes: { name: { from: 'MARS', to: 'MARS 2' } } });
  });

  it('a manual row with the same slug and no registry key is reported and never adopted', async () => {
    const ws = await newWorkspace();
    await ops.pool.query(`insert into core.managed_systems (workspace_id, slug, name) values ($1, 'mars', 'Manual mars'), ($1, 'platform', 'Manual platform')`, [ws]);
    const { sync, lines } = syncOf(ws, await writeDeclaration(DECLARED));
    const result = await sync.run();
    expect(result.conflicts.sort()).toEqual(['mars', 'platform']);
    expect(result.registered).toEqual(['bravo']);
    const all = await rows(ws);
    expect(all.find((r) => r.slug === 'mars')).toMatchObject({ name: 'Manual mars', external_key: null });
    expect(all.find((r) => r.slug === 'platform')).toMatchObject({ name: 'Manual platform', external_key: null });
    expect(await platformManagedSystemId(appHandle.db, ws)).toBeNull();
    expect((await links(ws)).map((l) => l.space_id)).toEqual(['bravo']);
    expect(lines.filter((l) => l.level === 'warn' && l.msg.includes('slug unavailable')).length).toBe(2);
  });

  it('a single pre-existing row that already carries a registry-owned key is the row the sync keeps', async () => {
    const ws = await newWorkspace();
    await ops.pool.query(
      `insert into core.managed_systems (workspace_id, slug, name, external_key) values ($1, 'mars-old', 'Old name', 'space:mars')`,
      [ws],
    );
    await syncOf(ws, await writeDeclaration([{ space_id: 'mars', name: 'MARS' }])).sync.run();
    const all = await rows(ws);
    expect(all.filter((r) => r.external_key === 'space:mars')).toHaveLength(1);
    expect(all.find((r) => r.slug === 'mars-old')).toMatchObject({ name: 'MARS' });
    expect(all.find((r) => r.slug === 'mars')).toBeUndefined();
  });

  it('the database refuses a second active row with a registry-owned key, and archived rows do not count', async () => {
    const ws = await newWorkspace();
    await ops.pool.query(`insert into core.managed_systems (workspace_id, slug, name, external_key) values ($1, 'a', 'A', 'platform')`, [ws]);
    await expect(
      ops.pool.query(`insert into core.managed_systems (workspace_id, slug, name, external_key) values ($1, 'b', 'B', 'platform')`, [ws]),
    ).rejects.toMatchObject({ code: '23505' });
    await ops.pool.query(`insert into core.managed_systems (workspace_id, slug, name, external_key) values ($1, 'c', 'C', 'free-key'), ($1, 'd', 'D', 'free-key')`, [ws]);
    await ops.pool.query(`update core.managed_systems set archived_at = now() where workspace_id = $1 and slug = 'a'`, [ws]);
    await ops.pool.query(`insert into core.managed_systems (workspace_id, slug, name, external_key) values ($1, 'e', 'E', 'platform')`, [ws]);
  });

  it('a space that is declared again after its system was archived gets a fresh active row', async () => {
    const ws = await newWorkspace();
    const file = await writeDeclaration([{ space_id: 'mars', name: 'MARS' }]);
    await syncOf(ws, file).sync.run();
    const first = (await rows(ws)).find((r) => r.slug === 'mars');
    await ops.pool.query('update core.space_links set declared = false where workspace_id = $1', [ws]);
    await ops.pool.query('update core.managed_systems set archived_at = now() where id = $1', [first?.id]);
    await syncOf(ws, file).sync.run();
    const active = (await rows(ws)).filter((r) => r.slug === 'mars' && r.archived_at === null);
    expect(active).toHaveLength(1);
    expect(active[0]?.id).not.toBe(first?.id);
    expect(await links(ws)).toEqual([{ space_id: 'mars', managed_system_id: active[0]?.id, declared: true }]);
  });

  describe('declaration file states', () => {
    async function seeded() {
      const ws = await newWorkspace();
      await syncOf(ws, await writeDeclaration(DECLARED)).sync.run();
      const before = await links(ws);
      expect(before.every((l) => l.declared)).toBe(true);
      return { ws, before };
    }

    it('a space the valid file no longer lists is marked undeclared, never archived; a valid empty list undeclares all', async () => {
      const { ws } = await seeded();
      await syncOf(ws, await writeDeclaration([DECLARED[0] as Declared[number]])).sync.run();
      expect((await links(ws)).map((l) => [l.space_id, l.declared])).toEqual([
        ['bravo', false],
        ['mars', true],
      ]);
      expect((await rows(ws)).every((r) => r.archived_at === null)).toBe(true);
      const empty = await syncOf(ws, await writeDeclaration([])).sync.run();
      expect(empty.declaration).toBe('ok');
      expect((await links(ws)).every((l) => !l.declared)).toBe(true);
    });

    it.each([
      ['unset', undefined, 'absent'],
      ['missing', '/nonexistent/platform-systems.json', 'absent'],
    ] as const)('%s file leaves existing links untouched and still ensures 「플랫폼」', async (_label, path, kind) => {
      const { ws, before } = await seeded();
      await ops.pool.query(`update core.managed_systems set archived_at = now() where workspace_id = $1 and slug = 'platform'`, [ws]);
      const result = await syncOf(ws, path).sync.run();
      expect(result.declaration).toBe(kind);
      expect(await links(ws)).toEqual(before);
      expect((await rows(ws)).filter((r) => r.slug === 'platform' && r.archived_at === null)).toHaveLength(1);
    });

    it.each([
      ['not JSON', '{nope'],
      ['wrong shape', JSON.stringify({ version: 1, systems: [{ space_id: 'mars' }] })],
      ['wrong version', JSON.stringify({ version: 2, systems: [] })],
    ])('an invalid file (%s) logs one error, registers nothing from it and leaves links untouched', async (_label, content) => {
      const { ws, before } = await seeded();
      const path = join(dir, `${randomUUID()}.json`);
      await writeFile(path, content);
      const { sync, lines } = syncOf(ws, path);
      const result = await sync.run();
      expect(result.declaration).toBe('invalid');
      expect(result.registered).toEqual([]);
      expect(await links(ws)).toEqual(before);
      expect(lines.filter((l) => l.level === 'error')).toHaveLength(1);
      expect(JSON.stringify(lines)).not.toContain('nope');
    });

    it('an unreadable path (a directory) is an error state, not an empty declaration', async () => {
      const { ws, before } = await seeded();
      const result = await syncOf(ws, dir).sync.run();
      expect(result.declaration).toBe('invalid');
      expect(await links(ws)).toEqual(before);
    });
  });

  it('skips without a system actor, then registers on the next run once bootstrap created it', async () => {
    const ws = await newWorkspace({ systemActor: false });
    const file = await writeDeclaration(DECLARED);
    const skipped = await syncOf(ws, file).sync.run();
    expect(skipped.skipped).toBe('no_system_actor');
    expect(await rows(ws)).toEqual([]);
    await addSystemActor(ws);
    const again = await syncOf(ws, file).sync.run();
    expect(again.skipped).toBeUndefined();
    expect((await rows(ws)).map((r) => r.slug)).toEqual(['bravo', 'mars', 'platform']);
  });

  it('skips when the workspace does not exist', async () => {
    const result = await syncOf(randomUUID(), undefined).sync.run();
    expect(result.skipped).toBe('no_workspace');
  });

  it('two concurrent runs leave one row per key (advisory lock)', async () => {
    const ws = await newWorkspace();
    const file = await writeDeclaration(DECLARED);
    await Promise.all([syncOf(ws, file).sync.run(), syncOf(ws, file).sync.run(), syncOf(ws, file).sync.run()]);
    const all = await rows(ws);
    expect(all.map((r) => r.slug)).toEqual(['bravo', 'mars', 'platform']);
    expect((await links(ws)).length).toBe(2);
  });

  it('workspaces are isolated: another workspace with the same keys is untouched', async () => {
    const a = await newWorkspace();
    const b = await newWorkspace();
    const file = await writeDeclaration(DECLARED);
    await syncOf(a, file).sync.run();
    expect(await rows(b)).toEqual([]);
    await syncOf(b, file).sync.run();
    const idsA = (await rows(a)).map((r) => r.id);
    const idsB = (await rows(b)).map((r) => r.id);
    expect(idsB).toHaveLength(3);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    await syncOf(a, await writeDeclaration([])).sync.run();
    expect((await links(b)).every((l) => l.declared)).toBe(true);
  });

  describe('HTTP: reserved external_key and archive rules', () => {
    let app: FastifyInstance;
    let cookie: string;
    let file: string;
    const ids: Record<string, string> = {};
    const SPACE = ['it-sys-keep', 'it-sys-drop'];
    const headers = () => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' });

    beforeAll(async () => {
      app = await buildServer({ config: loadConfig(), dbHandle: appHandle });
      await app.ready();
      cookie = await loginAs(app, 'mock-admin-1');
      file = await writeDeclaration(SPACE.map((s) => ({ space_id: s, name: `Name ${s}` })));
      await syncOf(WORKSPACE_ID, file).sync.run();
      const all = await rows(WORKSPACE_ID);
      for (const r of all) ids[r.slug] = r.id;
    });

    afterAll(async () => {
      const mine = await ops.pool.query<{ id: string }>(
        `select id from core.managed_systems where workspace_id = $1 and (external_key = 'platform' or external_key like 'space:it-sys-%' or slug like 'it-reserved-%')`,
        [WORKSPACE_ID],
      );
      const idList = mine.rows.map((r) => r.id);
      await ops.pool.query('delete from core.space_links where managed_system_id = any($1::uuid[])', [idList]);
      await ops.pool.query('delete from core.audit_log where subject_id = any($1::uuid[])', [idList]);
      await ops.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [idList]);
      await ops.pool.query('delete from core.idempotency_keys');
      await app?.close();
    });

    const reserved = { path: ['external_key'], code: 'reserved_external_key' };

    it.each(['platform', 'space:mars'])('register with external_key %s → 422 reserved_external_key', async (key) => {
      const res = await app.inject({
        method: 'POST',
        url: '/managed-systems',
        headers: headers(),
        payload: { slug: 'it-reserved-new', name: 'X', external_key: key },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [reserved] } });
    });

    it('register with an ordinary external_key still works', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/managed-systems',
        headers: headers(),
        payload: { slug: 'it-reserved-ok', name: 'Ok', external_key: 'tableau:site-1' },
      });
      expect(res.statusCode).toBe(201);
      ids['it-reserved-ok'] = res.json().id;
    });

    it.each([
      ['assigning a reserved key to a free-key row', 'it-reserved-ok', { external_key: 'platform' }],
      ['assigning a space key to a free-key row', 'it-reserved-ok', { external_key: 'space:other' }],
      ['clearing a space key', SPACE[0] as string, { external_key: null }],
      ['replacing a space key with a free key', SPACE[0] as string, { external_key: 'free' }],
      ['replacing a space key with the platform key', SPACE[0] as string, { external_key: 'platform' }],
      ['clearing the platform key', 'platform', { external_key: null }],
      ['replacing the platform key with a space key', 'platform', { external_key: 'space:x' }],
      ['replacing the platform key with a free key', 'platform', { external_key: 'free' }],
    ])('update: %s → 422 reserved_external_key', async (_label, slug, payload) => {
      const res = await app.inject({ method: 'PATCH', url: `/managed-systems/${ids[slug]}`, headers: headers(), payload });
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [reserved] } });
      const row = (await rows(WORKSPACE_ID)).find((r) => r.slug === slug);
      expect(row?.external_key).toBe(slug === 'platform' ? 'platform' : slug === 'it-reserved-ok' ? 'tableau:site-1' : `space:${slug}`);
    });

    it('update: an unchanged key and unrelated fields are allowed on a registry-owned row', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/managed-systems/${ids[SPACE[0] as string]}`,
        headers: headers(),
        payload: { name: 'Renamed by admin', external_key: `space:${SPACE[0]}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: 'Renamed by admin', external_key: `space:${SPACE[0]}` });
    });

    it('archive: 「플랫폼」 and a declared system are refused with 409 conflict.system_managed, also after attempted edits', async () => {
      for (const slug of ['platform', SPACE[0] as string]) {
        const res = await app.inject({ method: 'POST', url: `/managed-systems/${ids[slug]}/archive`, headers: headers() });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({ code: 'conflict.system_managed' });
        expect((await rows(WORKSPACE_ID)).find((r) => r.slug === slug)?.archived_at).toBeNull();
      }
    });

    it('archive: a system whose space stopped declaring is archived (200); a manual system too', async () => {
      await syncOf(WORKSPACE_ID, await writeDeclaration([{ space_id: SPACE[0] as string, name: 'Name' }])).sync.run();
      const dropped = await app.inject({ method: 'POST', url: `/managed-systems/${ids[SPACE[1] as string]}/archive`, headers: headers() });
      expect(dropped.statusCode).toBe(200);
      expect(dropped.json().archived_at).not.toBeNull();
      const manual = await app.inject({ method: 'POST', url: `/managed-systems/${ids['it-reserved-ok']}/archive`, headers: headers() });
      expect(manual.statusCode).toBe(200);
      const still = await app.inject({ method: 'POST', url: `/managed-systems/${ids[SPACE[0] as string]}/archive`, headers: headers() });
      expect(still.statusCode).toBe(409);
    });
  });
});
