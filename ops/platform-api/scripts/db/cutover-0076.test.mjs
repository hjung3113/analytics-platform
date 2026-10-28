// Focused test for the argument/safety refusals of cutover-0076-platform-identity.sh (#1100 a). Every case stops
// before a database is reached (URL parsing and option checks run first), so no Postgres is needed.
// The live cutover (history, rename, migrate, MD5/session/conflict refusals) is rehearsed on an exclusive 5449
// cluster by apps/platform-api/src/db/__tests__/identity-cutover.rehearsal.test.ts.
// Run: node scripts/db/cutover-0076.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('cutover-0076-platform-identity.sh', import.meta.url));
const SECRET = 'S3cretPw';
const admin = (user, db, port = '5449') => `postgres://${user}:${SECRET}@localhost:${port}/${db}`;

function run(args, env) {
  const base = { ...process.env, CUTOVER_ADMIN_URL: '', CUTOVER_ALLOW_DEV_DB: '', ...env };
  const result = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: base });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

test('requires an admin URL', () => {
  const { code, output } = run(['all'], {});
  assert.notEqual(code, 0);
  assert.match(output, /CUTOVER_ADMIN_URL/);
});

test('refuses the development port unless explicitly allowed', () => {
  const { code, output } = run(['all'], {
    CUTOVER_ADMIN_URL: admin('postgres', 'postgres', '5434'),
  });
  assert.equal(code, 2);
  assert.match(output, /5434/);
  assert.doesNotMatch(output, new RegExp(SECRET));
});

test('refuses an admin connection to the database being renamed or as a renamed role', () => {
  for (const [url, pattern] of [
    [admin('postgres', 'feedbackops'), /must not use the database being renamed/],
    [admin('postgres', 'platform'), /must not use the database being renamed/],
    [admin('fops_migrate', 'postgres'), /must not use one of the roles being renamed/],
    [admin('platform_migrate', 'postgres'), /must not use one of the roles being renamed/],
  ]) {
    const { code, output } = run(['all'], { CUTOVER_ADMIN_URL: url });
    assert.equal(code, 2, url.replace(SECRET, '***'));
    assert.match(output, pattern);
    assert.doesNotMatch(output, new RegExp(SECRET));
  }
});

test('rejects an unknown stage before connecting', () => {
  const { code, output } = run(['bogus'], {
    CUTOVER_ADMIN_URL: admin('postgres', 'postgres', '1'),
  });
  assert.equal(code, 2);
  assert.match(output, /usage:/);
});

test('names all nine roles, never prints credentials, and keeps the sessions-never-terminated rule', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  for (const suffix of [
    'migrate',
    'app',
    'survey_aggregate_owner',
    'survey_evidence_reader_owner',
    'survey_provenance_mutator_owner',
    'entity_links_view_owner',
    'entity_links_survey_mutator_owner',
    'survey_derived_finding_reader_owner',
    'core_audit_reader_owner',
  ]) {
    assert.ok(source.includes(suffix), suffix);
  }
  assert.doesNotMatch(source, /pg_terminate_backend|pg_cancel_backend/);
  assert.doesNotMatch(source, /echo[^\n]*\$\{?(ADMIN_URL|old_url|url)\b/);
});

// --- #1100 a fix round: effective-target validation (C2) and fixed database names (C3) ---------------------------
// A private 'psql' shim on PATH records every invocation and prints 0 for any query. A refusal test therefore proves
// "refused before any connection" by an empty invocation log; the controls prove the shim sees a valid target.

const GATE = fileURLToPath(new URL('../ci/gate.sh', import.meta.url));

function withShim(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cutover-shim-'));
  const log = join(dir, 'psql.log');
  const shim = join(dir, 'psql');
  writeFileSync(shim, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nprintf '0\\n'\n`);
  chmodSync(shim, 0o755);
  try {
    return fn({
      dir,
      env: { PATH: `${dir}:${process.env.PATH}` },
      calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const noPgEnv = {
  PGPORT: '',
  PGHOST: '',
  PGHOSTADDR: '',
  PGUSER: '',
  PGDATABASE: '',
  PGSERVICE: '',
  PGOPTIONS: '',
};

test('control: a valid admin target reaches psql (so the refusals below are not vacuous)', () => {
  withShim(({ env, calls }) => {
    const { code, output } = run(['rename'], {
      ...noPgEnv,
      ...env,
      CUTOVER_ADMIN_URL: admin('postgres', 'postgres'),
    });
    assert.notEqual(code, 0);
    assert.match(output, /none of the nine roles exist/);
    assert.ok(calls().length > 0);
  });
});

test('an allowlisted SSL option is accepted; unsupported SSL modes are refused with a diagnosis', () => {
  withShim(({ env, calls }) => {
    const ok = run(['rename'], {
      ...noPgEnv,
      ...env,
      CUTOVER_ADMIN_URL: `${admin('postgres', 'postgres')}?sslmode=require`,
    });
    assert.match(ok.output, /none of the nine roles exist/);
    assert.ok(calls().length > 0);
  });
  withShim(({ env, calls }) => {
    const bad = run(['rename'], {
      ...noPgEnv,
      ...env,
      CUTOVER_ADMIN_URL: `${admin('postgres', 'postgres')}?sslmode=prefer`,
    });
    assert.equal(bad.code, 2);
    assert.match(bad.output, /sslmode/);
    assert.deepEqual(calls(), []);
  });
});

const hostileAdminUrls = [
  ['port query overrides the authority port', `${admin('postgres', 'postgres')}?port=5434`],
  [
    'port query with no authority port',
    'postgres://postgres:S3cretPw@localhost/postgres?port=5434',
  ],
  ['percent-encoded port key', `${admin('postgres', 'postgres')}?%70ort=5434`],
  ['host query', `${admin('postgres', 'postgres')}?host=other.example`],
  ['hostaddr query', `${admin('postgres', 'postgres')}?hostaddr=127.0.0.1`],
  ['user query', `${admin('postgres', 'postgres')}?user=fops_app`],
  ['dbname query', `${admin('postgres', 'postgres')}?dbname=feedbackops`],
  ['options query', `${admin('postgres', 'postgres')}?options=-c%20role%3Dfops_app`],
  ['duplicate allowlisted key', `${admin('postgres', 'postgres')}?sslmode=require&sslmode=disable`],
  ['multi-host authority', 'postgres://postgres:S3cretPw@a,b:5449/postgres'],
  ['percent-encoded socket host', 'postgres://postgres:S3cretPw@%2Ftmp:5449/postgres'],
  ['fragment', `${admin('postgres', 'postgres')}#x`],
  ['wrong protocol', 'mysql://postgres:S3cretPw@localhost:5449/postgres'],
  ['no user', 'postgres://localhost:5449/postgres'],
  ['admin database is not postgres', admin('postgres', 'template1')],
];

test('hostile admin targets are refused before any connection', () => {
  for (const [label, url] of hostileAdminUrls) {
    withShim(({ env, calls }) => {
      const { code, output } = run(['all'], { ...noPgEnv, ...env, CUTOVER_ADMIN_URL: url });
      assert.equal(code, 2, `${label}: ${output}`);
      assert.deepEqual(calls(), [], label);
      assert.doesNotMatch(output, new RegExp(SECRET), label);
    });
  }
});

test('the development port is guarded by its effective value, however it is spelled', () => {
  const dev = [
    ['?port=5434 over authority 5449', `${admin('postgres', 'postgres')}?port=5434`, {}],
    ['zero-padded 05434', admin('postgres', 'postgres', '05434'), {}],
    ['PGPORT default', 'postgres://postgres:S3cretPw@localhost/postgres', { PGPORT: '5434' }],
    [
      'zero-padded PGPORT default',
      'postgres://postgres:S3cretPw@localhost/postgres',
      { PGPORT: '05434' },
    ],
  ];
  for (const [label, url, extra] of dev) {
    for (const allow of ['', '0']) {
      withShim(({ env, calls }) => {
        const { code, output } = run(['all'], {
          ...noPgEnv,
          ...env,
          ...extra,
          CUTOVER_ADMIN_URL: url,
          CUTOVER_ALLOW_DEV_DB: allow,
        });
        assert.equal(code, 2, `${label}: ${output}`);
        assert.deepEqual(calls(), [], label);
      });
    }
  }
});

test('with the explicit dev opt-in the effective 5434 target is reached', () => {
  withShim(({ env, calls }) => {
    const { output } = run(['rename'], {
      ...noPgEnv,
      ...env,
      CUTOVER_ADMIN_URL: 'postgres://postgres:S3cretPw@localhost/postgres',
      PGPORT: '05434',
      CUTOVER_ALLOW_DEV_DB: '1',
    });
    assert.match(output, /none of the nine roles exist/);
    assert.match(calls()[0], /:5434\/postgres/);
  });
});

test('hostile old/new migrator targets are refused before any connection', () => {
  const okAdmin = admin('postgres', 'postgres');
  const cases = [
    [
      [
        'history',
        {
          CUTOVER_OLD_MIGRATE_URL: 'postgres://fops_migrate:x@localhost:5449/feedbackops?port=5434',
        },
      ],
      'old migrator port query',
    ],
    [
      [
        'history',
        {
          CUTOVER_OLD_MIGRATE_URL:
            'postgres://fops_migrate:x@localhost:5449/feedbackops?user=postgres',
        },
      ],
      'old migrator user query',
    ],
    [
      [
        'history',
        {
          CUTOVER_OLD_MIGRATE_URL:
            'postgres://fops_migrate:x@localhost:5449/feedbackops?dbname=postgres',
        },
      ],
      'old migrator dbname query',
    ],
    [
      [
        'history',
        { CUTOVER_OLD_MIGRATE_URL: 'postgres://fops_migrate:x@localhost:5450/feedbackops' },
      ],
      'old migrator other server',
    ],
    [
      [
        'migrate',
        {
          DATABASE_URL_MIGRATE: 'postgres://platform_migrate:x@localhost:5449/platform?host=other',
        },
      ],
      'final migrator host query',
    ],
    [
      [
        'migrate',
        {
          DATABASE_URL_MIGRATE:
            'postgres://platform_migrate:x@localhost:5449/platform?user=postgres',
        },
      ],
      'final migrator user query',
    ],
    [['migrate', { DATABASE_URL_MIGRATE: '' }], 'final migrator missing'],
    [
      [
        'all',
        { DATABASE_URL_MIGRATE: 'postgres://platform_migrate:x@localhost:5449/platform?port=5434' },
      ],
      'final migrator port query (all)',
    ],
  ];
  for (const [[stage, extra], label] of cases) {
    withShim(({ env, calls }) => {
      const { code, output } = run([stage], {
        ...noPgEnv,
        ...env,
        CUTOVER_ADMIN_URL: okAdmin,
        DATABASE_URL_MIGRATE: '',
        CUTOVER_OLD_MIGRATE_URL: '',
        ...extra,
      });
      assert.notEqual(code, 0, `${label}: ${output}`);
      assert.deepEqual(calls(), [], label);
    });
  }
});

test('database names are fixed: any noncanonical override is refused before the admin connection', () => {
  const overrides = [
    ['CUTOVER_OLD_DB', "feedbackops'; SELECT 1; --"],
    ['CUTOVER_OLD_DB', 'feedbackops" CASCADE; --'],
    ['CUTOVER_NEW_DB', "platform'; DROP DATABASE postgres; --"],
    ['CUTOVER_NEW_DB', 'platform"; DROP ROLE x; --'],
    ['CUTOVER_NEW_DB', 'platform;'],
    ['CUTOVER_OLD_DB', 'other'],
  ];
  for (const [name, value] of overrides) {
    withShim(({ env, calls }) => {
      const { code, output } = run(['all'], {
        ...noPgEnv,
        ...env,
        CUTOVER_ADMIN_URL: admin('postgres', 'postgres'),
        [name]: value,
      });
      assert.equal(code, 2, `${name}=${value}: ${output}`);
      assert.match(output, /fixed|canonical/);
      assert.deepEqual(calls(), [], `${name}=${value}`);
    });
  }
  withShim(({ env, calls }) => {
    const { output } = run(['rename'], {
      ...noPgEnv,
      ...env,
      CUTOVER_ADMIN_URL: admin('postgres', 'postgres'),
      CUTOVER_OLD_DB: 'feedbackops',
      CUTOVER_NEW_DB: 'platform',
    });
    assert.match(output, /none of the nine roles exist/);
    assert.ok(calls().length > 0);
    for (const call of calls()) assert.doesNotMatch(call, /[;]\s*(select|drop)/i);
  });
});

test('gate.sh integration provisioning validates the effective admin target before psql', () => {
  const base = 'postgres://postgres:S3cretPw@localhost';
  const hostile = [
    ['port query over authority', `${base}:5432/postgres?port=5434`, {}],
    ['zero-padded 05434', `${base}:05434/postgres`, {}],
    ['PGPORT default', `${base}/postgres`, { PGPORT: '5434' }],
    ['host query', `${base}:5432/postgres?host=other`, {}],
    ['dbname query', `${base}:5432/postgres?dbname=feedbackops`, {}],
  ];
  for (const [label, url, extra] of hostile) {
    withShim(({ env, calls }) => {
      const result = spawnSync('bash', [GATE, 'integration'], {
        encoding: 'utf8',
        env: { ...process.env, ...noPgEnv, ...env, ...extra, CI_PG_ADMIN_URL: url },
      });
      assert.equal(result.status, 2, `${label}: ${result.stderr}`);
      assert.deepEqual(calls(), [], label);
    });
  }
  withShim(({ env, calls }) => {
    const result = spawnSync('bash', [GATE, 'integration'], {
      encoding: 'utf8',
      env: { ...process.env, ...noPgEnv, ...env, CI_PG_ADMIN_URL: `${base}:5432/postgres` },
    });
    assert.notEqual(result.status, 0);
    assert.ok(calls().some((call) => call.includes('init.sql')));
  });
});

// An existing POSTGRES_PASSWORD may hold URL-reserved characters, so the release job must not splice it into a URL.
// The admin URL is password-free and libpq reads PGPASSWORD, which only the one-off cutover job receives.
const COMPOSE = readFileSync(
  fileURLToPath(new URL('../../docker-compose.release.yml', import.meta.url)),
  'utf8',
);
const serviceBlock = (name) => {
  const start = COMPOSE.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `service ${name} exists`);
  const rest = COMPOSE.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  const block = next === -1 ? rest : rest.slice(0, next + 1);
  return block
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
};

test('release cutover job: password-free admin URL, PGPASSWORD only in that job', () => {
  const job = serviceBlock('cutover');
  const url = job.match(/^ {6}CUTOVER_ADMIN_URL: (\S+)$/m);
  assert.ok(url, 'cutover has a CUTOVER_ADMIN_URL');
  assert.equal(url[1], 'postgresql://postgres@postgres:5432/postgres');
  assert.doesNotMatch(url[1], /POSTGRES_PASSWORD|\$\{/);
  assert.match(job, /^ {6}PGPASSWORD: \$\{POSTGRES_PASSWORD:\?[^}]+\}$/m);
  assert.doesNotMatch(COMPOSE, /postgres(ql)?:\/\/[^\s@]*\$\{POSTGRES_PASSWORD/);
  for (const other of ['backend', 'migrate']) {
    assert.doesNotMatch(
      serviceBlock(other),
      /PGPASSWORD|CUTOVER_ADMIN_URL|POSTGRES_PASSWORD/,
      `${other} must not receive the superuser credential`,
    );
  }
});

test('a password-free admin URL with PGPASSWORD reaches psql with the secret in the environment only', () => {
  const reserved = 'p@ss:w/rd?#%x';
  const dir = mkdtempSync(join(tmpdir(), 'cutover-pw-'));
  const log = join(dir, 'psql.log');
  const shim = join(dir, 'psql');
  writeFileSync(
    shim,
    `#!/bin/sh\nprintf '%s|%s\\n' "$PGPASSWORD" "$*" >> '${log}'\nprintf '0\\n'\n`,
  );
  chmodSync(shim, 0o755);
  try {
    const { code, output } = run(['rename'], {
      ...noPgEnv,
      PATH: `${dir}:${process.env.PATH}`,
      CUTOVER_ADMIN_URL: 'postgresql://postgres@localhost:5449/postgres',
      PGPASSWORD: reserved,
    });
    assert.notEqual(code, 0);
    assert.match(output, /none of the nine roles exist/);
    assert.ok(!output.includes(reserved), 'the secret is never printed');
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    assert.ok(calls.length > 0);
    for (const call of calls) {
      assert.ok(call.startsWith(`${reserved}|`), 'PGPASSWORD reaches psql unchanged');
      assert.ok(!call.slice(reserved.length + 1).includes(reserved), 'argv carries no secret');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
