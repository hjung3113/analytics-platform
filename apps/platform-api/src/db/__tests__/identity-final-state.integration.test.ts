// Final-identity integration suite for the 0076 cutover (#1100 a). Requires a database that went
// through ops/platform-api/scripts/db/cutover-0076-platform-identity.sh (fresh replay or upgrade).
// Runs as the low-privilege roles only; the rename mechanics themselves are rehearsed in
// identity-cutover.rehearsal.test.ts on an exclusive cluster.

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { insertActorRow } from '../../test-support/actor-fixtures.js';
import { type DbHandle, createDb } from '../client.js';
import { assertPlatformIdentityReady } from '../identity-readiness.js';
import { assertRuntimeDbRole } from '../runtime-role.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && process.env.WORKSPACE_ID);

const MIGRATIONS = new URL('../../../migrations/', import.meta.url);
const SUFFIXES = [
  'migrate',
  'app',
  'survey_aggregate_owner',
  'survey_evidence_reader_owner',
  'survey_provenance_mutator_owner',
  'entity_links_view_owner',
  'entity_links_survey_mutator_owner',
  'survey_derived_finding_reader_owner',
  'core_audit_reader_owner',
];
const NOLOGIN_OWNERS = SUFFIXES.filter((s) => s.endsWith('_owner')).map((s) => `platform_${s}`);

describe.skipIf(!runIntegration)('platform identity after cutover 0076 (#1100 a)', () => {
  let app: DbHandle;
  let migrate: DbHandle;
  const workspaceId = randomUUID();
  const msId = randomUUID();
  let actorId: string;

  beforeAll(async () => {
    app = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    await migrate.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
      workspaceId,
      'Identity fixture',
    ]);
    await migrate.pool.query(
      'insert into core.managed_systems (id, workspace_id, slug, name) values ($1, $2, $3, $3)',
      [msId, workspaceId, `identity-${msId}`],
    );
    actorId = (
      await insertActorRow(migrate, {
        workspaceId,
        externalId: `identity-${randomUUID()}`,
        roleLevel: 'admin',
      })
    ).id;
  });

  afterAll(async () => {
    await migrate?.pool.query(
      'delete from voc.voc_similarity_preview_requests where workspace_id = $1',
      [workspaceId],
    );
    await migrate?.pool.query(
      'delete from voc.voc_similarity_preview_budgets where workspace_id = $1',
      [workspaceId],
    );
    await migrate?.pool.query(
      'delete from voc.voc_cluster_suggestion_admissions where workspace_id = $1',
      [workspaceId],
    );
    await migrate?.pool.query('delete from core.actors where id = $1', [actorId]);
    await migrate?.pool.query('delete from core.managed_systems where id = $1', [msId]);
    await migrate?.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    await app?.close();
    await migrate?.close();
  });

  it('connects as the platform roles on the platform database family', async () => {
    expect((await app.pool.query('select current_user')).rows[0]?.current_user).toBe(
      'platform_app',
    );
    expect((await migrate.pool.query('select current_user')).rows[0]?.current_user).toBe(
      'platform_migrate',
    );
    await expect(assertRuntimeDbRole(app.pool)).resolves.toBeUndefined();
  });

  it('holds exactly the nine platform_* roles and no fops_* role', async () => {
    const { rows } = await migrate.pool.query<{ rolname: string }>(
      "select rolname from pg_roles where rolname like 'platform\\_%' or rolname like 'fops\\_%' order by rolname",
    );
    expect(rows.map((r) => r.rolname)).toEqual(SUFFIXES.map((s) => `platform_${s}`).sort());
  });

  it('keeps NOLOGIN/NOINHERIT on the owner roles, one-way membership, and a plain app role', async () => {
    const owners = await migrate.pool.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolinherit: boolean;
    }>(
      'select rolname, rolcanlogin, rolinherit from pg_roles where rolname = any($1::text[]) order by rolname',
      [NOLOGIN_OWNERS],
    );
    expect(owners.rows).toHaveLength(7);
    for (const row of owners.rows)
      expect(row, row.rolname).toMatchObject({ rolcanlogin: false, rolinherit: false });
    const members = await migrate.pool.query<{
      app_member: boolean;
      reverse_member: boolean;
      migrate_member: boolean;
      owner: string;
    }>(
      `select pg_has_role('platform_app', r.oid, 'MEMBER') as app_member,
              pg_has_role(r.oid, 'platform_migrate', 'MEMBER') as reverse_member,
              pg_has_role('platform_migrate', r.oid, 'MEMBER') as migrate_member, r.rolname as owner
         from pg_roles r where r.rolname = any($1::text[])`,
      [NOLOGIN_OWNERS],
    );
    for (const row of members.rows) {
      expect(row, row.owner).toMatchObject({
        app_member: false,
        reverse_member: false,
        migrate_member: true,
      });
    }
    const login = await migrate.pool.query<{
      rolname: string;
      rolinherit: boolean;
      rolcanlogin: boolean;
    }>(
      "select rolname, rolinherit, rolcanlogin from pg_roles where rolname in ('platform_app', 'platform_migrate')",
    );
    for (const row of login.rows)
      expect(row).toMatchObject({ rolinherit: false, rolcanlogin: true });
  });

  it('keeps the migration ledger: 0000..0075 hashes are the unchanged file hashes, 0076 follows', async () => {
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const ledger = await migrate.pool.query<{ hash: string; created_at: string }>(
      'select hash, created_at from drizzle.__drizzle_migrations order by id',
    );
    expect(ledger.rows.length).toBeGreaterThanOrEqual(journal.entries.length);
    journal.entries.forEach((entry, i) => {
      const sql = readFileSync(new URL(`${entry.tag}.sql`, MIGRATIONS));
      expect(ledger.rows[i]?.hash, entry.tag).toBe(createHash('sha256').update(sql).digest('hex'));
      expect(Number(ledger.rows[i]?.created_at), entry.tag).toBe(entry.when);
    });
    expect(journal.entries[76]?.tag).toBe('0076_platform_identity_cutover');
  });

  it('keeps ownership and ACLs on platform_* names: app has no DDL, no raw audit read, no survey response read', async () => {
    await expect(app.pool.query('create table core.identity_probe (id int)')).rejects.toMatchObject(
      { code: '42501' },
    );
    await expect(app.pool.query('select * from core.audit_log limit 1')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      app.pool.query('select * from survey.survey_responses limit 1'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(app.pool.query('delete from core.audit_log')).rejects.toMatchObject({
      code: '42501',
    });
    const owner = await migrate.pool.query<{ owner: string }>(
      "select pg_get_userbyid(relowner) as owner from pg_class where oid = 'voc.voc_similarity_preview_requests'::regclass",
    );
    expect(owner.rows[0]?.owner).toBe('platform_migrate');
  });

  it('attests migration 0076 to the runtime role through the catalog only', async () => {
    await expect(assertPlatformIdentityReady(app.pool)).resolves.toBeUndefined();
    await expect(
      app.pool.query('select * from drizzle.__drizzle_migrations'),
    ).rejects.toMatchObject({ code: '42501' });
    const bodies = await app.pool.query<{ prosrc: string }>(
      "select prosrc from pg_proc where proname like 'guard\\_%delete' and pronamespace = 'voc'::regnamespace",
    );
    expect(bodies.rows).toHaveLength(3);
    for (const row of bodies.rows) expect(row.prosrc).not.toContain('fops_');
  });

  describe('live-row delete guards under platform_app', () => {
    const cases = [
      {
        name: 'cluster suggestion admission bucket',
        table: 'voc.voc_cluster_suggestion_admissions',
        reason: /ended suggestion admission buckets/,
        insert: (live: boolean) =>
          [
            `insert into voc.voc_cluster_suggestion_admissions (workspace_id, primary_managed_system_id, window_start)
             values ($1, $2, (date_trunc('hour', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') ${live ? '' : "- interval '3 hours'"})`,
            [workspaceId, msId],
          ] as const,
      },
      {
        name: 'similarity preview request tombstone',
        table: 'voc.voc_similarity_preview_requests',
        reason: /expired preview tombstones/,
        insert: (live: boolean) =>
          [
            `insert into voc.voc_similarity_preview_requests
             (workspace_id, actor_id, idempotency_key, request_hash, primary_managed_system_id, provider, model, dimensions, embedding_version, reserved_at, expires_at)
             values ($1, $2, gen_random_uuid(), 'h', $3, 'p', 'm', 3, 1,
                     now() ${live ? '' : "- interval '2 days'"}, now() ${live ? "+ interval '1 hour'" : "- interval '1 day'"})`,
            [workspaceId, actorId, msId],
          ] as const,
      },
      {
        name: 'similarity preview budget window',
        table: 'voc.voc_similarity_preview_budgets',
        reason: /ended preview budget windows/,
        insert: (live: boolean) =>
          [
            `insert into voc.voc_similarity_preview_budgets (workspace_id, scope, actor_id, scope_key, period, window_start, used_attempts)
             values ($1, 'workspace', null, 'workspace', 'minute', now() ${live ? '' : "- interval '3 hours'"}, 1)`,
            [workspaceId],
          ] as const,
      },
    ];

    it.each(cases)(
      '$name: app cannot reclaim a live row, can reclaim an ended one; the table owner may clean up live rows',
      async (c) => {
        const insertRow = ([sql, params]: readonly [string, readonly string[]]) =>
          migrate.pool.query(sql, [...params]);
        const clear = () =>
          migrate.pool.query(`delete from ${c.table} where workspace_id = $1`, [workspaceId]);
        await clear();
        try {
          await insertRow(c.insert(true));
          await expect(
            app.pool.query(`delete from ${c.table} where workspace_id = $1`, [workspaceId]),
          ).rejects.toMatchObject({
            code: '23514',
            message: expect.stringMatching(c.reason),
          });
          expect(
            (
              await migrate.pool.query(`select 1 from ${c.table} where workspace_id = $1`, [
                workspaceId,
              ])
            ).rowCount,
          ).toBe(1);
          expect(
            (
              await migrate.pool.query(`delete from ${c.table} where workspace_id = $1`, [
                workspaceId,
              ])
            ).rowCount,
          ).toBe(1);

          await insertRow(c.insert(false));
          expect(
            (await app.pool.query(`delete from ${c.table} where workspace_id = $1`, [workspaceId]))
              .rowCount,
          ).toBe(1);
        } finally {
          await clear();
        }
      },
    );
  });
});
