// Test for set-role-passwords.sh (#1266 b1c). The refusal cases stop before a database is reached (no Postgres).
// The live rehearsal changes cluster-wide roles, so it runs only against an exclusive, disposable cluster on
// port 5449 and only when ROLE_PASSWORDS_REHEARSAL_ADMIN_URL=postgres://postgres:<pw>@localhost:5449/postgres is
// set; otherwise it is skipped. Needs psql 15+ (\getenv) on the host.
// Run: node scripts/db/set-role-passwords.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('set-role-passwords.sh', import.meta.url));
const APP_PW = 'appPw0123456789abcdefABCDEF_-';
const MIGRATE_PW = 'migPw0123456789abcdefABCDEF_-';
const SUPERUSER_PW = 'S3cretSuperuserPw';
const SECRETS = [APP_PW, MIGRATE_PW, SUPERUSER_PW];
const GOOD = {
  ROLE_PASSWORDS_ADMIN_URL: 'postgresql://postgres@localhost:5449/postgres',
  PGPASSWORD: SUPERUSER_PW,
  PLATFORM_APP_DB_PASSWORD: APP_PW,
  PLATFORM_MIGRATE_DB_PASSWORD: MIGRATE_PW,
};

function run(overrides = {}, args = []) {
  const env = { ...process.env, ...GOOD, ...overrides };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env });
  return { code: r.status, output: `${r.stdout}${r.stderr}` };
}

function assertNoSecret(output) {
  for (const s of SECRETS) assert.ok(!output.includes(s), 'a secret appeared in the output');
}

test('requires an admin URL', () => {
  const { code, output } = run({ ROLE_PASSWORDS_ADMIN_URL: '' });
  assert.equal(code, 2);
  assert.match(output, /ROLE_PASSWORDS_ADMIN_URL/);
  assertNoSecret(output);
});

for (const key of ['PLATFORM_APP_DB_PASSWORD', 'PLATFORM_MIGRATE_DB_PASSWORD']) {
  for (const [label, value] of [
    ['missing', undefined],
    ['empty', ''],
  ]) {
    test(`refuses a ${label} ${key}`, () => {
      const { code, output } = run({ [key]: value });
      assert.equal(code, 2);
      assert.match(output, new RegExp(key));
      assertNoSecret(output);
    });
  }
}

for (const [name, overrides] of [
  ['a short app password', { PLATFORM_APP_DB_PASSWORD: 'short1' }],
  ['an app password with a quote', { PLATFORM_APP_DB_PASSWORD: `${APP_PW}'; drop role x; --` }],
  ['a migrate password with a URL-reserved character', { PLATFORM_MIGRATE_DB_PASSWORD: `${MIGRATE_PW}@x` }],
  ['equal passwords', { PLATFORM_MIGRATE_DB_PASSWORD: APP_PW }],
]) {
  test(`refuses ${name}`, () => {
    const { code, output } = run(overrides);
    assert.equal(code, 2);
    assert.doesNotMatch(output, /drop role/);
    assertNoSecret(output.replace(overrides.PLATFORM_APP_DB_PASSWORD ?? '', ''));
  });
}

for (const port of ['5434', '5439', '05434']) {
  test(`refuses port ${port} before connecting`, () => {
    const { code, output } = run({
      ROLE_PASSWORDS_ADMIN_URL: `postgresql://postgres@localhost:${port}/postgres`,
    });
    assert.equal(code, 2);
    assert.match(output, /543[49]/);
    assertNoSecret(output);
  });
}

test('refuses a PGPORT that resolves to a guarded port when the URL has none', () => {
  const { code, output } = run({
    ROLE_PASSWORDS_ADMIN_URL: 'postgresql://postgres@localhost/postgres',
    PGPORT: '5439',
  });
  assert.equal(code, 2);
  assert.match(output, /5439/);
});

test('refuses an admin URL that carries a password, a redirecting parameter, or the wrong database/user', () => {
  for (const url of [
    `postgresql://postgres:${SUPERUSER_PW}@localhost:5449/postgres`,
    'postgresql://postgres@localhost:5449/postgres?port=5434',
    'postgresql://postgres@localhost:5449/platform',
    'postgresql://platform_app@localhost:5449/postgres',
    'postgresql://fops_migrate@localhost:5449/postgres',
  ]) {
    const { code, output } = run({ ROLE_PASSWORDS_ADMIN_URL: url });
    assert.equal(code, 2, url.replace(SUPERUSER_PW, '***'));
    assertNoSecret(output);
  }
});

test('takes no arguments', () => {
  const { code, output } = run({}, [APP_PW]);
  assert.equal(code, 2);
  assertNoSecret(output);
});

test('source keeps secrets out of argv and logs', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  assert.match(source, /\\getenv app_pw PLATFORM_APP_DB_PASSWORD/);
  assert.match(source, /:'app_pw'/);
  assert.match(source, /:'migrate_pw'/);
  assert.doesNotMatch(source, /psql[^\n]* -v [a-z_]*pw=/);
  assert.doesNotMatch(source, /-c "[^"]*PASSWORD[^"]*\$/);
  assert.doesNotMatch(source, /echo[^\n]*(_PASSWORD|\$app_pw|\$2)/);
  assert.doesNotMatch(source, /pg_terminate_backend|pg_cancel_backend/);
});

// ---- Live rehearsal: host-only, exclusive disposable cluster on 5449 ----

const REHEARSAL = process.env.ROLE_PASSWORDS_REHEARSAL_ADMIN_URL ?? '';

function psql(url, password, args, input) {
  const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-tA', ...args, url], {
    encoding: 'utf8',
    input,
    env: { ...process.env, PGPASSWORD: password },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.trim() };
}

test('live rehearsal: provision, cutover-style rename, rotate (skipped without ROLE_PASSWORDS_REHEARSAL_ADMIN_URL)', {
  skip: REHEARSAL === '' ? 'ROLE_PASSWORDS_REHEARSAL_ADMIN_URL is not set' : false,
}, () => {
  const u = new URL(REHEARSAL);
  assert.ok(['localhost', '127.0.0.1'].includes(u.hostname), 'rehearsal host must be localhost');
  assert.equal(u.port, '5449', 'rehearsal port must be 5449');
  assert.equal(u.search, '', 'no query string');
  assert.equal(u.pathname, '/postgres');
  assert.equal(u.username, 'postgres');
  const superPw = decodeURIComponent(u.password);
  const adminUrl = `postgresql://postgres@${u.hostname}:5449/postgres`;
  const admin = (sql) => psql(adminUrl, superPw, ['-c', sql]);
  const login = (role, password) =>
    psql(`postgresql://${role}@${u.hostname}:5449/postgres`, password, ['-c', 'select current_user']);
  const rotate = (app, migrate) => {
    const r = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ROLE_PASSWORDS_ADMIN_URL: adminUrl,
        PGPASSWORD: superPw,
        PLATFORM_APP_DB_PASSWORD: app,
        PLATFORM_MIGRATE_DB_PASSWORD: migrate,
      },
    });
    const output = `${r.stdout}${r.stderr}`;
    for (const s of [app, migrate, superPw]) assert.ok(!output.includes(s), 'secret in output');
    return { code: r.status, output };
  };
  const roles = ['fops_app', 'fops_migrate', 'platform_app', 'platform_migrate'];
  const cleanup = () => {
    for (const r of roles) admin(`drop role if exists ${r}`);
  };

  assert.equal(admin("select count(*) from pg_roles where rolname like 'fops\\_%' or rolname like 'platform\\_%'").out, '0',
    'the rehearsal cluster must have none of the application roles');
  try {
    // init.sql's two login roles, with their dev literals.
    assert.equal(admin("create role fops_migrate login noinherit password 'platform_migrate'").code, 0);
    assert.equal(admin("create role fops_app login noinherit password 'platform_app'").code, 0);
    assert.equal(login('fops_app', 'platform_app').out, 'fops_app');

    const one = ['one0123456789abcdef0123456789', 'two0123456789abcdef0123456789'];
    assert.equal(rotate(...one).code, 0);
    assert.equal(login('fops_app', one[0]).out, 'fops_app');
    assert.equal(login('fops_migrate', one[1]).out, 'fops_migrate');
    assert.notEqual(login('fops_app', 'platform_app').code, 0, 'old literal still works');
    assert.notEqual(login('fops_migrate', 'platform_migrate').code, 0, 'old literal still works');

    // Cutover renames the roles in place; the passwords must survive it.
    assert.equal(admin('alter role fops_app rename to platform_app').code, 0);
    assert.equal(admin('alter role fops_migrate rename to platform_migrate').code, 0);
    assert.equal(login('platform_app', one[0]).out, 'platform_app');
    assert.equal(login('platform_migrate', one[1]).out, 'platform_migrate');

    const two = ['three0123456789abcdef012345678', 'four0123456789abcdef0123456789'];
    assert.equal(rotate(...two).code, 0);
    assert.equal(login('platform_app', two[0]).out, 'platform_app');
    assert.equal(login('platform_migrate', two[1]).out, 'platform_migrate');
    assert.notEqual(login('platform_app', one[0]).code, 0, 'rotated-out password still works');
    // Idempotent rerun.
    assert.equal(rotate(...two).code, 0);

    // Neither name set: fails and changes nothing.
    cleanup();
    const none = rotate(...two);
    assert.notEqual(none.code, 0);
    assert.match(none.output, /neither platform_app nor fops_app/);
  } finally {
    cleanup();
  }
});
