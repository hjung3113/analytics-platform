// Cutover rehearsal for #1100 a (migration 0076). HOST-ONLY and destructive for the CLUSTER it targets: it
// creates, renames and drops cluster-wide roles. It therefore runs only against an exclusive, memory-capped,
// disposable Postgres on port 5449 (never the shared 5439 cluster, never the 5434 developer database), and only
// when CUTOVER_REHEARSAL_ADMIN_URL is exported. Without it every test is skipped, so the default gate is
// unaffected.
//
//   CUTOVER_REHEARSAL_ADMIN_URL=postgres://postgres:<pw>@localhost:5449/postgres \
//     pnpm --filter @ap/platform-api exec vitest run src/db/__tests__/identity-cutover.rehearsal.test.ts
//
// The URL must be exactly postgres://postgres:<pw>@localhost:5449/postgres (no query string) and the cluster must
// be empty; both are checked in beforeAll, before any statement that changes anything, and a failure there stops
// the whole suite. Stages are sequential: a failed stage blocks every later one (helpers/rehearsal-guard.ts, pure
// refusal tests in identity-cutover.guard.test.ts). By default the
// rehearsal reproduces an EXISTING installation (old roles + database `feedbackops`); set
// CUTOVER_REHEARSAL_FRESH=1 on a second empty cluster to rehearse a fresh install (database `platform` straight
// from init.sql, no database rename).

import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

import { assertPlatformIdentityReady } from '../identity-readiness.js';
import { assertRuntimeDbRole } from '../runtime-role.js';
import {
  createStageGate,
  preflightRehearsal,
  rehearsalChildEnv,
} from './helpers/rehearsal-guard.js';

const ADMIN_URL = process.env.CUTOVER_REHEARSAL_ADMIN_URL ?? '';
const FRESH = process.env.CUTOVER_REHEARSAL_FRESH === '1';
const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const SCRIPT = `${REPO}ops/platform-api/scripts/db/cutover-0076-platform-identity.sh`;
const INIT_SQL = `${REPO}ops/platform-api/scripts/db/init.sql`;
const BACKEND = `${REPO}apps/platform-api`;
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
      ...rehearsalChildEnv(process.env),
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

    const gate = createStageGate();
    // A stage runs only when its prerequisite passed; otherwise it fails as blocked without executing.
    const stage = (
      id: string,
      needs: string | null,
      name: string,
      fn: () => Promise<void>,
      timeout?: number,
    ) => it(name, () => gate.run(id, needs, fn), timeout);

    // Validates the URL (exact local 5449 admin target, no query string) and that the cluster is empty BEFORE any
    // statement that changes anything. If this throws, vitest runs none of the tests below.
    beforeAll(async () => {
      await preflightRehearsal(ADMIN_URL, (url) => async (sql) => query(url, sql));
    });

    stage('preflight', null, 'targets only an empty, exclusive 5449 cluster', async () => {
      expect(new URL(ADMIN_URL).port).toBe('5449');
      expect(new URL(ADMIN_URL).pathname).toBe('/postgres');
      expect(await roleNames()).toEqual([]);
      expect(await databases()).toEqual([]);
    });

    stage(
      'init',
      'preflight',
      'provisions an installation that still has the fops_* roles (init.sql, optional legacy database name)',
      async () => {
        const init = spawnSync(
          'psql',
          ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ADMIN_URL, '-f', INIT_SQL],
          { encoding: 'utf8', env: rehearsalChildEnv(process.env) },
        );
        expect(init.status, init.stderr).toBe(0);
        if (!FRESH) await query(ADMIN_URL, 'alter database platform rename to feedbackops');
        expect(await roleNames()).toEqual(SUFFIXES.map((s) => `fops_${s}`).sort());
        expect(await databases()).toEqual([legacyDb]);
      },
    );

    stage(
      'history',
      'init',
      'history: replays 0000..0075 as fops_migrate from the immutable staged copy',
      async () => {
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
      },
    );

    stage('md5', 'history', 'refuses MD5 password hashes before changing anything', async () => {
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

    stage(
      'sessions',
      'md5',
      'refuses while an application session is connected (never terminates sessions)',
      async () => {
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
      },
    );

    stage(
      'conflicts',
      'sessions',
      'fails closed on conflicting old/new names without changing anything',
      async () => {
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
      },
    );

    // The database rename is a separate statement after the role transaction commits. A private psql shim (real psql
    // for everything else) fails the first ALTER DATABASE, which leaves the cluster in the roles-renamed /
    // database-old intermediate state; the stages after it prove that state is resumable.
    if (FRESH) {
      it.skip('rename failing at the database statement leaves a resumable intermediate state (no database rename in a fresh install)', () =>
        undefined);
    } else {
      stage(
        'rename-fail',
        'conflicts',
        'rename failing at the database statement leaves roles renamed / database old, and a retry resumes safely',
        async () => {
          const shimDir = mkdtempSync(join(tmpdir(), 'rehearsal-psql-'));
          try {
            const real = execFileSync('which', ['psql'], { encoding: 'utf8' }).trim();
            const shim = join(shimDir, 'psql');
            writeFileSync(
              shim,
              `#!/bin/sh\ncase "$*" in *"ALTER DATABASE"*) echo 'ERROR: simulated database rename failure' >&2; exit 1;; esac\nexec '${real}' "$@"\n`,
            );
            chmodSync(shim, 0o755);
            const failed = run('rename', { PATH: `${shimDir}:${process.env.PATH ?? ''}` });
            expect(failed.code).not.toBe(0);
            expect(failed.output).toMatch(/simulated database rename failure/);
          } finally {
            rmSync(shimDir, { recursive: true, force: true });
          }
          // Intermediate state: the nine roles are renamed (committed), the database still has its old name.
          expect(await roleNames()).toEqual(SUFFIXES.map((s) => `platform_${s}`).sort());
          expect(await databases()).toEqual([legacyDb]);
          expect(await snapshot(legacyDb)).toEqual(before);
          expect(await ledger(legacyDb)).toEqual(ledgerBefore);
          // The history stage must not replay as the old migrate role once the roles are gone.
          const history = run('history');
          expect(history.code, history.output).toBe(0);
          expect(history.output).toMatch(/already renamed/);
          // Without the interruption the same command resumes: roles are left alone, only the database is renamed.
          const resumed = run('rename');
          expect(resumed.code, resumed.output).toBe(0);
          expect(resumed.output).toMatch(/roles already renamed/);
          expect(resumed.output).toMatch(/renaming database/);
        },
      );
    }

    stage(
      'rename',
      FRESH ? 'conflicts' : 'rename-fail',
      'rename: nine roles in one transaction, then the database; OIDs, ACLs, owners, memberships and SCRAM secrets are unchanged',
      async () => {
        // Non-fresh runs already finished the rename in the stage above (resume after the simulated failure); a fresh
        // install renames only the roles here. Either way the command must now succeed and leave the final identity.
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
      },
    );

    stage(
      'readiness-gap',
      'rename',
      'between the rename and 0076 the readiness check refuses the database (guards still compare the old name)',
      async () => {
        const app = new pg.Pool({
          connectionString: roleUrl('platform_app', 'platform_app', 'platform'),
        });
        try {
          await assertRuntimeDbRole(app);
          await expect(assertPlatformIdentityReady(app)).rejects.toThrow(/migration 0076/);
        } finally {
          await app.end();
        }
      },
    );

    stage('repeat', 'readiness-gap', 'repeating the rename stage is a no-op', async () => {
      const result = run('rename');
      expect(result.code, result.output).toBe(0);
      expect(result.output).toMatch(/already renamed/);
      expect(await ledger('platform')).toEqual(ledgerBefore);
    });

    stage(
      'migrate',
      'repeat',
      'migrate: ordinary db:migrate as platform_migrate applies 0076; readiness now succeeds',
      async () => {
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
      },
    );

    stage(
      'idempotent',
      'migrate',
      'a second full run is idempotent and later migrations need no admin login',
      async () => {
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
              ...rehearsalChildEnv(process.env),
              DATABASE_URL_MIGRATE: roleUrl('platform_migrate', 'platform_migrate', 'platform'),
              CUTOVER_ADMIN_URL: '',
            },
          },
        );
        expect(plain.status, plain.stderr).toBe(0);
        expect(await ledger('platform')).toHaveLength(HISTORY_ROWS + 1);
      },
    );

    // A real migration appended AFTER 0076, in a private copy of the migration folder (committed and historical
    // files are never edited): applied by the ordinary drizzle-kit migrate as platform_migrate, no admin login.
    stage(
      'append',
      'idempotent',
      'a migration appended after 0076 runs as the ordinary platform_migrate (private copied folder)',
      async () => {
        const real = `${BACKEND}/migrations`;
        const listing = () => readdirSync(real, { recursive: true }).map(String).sort();
        const committedBefore = {
          files: listing(),
          journal: readFileSync(`${real}/meta/_journal.json`, 'utf8'),
        };
        const copy = mkdtempSync(join(tmpdir(), 'rehearsal-migrations-'));
        try {
          cpSync(real, copy, { recursive: true });
          const journalPath = `${copy}/meta/_journal.json`;
          const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
            entries: Array<{
              idx: number;
              version: string;
              when: number;
              tag: string;
              breakpoints: boolean;
            }>;
          };
          const last = journal.entries[journal.entries.length - 1];
          expect(last?.tag).toBe('0076_platform_identity_cutover');
          const tag = '0077_rehearsal_probe';
          writeFileSync(
            `${copy}/${tag}.sql`,
            'CREATE TABLE core.rehearsal_probe AS SELECT current_user::text AS who;\n',
          );
          journal.entries.push({
            idx: (last?.idx ?? 0) + 1,
            version: last?.version ?? '7',
            when: (last?.when ?? 0) + 1000,
            tag,
            breakpoints: true,
          });
          writeFileSync(journalPath, JSON.stringify(journal, null, 2));
          const result = spawnSync(`${BACKEND}/node_modules/.bin/drizzle-kit`, ['migrate'], {
            cwd: BACKEND,
            encoding: 'utf8',
            env: {
              ...rehearsalChildEnv(process.env),
              DRIZZLE_OUT: copy,
              DATABASE_URL_MIGRATE: roleUrl('platform_migrate', 'platform_migrate', 'platform'),
              CUTOVER_ADMIN_URL: '',
            },
          });
          expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
        } finally {
          rmSync(copy, { recursive: true, force: true });
        }
        const platformUrl = withDb(ADMIN_URL, 'platform');
        expect(await ledger('platform')).toHaveLength(HISTORY_ROWS + 2);
        expect(await query(platformUrl, 'select who from core.rehearsal_probe')).toEqual([
          { who: 'platform_migrate' },
        ]);
        expect(
          await query(
            platformUrl,
            "select tableowner from pg_tables where tablename = 'rehearsal_probe'",
          ),
        ).toEqual([{ tableowner: 'platform_migrate' }]);
        // The committed migration folder was only read.
        expect({
          files: listing(),
          journal: readFileSync(`${real}/meta/_journal.json`, 'utf8'),
        }).toEqual(committedBefore);
      },
      60_000,
    );
  },
);
