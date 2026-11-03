// Focused test for the production preflight and compose file (#1266 b1b). No Docker or network is reached.
// Run: node scripts/release/production-preflight.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const PREFLIGHT = path('production-preflight.sh');
const production = readFileSync(path('../../docker-compose.production.yml'), 'utf8');
const smoke = readFileSync(path('../../docker-compose.release.yml'), 'utf8');
const demo = readFileSync(path('../../.env.release.example'), 'utf8');

const dir = mkdtempSync(join(tmpdir(), 'preflight-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const GOOD = {
  POSTGRES_PASSWORD: 'pg-Zx9-real-value',
  OIDC_CLIENT_SECRET: 'oidc-Zx9-real-value',
  MINIO_ROOT_PASSWORD: 'minio-Zx9-real-value',
  MINIO_ROOT_USER: 'platform-minio',
  PLATFORM_APP_DB_PASSWORD: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  PLATFORM_MIGRATE_DB_PASSWORD: 'f09e8d7c6b5a49382716f5e4d3c2b1a0',
  OIDC_CLIENT_ID: 'platform',
  OIDC_ISSUER_URL: 'https://idp.corp.example/realms/platform',
  OIDC_REDIRECT_URI: 'https://platform.corp.example/auth/callback',
  TRUSTED_PROXY_HOPS: '1',
  EDGE_BIND: '10.0.0.5',
  WORKSPACE_ID: '123e4567-e89b-42d3-a456-426614174000',
  NOTIFICATION_EMAIL_CHANNEL: 'mock',
};

let n = 0;
function run(overrides = {}) {
  const env = { ...GOOD, ...overrides };
  const file = join(dir, `env-${n++}`);
  writeFileSync(
    file,
    Object.entries(env)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  );
  const r = spawnSync('bash', [PREFLIGHT, file], { encoding: 'utf8' });
  return { code: r.status, lines: r.stdout.split('\n').filter(Boolean) };
}

test('preflight: a complete https configuration passes', () => {
  const r = run();
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, ['preflight: email disabled (mock): notifications reach the inbox only', 'preflight: ok']);
});

test('preflight: the shipped example is rejected', () => {
  const r = spawnSync('bash', [PREFLIGHT, path('../../.env.production.example')], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
});

test('preflight: all-interfaces edge bind passes with the explicit acknowledgement', () => {
  const r = run({ EDGE_BIND: '0.0.0.0', EDGE_BIND_ALL_INTERFACES_ACK: 'yes' });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

for (const bind of [
  '::',
  '[::]',
  '0:0:0:0:0:0:0:0',
  '[0:0:0:0:0:0:0:0]',
  '::0',
  '[::0]',
  '0000::',
  '[0::0]',
]) {
  test(`preflight: IPv6 unspecified ${bind} needs the acknowledgement`, () => {
    const refused = run({ EDGE_BIND: bind });
    assert.equal(refused.code, 1, bind);
    assert.match(refused.lines.join('\n'), /EDGE_BIND binds all interfaces/);
    const ok = run({ EDGE_BIND: bind, EDGE_BIND_ALL_INTERFACES_ACK: 'yes' });
    assert.equal(ok.code, 0, ok.lines.join('\n'));
  });
}

test('preflight: a specific IPv6 address needs no acknowledgement', () => {
  const r = run({ EDGE_BIND: '[fd00::1]' });
  assert.equal(r.code, 0, r.lines.join('\n'));
});

test('preflight: usage error without a file', () => {
  assert.equal(spawnSync('bash', [PREFLIGHT], { encoding: 'utf8' }).status, 2);
});

const demoValue = (key) => demo.match(new RegExp(`^${key}=(.+)$`, 'm'))[1];

for (const [name, overrides, needle] of [
  ['http issuer', { OIDC_ISSUER_URL: 'http://idp.corp.example' }, 'OIDC_ISSUER_URL'],
  [
    'http redirect',
    { OIDC_REDIRECT_URI: 'http://platform.corp.example/auth/callback' },
    'OIDC_REDIRECT_URI',
  ],
  [
    'redirect path',
    { OIDC_REDIRECT_URI: 'https://platform.corp.example/callback' },
    'OIDC_REDIRECT_URI',
  ],
  [
    'redirect without path',
    { OIDC_REDIRECT_URI: 'https://platform.corp.example' },
    'OIDC_REDIRECT_URI',
  ],
  ['empty secret', { OIDC_CLIENT_SECRET: '' }, 'OIDC_CLIENT_SECRET'],
  ['missing secret', { POSTGRES_PASSWORD: undefined }, 'POSTGRES_PASSWORD'],
  ['CHANGE_ME secret', { MINIO_ROOT_PASSWORD: 'CHANGE_ME' }, 'MINIO_ROOT_PASSWORD'],
  [
    'demo postgres password',
    { POSTGRES_PASSWORD: demoValue('POSTGRES_PASSWORD') },
    'POSTGRES_PASSWORD',
  ],
  [
    'demo oidc secret',
    { OIDC_CLIENT_SECRET: demoValue('OIDC_CLIENT_SECRET') },
    'OIDC_CLIENT_SECRET',
  ],
  [
    'demo minio password',
    { MINIO_ROOT_PASSWORD: demoValue('MINIO_ROOT_PASSWORD') },
    'MINIO_ROOT_PASSWORD',
  ],
  ['empty app db password', { PLATFORM_APP_DB_PASSWORD: '' }, 'PLATFORM_APP_DB_PASSWORD'],
  [
    'missing migrate db password',
    { PLATFORM_MIGRATE_DB_PASSWORD: undefined },
    'PLATFORM_MIGRATE_DB_PASSWORD',
  ],
  [
    'CHANGE_ME app db password',
    { PLATFORM_APP_DB_PASSWORD: 'CHANGE_ME' },
    'PLATFORM_APP_DB_PASSWORD',
  ],
  ['short db password', { PLATFORM_APP_DB_PASSWORD: 'short-1234' }, 'PLATFORM_APP_DB_PASSWORD'],
  [
    'db password with a URL-reserved character',
    { PLATFORM_MIGRATE_DB_PASSWORD: 'abcdefghij@lmnopqrstuvwxyz' },
    'PLATFORM_MIGRATE_DB_PASSWORD',
  ],
  [
    'equal db passwords',
    { PLATFORM_MIGRATE_DB_PASSWORD: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' },
    'must differ',
  ],
  ['zero proxy hops', { TRUSTED_PROXY_HOPS: '0' }, 'TRUSTED_PROXY_HOPS'],
  ['non-numeric proxy hops', { TRUSTED_PROXY_HOPS: 'one' }, 'TRUSTED_PROXY_HOPS'],
  ['workspace not a uuid', { WORKSPACE_ID: 'workspace-1' }, 'WORKSPACE_ID'],
  ['missing edge bind', { EDGE_BIND: undefined }, 'EDGE_BIND'],
  ['placeholder edge bind', { EDGE_BIND: 'CHANGE_ME' }, 'EDGE_BIND'],
  ['all-interfaces edge bind', { EDGE_BIND: '0.0.0.0' }, 'EDGE_BIND'],
  ['edge bind that is a hostname', { EDGE_BIND: 'edge.corp.example' }, 'EDGE_BIND'],
]) {
  test(`preflight: rejects ${name}`, () => {
    const r = run(overrides);
    assert.equal(r.code, 1);
    assert.equal(r.lines.length, 1, r.lines.join('\n'));
    assert.match(r.lines[0], new RegExp(needle));
  });
}

// Raw env-file forms: the preflight must judge the value Compose will use, and refuse forms it cannot judge.
function runRaw(lines) {
  const file = join(dir, `env-${n++}`);
  const base = Object.entries(GOOD).map(([k, v]) => `${k}=${v}`);
  writeFileSync(file, [...lines(base)].join('\n'));
  const r = spawnSync('bash', [PREFLIGHT, file], { encoding: 'utf8' });
  return { code: r.status, lines: r.stdout.split('\n').filter(Boolean) };
}
const without = (base, key) => base.filter((l) => !l.startsWith(`${key}=`));

test('preflight: accepts quotes, comments, blank lines and inline comments', () => {
  const r = runRaw((base) => [
    '# a comment',
    '',
    ...without(
      without(without(base, 'POSTGRES_PASSWORD'), 'OIDC_CLIENT_SECRET'),
      'MINIO_ROOT_USER',
    ),
    'POSTGRES_PASSWORD="pg-Zx9 real # value"',
    "OIDC_CLIENT_SECRET='oidc-Zx9-$real'",
    'MINIO_ROOT_USER=platform-minio # inline comment',
  ]);
  assert.deepEqual(r.lines, ['preflight: email disabled (mock): notifications reach the inbox only', 'preflight: ok']);
  assert.equal(r.code, 0);
});

for (const [name, lines, needle] of [
  [
    'commented real secret followed by a placeholder',
    (b) => [
      ...without(b, 'OIDC_CLIENT_SECRET'),
      '# OIDC_CLIENT_SECRET=real-secret-value',
      'OIDC_CLIENT_SECRET=CHANGE_ME',
    ],
    'OIDC_CLIENT_SECRET',
  ],
  [
    'placeholder with an inline comment',
    (b) => [...without(b, 'OIDC_CLIENT_SECRET'), 'OIDC_CLIENT_SECRET=CHANGE_ME # replace me'],
    'OIDC_CLIENT_SECRET',
  ],
  [
    'double-quoted placeholder',
    (b) => [...without(b, 'POSTGRES_PASSWORD'), 'POSTGRES_PASSWORD="CHANGE_ME"'],
    'POSTGRES_PASSWORD',
  ],
  [
    'single-quoted placeholder',
    (b) => [...without(b, 'POSTGRES_PASSWORD'), "POSTGRES_PASSWORD='CHANGE_ME'"],
    'POSTGRES_PASSWORD',
  ],
  [
    'export form',
    (b) => ['export POSTGRES_PASSWORD=real-value', ...without(b, 'POSTGRES_PASSWORD')],
    'export',
  ],
  [
    'interpolation (unquoted)',
    (b) => [...without(b, 'OIDC_CLIENT_SECRET'), 'OIDC_CLIENT_SECRET=${OTHER}'],
    'OIDC_CLIENT_SECRET',
  ],
  [
    'interpolation (double-quoted)',
    (b) => [...without(b, 'OIDC_CLIENT_SECRET'), 'OIDC_CLIENT_SECRET="pre-$OTHER"'],
    'OIDC_CLIENT_SECRET',
  ],
  [
    'multi-line value',
    (b) => [...without(b, 'OIDC_CLIENT_SECRET'), 'OIDC_CLIENT_SECRET="line one', 'line two"'],
    'OIDC_CLIENT_SECRET',
  ],
  ['duplicate key', (b) => [...b, 'POSTGRES_PASSWORD=another-real-value'], 'POSTGRES_PASSWORD'],
  [
    'text after a closing quote',
    (b) => [...without(b, 'POSTGRES_PASSWORD'), 'POSTGRES_PASSWORD="real"tail'],
    'POSTGRES_PASSWORD',
  ],
]) {
  test(`preflight: refuses ${name}`, () => {
    const r = runRaw(lines);
    assert.equal(r.code, 1);
    assert.ok(r.lines.length >= 1);
    assert.match(r.lines[0], new RegExp(needle));
    assert.doesNotMatch(r.lines.join('\n'), /real-secret-value|another-real-value/);
  });
}

for (const [name, overrides, needle] of [
  ['issuer without a host', { OIDC_ISSUER_URL: 'https://:443' }, 'OIDC_ISSUER_URL'],
  [
    'issuer with userinfo',
    { OIDC_ISSUER_URL: 'https://user:pw@idp.corp.example' },
    'OIDC_ISSUER_URL',
  ],
  ['issuer with a query', { OIDC_ISSUER_URL: 'https://idp.corp.example/r?x=1' }, 'OIDC_ISSUER_URL'],
  [
    'issuer with a fragment',
    { OIDC_ISSUER_URL: 'https://idp.corp.example/r#x' },
    'OIDC_ISSUER_URL',
  ],
  [
    'redirect without a host',
    { OIDC_REDIRECT_URI: 'https://:443/auth/callback' },
    'OIDC_REDIRECT_URI',
  ],
  [
    'redirect with userinfo',
    { OIDC_REDIRECT_URI: 'https://u@platform.corp.example/auth/callback' },
    'OIDC_REDIRECT_URI',
  ],
  [
    'redirect with a query',
    { OIDC_REDIRECT_URI: 'https://platform.corp.example/auth/callback?x=1' },
    'OIDC_REDIRECT_URI',
  ],
  [
    'redirect with a fragment',
    { OIDC_REDIRECT_URI: 'https://platform.corp.example/auth/callback#x' },
    'OIDC_REDIRECT_URI',
  ],
  [
    'redirect with a trailing slash',
    { OIDC_REDIRECT_URI: 'https://platform.corp.example/auth/callback/' },
    'OIDC_REDIRECT_URI',
  ],
]) {
  test(`preflight: rejects ${name}`, () => {
    const r = run(overrides);
    assert.equal(r.code, 1);
    assert.equal(r.lines.length, 1, r.lines.join('\n'));
    assert.match(r.lines[0], new RegExp(needle));
  });
}

test('production compose: bootstrap and set-actor-role wait for a completed migration', () => {
  for (const svc of ['bootstrap', 'set-actor-role']) {
    const block = production.match(
      new RegExp(`^ {2}${svc}:\\n([\\s\\S]*?)(?=^ {2}\\S|^\\S)`, 'm'),
    )[1];
    assert.match(block, /migrate:\n {8}condition: service_completed_successfully/, svc);
    assert.match(block, /postgres:\n {8}condition: service_healthy/, svc);
  }
});

test('ops gitignore covers .env.production but not its example', () => {
  const ignore = readFileSync(path('../../.gitignore'), 'utf8').split('\n');
  assert.ok(ignore.includes('.env.production'));
  assert.ok(!ignore.some((l) => /\.env\.production\.example|^\.env\.\*$/.test(l)));
});

test('production compose: no mock IdP, no fixture seed, production mode, real OIDC', () => {
  assert.doesNotMatch(production, /mock-oauth2-server|network_mode|^ {2}oidc:/m);
  assert.doesNotMatch(production, /SEED_MODE: (core|personas|scale)/);
  assert.match(production, /SEED_MODE: bootstrap/);
  assert.match(production, /NODE_ENV: production/);
  assert.match(production, /AUTH_PROVIDER: oidc/);
  assert.match(production, /TRUSTED_PROXY_HOPS: \$\{TRUSTED_PROXY_HOPS:\?/);
  const service = (name) =>
    production.match(new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}\\S|^\\S)`, 'm'))[1];
  assert.doesNotMatch(service('backend'), /^ {4}ports:/m);
  assert.match(service('edge'), /"\$\{EDGE_BIND:\?[^}]*\}:\$\{EDGE_PORT:-8080\}:80"/);
  assert.match(service('edge'), /image: platform-release-web:local\n {4}pull_policy: never/);
  assert.doesNotMatch(service('edge'), /^ {4}build:/m);
  assert.match(service('edge'), /backend:\n {8}condition: service_healthy/);
  assert.match(production, /stop_grace_period: 45s/);
});

test('production compose: no literal role passwords; backend gets only the app password', () => {
  assert.doesNotMatch(production, /platform_(app|migrate):platform_(app|migrate)@/);
  assert.doesNotMatch(production, /fops_migrate:platform_migrate@/);
  const backend = production.match(/^ {2}backend:\n([\s\S]*?)(?=^\S)/m)[1];
  assert.match(backend, /PLATFORM_APP_DB_PASSWORD:\?/);
  assert.doesNotMatch(backend, /PLATFORM_MIGRATE_DB_PASSWORD/);
  const job = production.match(/^ {2}set-role-passwords:\n([\s\S]*?)(?=^ {2}\S|^\S)/m)[1];
  assert.match(
    job,
    /entrypoint: \["bash", "\/workspace\/ops\/platform-api\/scripts\/db\/set-role-passwords\.sh"\]/,
  );
  assert.match(job, /profiles: \["roles"\]/);
  assert.doesNotMatch(job, /DATABASE_URL/);
  const cutover = production.match(/^ {2}cutover:\n([\s\S]*?)(?=^ {2}\S|^\S)/m)[1];
  assert.match(
    cutover,
    /CUTOVER_OLD_MIGRATE_URL: postgresql:\/\/fops_migrate:\$\{PLATFORM_MIGRATE_DB_PASSWORD:\?/,
  );
});

test('production compose: only job services receive the migrate credential', () => {
  const backend = production.match(/^ {2}backend:\n([\s\S]*?)(?=^\S)/m)[1];
  assert.doesNotMatch(backend, /DATABASE_URL_MIGRATE|PGPASSWORD|POSTGRES_PASSWORD/);
});

test('compose files: bounded logging on every service; restart policy on long-running ones', () => {
  for (const file of [production, smoke]) {
    const section = file.split(/^volumes:$/m)[0].split(/^services:$/m)[1];
    const services = section.match(/^ {2}[\w-]+:$/gm).length;
    assert.equal(section.match(/^ {4}logging: \*logging$/gm).length, services);
    assert.match(file, /max-size: 10m/);
    assert.match(file, /max-file: "5"/);
  }
  for (const svc of ['postgres', 'minio', 'backend']) {
    const block = production.match(
      new RegExp(`^ {2}${svc}:\\n([\\s\\S]*?)(?=^ {2}\\S|^\\S)`, 'm'),
    )[1];
    assert.match(block, /restart: unless-stopped/, svc);
  }
});

const SMTP = {
  NOTIFICATION_EMAIL_CHANNEL: 'smtp',
  SMTP_HOST: 'smtp.corp.example',
  SMTP_PORT: '587',
  SMTP_FROM: 'platform@corp.example',
};

test('preflight: a complete smtp configuration passes without the mock notice', () => {
  for (const extra of [{}, { SMTP_USERNAME: 'mailer', SMTP_PASSWORD: 'smtp-Zx9-real-value' }]) {
    const r = run({ ...SMTP, ...extra });
    assert.equal(r.code, 0, r.lines.join('\n'));
    assert.deepEqual(r.lines, ['preflight: ok']);
  }
});

test('preflight: mock channel passes and prints the notice', () => {
  const r = run({ NOTIFICATION_EMAIL_CHANNEL: 'mock' });
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, ['preflight: email disabled (mock): notifications reach the inbox only', 'preflight: ok']);
});

for (const [name, overrides, needle] of [
  ['missing channel', { NOTIFICATION_EMAIL_CHANNEL: undefined }, 'NOTIFICATION_EMAIL_CHANNEL'],
  ['unknown channel', { NOTIFICATION_EMAIL_CHANNEL: 'sendgrid' }, 'NOTIFICATION_EMAIL_CHANNEL'],
  ['smtp without host', { ...SMTP, SMTP_HOST: undefined }, 'SMTP_HOST'],
  ['smtp without port', { ...SMTP, SMTP_PORT: undefined }, 'SMTP_PORT'],
  ['smtp port not a number', { ...SMTP, SMTP_PORT: 'abc' }, 'SMTP_PORT'],
  ['smtp port 0', { ...SMTP, SMTP_PORT: '0' }, 'SMTP_PORT'],
  ['smtp port -1', { ...SMTP, SMTP_PORT: '-1' }, 'SMTP_PORT'],
  ['smtp without from', { ...SMTP, SMTP_FROM: undefined }, 'SMTP_FROM'],
  ['smtp username without password', { ...SMTP, SMTP_USERNAME: 'mailer' }, 'SMTP_PASSWORD'],
  ['smtp password without username', { ...SMTP, SMTP_PASSWORD: 'smtp-Zx9-real-value' }, 'SMTP_USERNAME'],
  [
    'smtp CHANGE_ME password',
    { ...SMTP, SMTP_USERNAME: 'mailer', SMTP_PASSWORD: 'CHANGE_ME' },
    'SMTP_PASSWORD',
  ],
  [
    'smtp demo password',
    { ...SMTP, SMTP_USERNAME: 'mailer', SMTP_PASSWORD: demoValue('POSTGRES_PASSWORD') },
    'SMTP_PASSWORD',
  ],
]) {
  test(`preflight: ${name} is refused`, () => {
    const r = run(overrides);
    assert.equal(r.code, 1, r.lines.join('\n'));
    assert.match(r.lines.join('\n'), new RegExp(needle));
    assert.ok(!r.lines.join('\n').includes('smtp-Zx9-real-value'));
  });
}

test('preflight: the production backend passes the email settings through', () => {
  assert.match(production, /NOTIFICATION_EMAIL_CHANNEL: \$\{NOTIFICATION_EMAIL_CHANNEL:\?/);
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    assert.match(production, new RegExp(`${key}: \\$\\{${key}:-\\}`));
  }
});
