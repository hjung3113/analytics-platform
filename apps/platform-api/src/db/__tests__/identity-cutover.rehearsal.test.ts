// Cutover rehearsal for #1100 a (migration 0076). HOST-ONLY and destructive for the CLUSTER it targets: it
// creates, renames and drops cluster-wide roles. It therefore runs only against an exclusive, memory-capped,
// disposable Postgres on port 5449 (never the shared 5439 cluster, never the 5434 developer database), and only
// when CUTOVER_REHEARSAL_ADMIN_URL is exported. Without it every test is skipped, so the default gate is
// unaffected.
//
//   CUTOVER_REHEARSAL_ADMIN_URL=postgres://postgres:<pw>@localhost:5449/postgres \
//     pnpm --filter @ap/platform-api exec vitest run src/db/__tests__/identity-cutover.rehearsal.test.ts
//
// The cluster must be empty (no fops_*/platform_* roles, no feedbackops/platform databases). By default the
// rehearsal reproduces an EXISTING installation (old roles + database `feedbackops`); set
// CUTOVER_REHEARSAL_FRESH=1 on a second empty cluster to rehearse a fresh install (database `platform` straight
// from init.sql, no database rename).

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { assertPlatformIdentityReady } from '../identity-readiness.js';
import { assertRuntimeDbRole } from '../runtime-role.js';

const ADMIN_URL = process.env.CUTOVER_REHEARSAL_ADMIN_URL ?? '';
const FRESH = process.env.CUTOVER_REHEARSAL_FRESH === '1';
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const SCRIPT = `${REPO}ops/platform-api/scripts/db/cutover-0076-platform-identity.sh`;
const INIT_SQL = `${REPO}ops/platform-api/scripts/db/init.sql`;
const HISTORY_ROWS = 76;
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

const withDb = (url: string, db: string) => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};
const roleUrl = (role: string, password: string, db: string) =>
  `postgres://${role}:${password}@localhost:5449/${db}`;

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  url: string,
  sql: string,
  params: unknown[] = [],
) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

function run(stage: string, extraEnv: Record<string, string> = {}) {
  const result = spawnSync('bash', [SCRIPT, stage], {
    cwd: REPO,
    encoding: 'utf8',
    env: {
      ...process.env,
      CUTOVER_ADMIN_URL: ADMIN_URL,
      DATABASE_URL_MIGRATE: roleUrl('platform_migrate', 'platform_migrate', 'platform'),
      ...extraEnv,
    },
  });
  return { code: result.status, output: `${result.stdout}\n${result.stderr}` };
}

// Everything the cutover must leave untouched, keyed by OID (names legitimately change).
async function snapshot(db: string) {
  const url = withDb(ADMIN_URL, db);
  const roleFilter = "rolname ~ '^(fops|platform)_'";
  const roles = await query(
    url,
    `select oid::int8::text as oid, rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolpassword
       from pg_authid where ${roleFilter} order by oid::int8`,
  );
  const members = await query(
    url,
    `select roleid::int8::text as roleid, member::int8::text as member, admin_option from pg_auth_members
      where roleid in (select oid from pg_roles where ${roleFilter}) or member in (select oid from pg_roles where ${roleFilter})
      order by 1, 2`,
  );
  const acl = (kind: string, owner: string, col: string) =>
    `coalesce((select json_agg(json_build_array(a.grantor::int8::text, a.grantee::int8::text, a.privilege_type, a.is_grantable) order by a.grantee::int8, a.privilege_type, a.grantor::int8)
        from aclexplode(coalesce(${col}, acldefault('${kind}', ${owner}))) a), '[]'::json)`;
  const schemas =
    "('core','permission','voc','voc_cluster','finding','task','task_request','survey','platform','pgboss','drizzle')";
  const relations = await query(
    url,
    `select c.oid::int8::text as oid, c.relowner::int8::text as owner, ${acl('r', 'c.relowner', 'c.relacl')} as acl
       from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ${schemas} order by c.oid::int8`,
  );
  const columns = await query(
    url,
    `select a.attrelid::int8::text as rel, a.attnum, (select json_agg(json_build_array(x.grantee::int8::text, x.privilege_type) order by x.grantee::int8, x.privilege_type) from aclexplode(a.attacl) x) as acl
       from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ${schemas} and a.attacl is not null order by 1, 2`,
  );
  const routines = await query(
    url,
    `select p.oid::int8::text as oid, p.proowner::int8::text as owner, ${acl('f', 'p.proowner', 'p.proacl')} as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ${schemas} order by p.oid::int8`,
  );
  const schemaAcls = await query(
    url,
    `select n.oid::int8::text as oid, n.nspowner::int8::text as owner, ${acl('n', 'n.nspowner', 'n.nspacl')} as acl from pg_namespace n where n.nspname in ${schemas} order by n.oid::int8`,
  );
  const database = await query(
    url,
    `select d.oid::int8::text as oid, d.datdba::int8::text as owner, ${acl('d', 'd.datdba', 'd.datacl')} as acl from pg_database d where d.datname = current_database()`,
  );
  return { roles, members, relations, columns, routines, schemaAcls, database };
}

const ledger = (db: string) =>
  query<{ id: number; hash: string; created_at: string }>(
    withDb(ADMIN_URL, db),
    'select id, hash, created_at::text as created_at from drizzle.__drizzle_migrations order by id',
  );
const roleNames = async () =>
  (
    await query<{ rolname: string }>(
      ADMIN_URL,
      "select rolname from pg_roles where rolname ~ '^(fops|platform)_' order by 1",
    )
  ).map((r) => r.rolname);
const databases = async () =>
  (
    await query<{ datname: string }>(
      ADMIN_URL,
      "select datname from pg_database where datname in ('feedbackops','platform') order by 1",
    )
  ).map((r) => r.datname);

describe.skipIf(!ADMIN_URL)(
  'platform identity cutover rehearsal (#1100 a, exclusive 5449 cluster only)',
  () => {
    const legacyDb = FRESH ? 'platform' : 'feedbackops';
    const workspaceId = '00000000-0000-0000-0000-0000000010a0';
    let before: Awaited<ReturnType<typeof snapshot>>;
    let ledgerBefore: Awaited<ReturnType<typeof ledger>>;

    afterAll(() => undefined);

    it('targets only an empty, exclusive 5449 cluster', async () => {
      expect(new URL(ADMIN_URL).port).toBe('5449');
      expect(new URL(ADMIN_URL).pathname).toBe('/postgres');
      expect(await roleNames()).toEqual([]);
      expect(await databases()).toEqual([]);
    });

    it('provisions an installation that still has the fops_* roles (init.sql, optional legacy database name)', async () => {
      const init = spawnSync(
        'psql',
        ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ADMIN_URL, '-f', INIT_SQL],
        { encoding: 'utf8' },
      );
      expect(init.status, init.stderr).toBe(0);
      if (!FRESH) await query(ADMIN_URL, 'alter database platform rename to feedbackops');
      expect(await roleNames()).toEqual(SUFFIXES.map((s) => `fops_${s}`).sort());
      expect(await databases()).toEqual([legacyDb]);
    });

    it('history: replays 0000..0075 as fops_migrate from the immutable staged copy', async () => {
      const result = run('history');
      expect(result.code, result.output).toBe(0);
      ledgerBefore = await ledger(legacyDb);
      expect(ledgerBefore).toHaveLength(HISTORY_ROWS);
      await query(
        roleUrl('fops_migrate', 'platform_migrate', legacyDb),
        'insert into core.workspaces (id, name) values ($1, $2)',
        [workspaceId, 'prior data'],
      );
      before = await snapshot(legacyDb);
      expect(before.roles).toHaveLength(9);
    });

    it('refuses MD5 password hashes before changing anything', async () => {
      const admin = new pg.Client({ connectionString: ADMIN_URL });
      await admin.connect();
      try {
        await admin.query("set password_encryption = 'md5'");
        await admin.query("alter role fops_app password 'platform_app'");
        const result = run('rename');
        expect(result.code).toBe(5);
        expect(result.output).toMatch(/MD5/);
        expect(result.output).not.toContain('platform_app@');
        expect(await roleNames()).toEqual(SUFFIXES.map((s) => `fops_${s}`).sort());
        await admin.query("set password_encryption = 'scram-sha-256'");
        await admin.query("alter role fops_app password 'platform_app'");
      } finally {
        await admin.end();
      }
      // Re-hashing replaced the SCRAM secret (new salt); the later comparison starts from this state.
      before = await snapshot(legacyDb);
    });

    it('refuses while an application session is connected (never terminates sessions)', async () => {
      const session = new pg.Client({
        connectionString: roleUrl('fops_app', 'platform_app', legacyDb),
      });
      await session.connect();
      try {
        const result = run('rename');
        expect(result.code).toBe(3);
        expect(result.output).toMatch(/session\(s\) still use/);
        expect((await session.query('select 1 as one')).rows[0]?.one).toBe(1);
      } finally {
        await session.end();
      }
      expect(await roleNames()).toEqual(SUFFIXES.map((s) => `fops_${s}`).sort());
    });

    it('fails closed on conflicting old/new names without changing anything', async () => {
      await query(ADMIN_URL, 'create role platform_app');
      try {
        const mixed = run('rename');
        expect(mixed.code).not.toBe(0);
        expect(mixed.output).toMatch(/mixed or conflicting role state/);
      } finally {
        await query(ADMIN_URL, 'drop role platform_app');
      }
      if (!FRESH) {
        await query(ADMIN_URL, 'create database platform');
        try {
          const both = run('rename');
          expect(both.code).not.toBe(0);
          expect(both.output).toMatch(/both databases/);
        } finally {
          await query(ADMIN_URL, 'drop database platform');
        }
      }
      expect(await roleNames()).toEqual(SUFFIXES.map((s) => `fops_${s}`).sort());
      expect(await databases()).toEqual([legacyDb]);
    });

    it('rename: nine roles in one transaction, then the database; OIDs, ACLs, owners, memberships and SCRAM secrets are unchanged', async () => {
      const result = run('rename');
      expect(result.code, result.output).toBe(0);
      expect(await roleNames()).toEqual(SUFFIXES.map((s) => `platform_${s}`).sort());
      expect(await databases()).toEqual(['platform']);
      const after = await snapshot('platform');
      expect(after).toEqual(before);
      expect(await ledger('platform')).toEqual(ledgerBefore);
      expect(
        await query(
          roleUrl('platform_migrate', 'platform_migrate', 'platform'),
          'select name from core.workspaces where id = $1',
          [workspaceId],
        ),
      ).toEqual([{ name: 'prior data' }]);
    });

    it('between the rename and 0076 the readiness check refuses the database (guards still compare the old name)', async () => {
      const app = new pg.Pool({
        connectionString: roleUrl('platform_app', 'platform_app', 'platform'),
      });
      try {
        await assertRuntimeDbRole(app);
        await expect(assertPlatformIdentityReady(app)).rejects.toThrow(/migration 0076/);
      } finally {
        await app.end();
      }
    });

    it('repeating the rename stage is a no-op', async () => {
      const result = run('rename');
      expect(result.code, result.output).toBe(0);
      expect(result.output).toMatch(/already renamed/);
      expect(await ledger('platform')).toEqual(ledgerBefore);
    });

    it('migrate: ordinary db:migrate as platform_migrate applies 0076; readiness now succeeds', async () => {
      const result = run('migrate');
      expect(result.code, result.output).toBe(0);
      const rows = await ledger('platform');
      expect(rows).toHaveLength(HISTORY_ROWS + 1);
      expect(rows.slice(0, HISTORY_ROWS)).toEqual(ledgerBefore);
      const app = new pg.Pool({
        connectionString: roleUrl('platform_app', 'platform_app', 'platform'),
      });
      try {
        await assertRuntimeDbRole(app);
        await expect(assertPlatformIdentityReady(app)).resolves.toBeUndefined();
      } finally {
        await app.end();
      }
      // ACL, owner and membership state stays equal to the pre-rename snapshot (0076 only replaced function bodies/comments).
      const after = await snapshot('platform');
      expect(after.roles).toEqual(before.roles);
      expect(after.members).toEqual(before.members);
      expect(after.relations).toEqual(before.relations);
      expect(after.routines).toEqual(before.routines);
    });

    it('a second full run is idempotent and later migrations need no admin login', async () => {
      const again = run('all');
      expect(again.code, again.output).toBe(0);
      expect(await ledger('platform')).toHaveLength(HISTORY_ROWS + 1);
      const plain = spawnSync(
        'pnpm',
        ['--filter', '@ap/platform-api', 'exec', 'drizzle-kit', 'migrate'],
        {
          cwd: REPO,
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL_MIGRATE: roleUrl('platform_migrate', 'platform_migrate', 'platform'),
            CUTOVER_ADMIN_URL: '',
          },
        },
      );
      expect(plain.status, plain.stderr).toBe(0);
      expect(await ledger('platform')).toHaveLength(HISTORY_ROWS + 1);
    });
  },
);
