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
  OIDC_CLIENT_ID: 'platform',
  OIDC_ISSUER_URL: 'https://idp.corp.example/realms/platform',
  OIDC_REDIRECT_URI: 'https://platform.corp.example/auth/callback',
  TRUSTED_PROXY_HOPS: '1',
  WORKSPACE_ID: '123e4567-e89b-42d3-a456-426614174000',
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
  assert.deepEqual(r.lines, ['preflight: ok']);
});

test('preflight: the shipped example is rejected', () => {
  const r = spawnSync('bash', [PREFLIGHT, path('../../.env.production.example')], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
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
  ['zero proxy hops', { TRUSTED_PROXY_HOPS: '0' }, 'TRUSTED_PROXY_HOPS'],
  ['non-numeric proxy hops', { TRUSTED_PROXY_HOPS: 'one' }, 'TRUSTED_PROXY_HOPS'],
  ['workspace not a uuid', { WORKSPACE_ID: 'workspace-1' }, 'WORKSPACE_ID'],
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
  assert.deepEqual(r.lines, ['preflight: ok']);
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
  assert.match(production, /"\$\{BACKEND_BIND:-127\.0\.0\.1\}:\$\{BACKEND_PORT:-3001\}:3001"/);
  assert.match(production, /stop_grace_period: 45s/);
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
