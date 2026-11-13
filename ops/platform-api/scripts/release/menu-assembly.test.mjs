// Tests for the out-of-repo menu assembly path of the production stack (#1881): MENU_* pass-through and read-only
// mounts, the preflight file checks, and build-web-image.sh --dist. No Docker daemon is needed: `docker compose config`
// is skipped when the CLI is absent, and the image build runs against a stub `docker` on PATH.
// Run: node --test scripts/release/menu-assembly.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const PREFLIGHT = path('production-preflight.sh');
const BUILD_WEB = path('build-web-image.sh');
const COMPOSE = path('../../docker-compose.production.yml');
const production = readFileSync(COMPOSE, 'utf8');

const dir = mkdtempSync(join(tmpdir(), 'menu-assembly-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const BASE = {
  POSTGRES_PASSWORD: 'pg-Zx9-real-value',
  OIDC_CLIENT_SECRET: 'oidc-Zx9-real-value',
  MINIO_ROOT_PASSWORD: 'minio-Zx9-real-value',
  MINIO_ROOT_USER: 'platform-minio',
  MINIO_IMAGE: 'site/minio:1',
  PLATFORM_APP_DB_PASSWORD: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  PLATFORM_MIGRATE_DB_PASSWORD: 'f09e8d7c6b5a49382716f5e4d3c2b1a0',
  OIDC_CLIENT_ID: 'platform',
  OIDC_ISSUER_URL: 'https://idp.corp.example/realms/platform',
  OIDC_REDIRECT_URI: 'https://platform.corp.example/auth/callback',
  TRUSTED_PROXY_HOPS: '2',
  EDGE_BIND: '10.0.0.5',
  WORKSPACE_ID: '123e4567-e89b-42d3-a456-426614174000',
  NOTIFICATION_EMAIL_CHANNEL: 'mock',
};

// Synthetic bundle directory: declarations, snapshot, optional systems file, and a key file kept apart.
const assembly = join(dir, 'assembly');
const keys = join(dir, 'keys');
mkdirSync(assembly);
mkdirSync(keys);
writeFileSync(join(assembly, 'menu-declarations.json'), '{}');
writeFileSync(join(assembly, 'menu-declarations.snapshot.json'), '{}');
writeFileSync(join(assembly, 'platform-systems.json'), '[]');
writeFileSync(join(keys, 'identity.pem'), 'synthetic-not-a-key');
chmodSync(join(keys, 'identity.pem'), 0o600);

const MENU = {
  MENU_ASSEMBLY_DIR: assembly,
  MENU_KEY_DIR: keys,
  MENU_DECLARATIONS_FILE: '/menu-assembly/menu-declarations.json',
  MENU_DECLARATIONS_SNAPSHOT_FILE: '/menu-assembly/menu-declarations.snapshot.json',
  MENU_UPSTREAM_BASE_URL: 'https://data.corp.example',
  MENU_IDENTITY_KEY_FILE: '/menu-identity/identity.pem',
  MENU_IDENTITY_KEY_ID: 'kid-1',
  MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.corp.example',
  MENU_RESOLVER_TIMEOUT_MS: '2500',
  MENU_UPSTREAM_TIMEOUT_MS: '20000',
};

let n = 0;
function envFile(env) {
  const file = join(dir, `env-${n++}`);
  writeFileSync(
    file,
    Object.entries(env)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
  );
  return file;
}
function preflight(overrides = {}) {
  const r = spawnSync('bash', [PREFLIGHT, envFile({ ...BASE, ...overrides })], {
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout };
}

// --- preflight ---------------------------------------------------------------------------------

test('preflight: no MENU_DECLARATIONS_FILE means no menu-assembly checks (unchanged deployment)', () => {
  const r = preflight({ MENU_ASSEMBLY_DIR: '/nonexistent', MENU_KEY_DIR: '/nonexistent' });
  assert.equal(r.code, 0, r.out);
});

test('preflight: a complete synthetic menu assembly passes', () => {
  const r = preflight({ ...MENU, PLATFORM_SYSTEMS_FILE: '/menu-assembly/platform-systems.json' });
  assert.equal(r.code, 0, r.out);
});

test('preflight: a missing identity key file is refused with a clear message', () => {
  const r = preflight({ ...MENU, MENU_KEY_DIR: join(dir, 'no-keys') });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /MENU_IDENTITY_KEY_FILE/);
  assert.match(r.out, /not found|not readable/);
});

test('preflight: a missing declaration bundle or snapshot is refused', () => {
  const emptyDir = join(dir, 'empty');
  mkdirSync(emptyDir, { recursive: true });
  const r = preflight({ ...MENU, MENU_ASSEMBLY_DIR: emptyDir });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /MENU_DECLARATIONS_FILE/);
  assert.match(r.out, /MENU_DECLARATIONS_SNAPSHOT_FILE/);
});

test('preflight: a world-readable identity key is refused', () => {
  const open = join(dir, 'open-keys');
  mkdirSync(open);
  writeFileSync(join(open, 'identity.pem'), 'synthetic-not-a-key');
  chmodSync(join(open, 'identity.pem'), 0o644);
  const r = preflight({ ...MENU, MENU_KEY_DIR: open });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /world-readable/);
});

test('preflight: bundle without a key id, or with a path outside the mounts, is refused', () => {
  const noId = preflight({ ...MENU, MENU_IDENTITY_KEY_ID: undefined });
  assert.equal(noId.code, 1, noId.out);
  assert.match(noId.out, /MENU_IDENTITY_KEY_ID/);
  const outside = preflight({ ...MENU, MENU_DECLARATIONS_FILE: '/etc/passwd' });
  assert.equal(outside.code, 1, outside.out);
  assert.match(outside.out, /MENU_DECLARATIONS_FILE must be under \/menu-assembly\//);
});

test('preflight: a replacement PLATFORM_SYSTEMS_FILE under the mount must exist', () => {
  const r = preflight({ ...MENU, PLATFORM_SYSTEMS_FILE: '/menu-assembly/missing.json' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /PLATFORM_SYSTEMS_FILE/);
});

// --- compose -----------------------------------------------------------------------------------

test('production compose: backend passes MENU_* with empty defaults and mounts both dirs read-only', () => {
  const backend = production.match(/^ {2}backend:\n([\s\S]*?)(?=^ {2}\S|^\S)/m)[1];
  for (const key of [
    'MENU_DECLARATIONS_FILE',
    'MENU_DECLARATIONS_SNAPSHOT_FILE',
    'MENU_UPSTREAM_BASE_URL',
    'MENU_IDENTITY_KEY_FILE',
    'MENU_IDENTITY_KEY_ID',
    'MENU_SCOPE_GRANT_SERVICE_URL',
  ]) {
    assert.match(backend, new RegExp(`${key}: \\$\\{${key}:-\\}`), key);
  }
  assert.match(backend, /MENU_RESOLVER_TIMEOUT_MS: \$\{MENU_RESOLVER_TIMEOUT_MS:-3000\}/);
  assert.match(backend, /MENU_UPSTREAM_TIMEOUT_MS: \$\{MENU_UPSTREAM_TIMEOUT_MS:-27000\}/);
  assert.match(backend, /\$\{MENU_ASSEMBLY_DIR:-\.\/menu-assembly\}:\/menu-assembly:ro/);
  assert.match(backend, /\$\{MENU_KEY_DIR:-\.\/menu-assembly\}:\/menu-identity:ro/);
});

const dockerCompose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
test(
  'docker compose config shows the MENU_* variables and read-only mounts for a synthetic bundle',
  { skip: dockerCompose.status === 0 ? false : 'docker compose CLI is not installed' },
  () => {
    const file = envFile({
      ...BASE,
      ...MENU,
      MINIO_IMAGE: 'site/minio:1',
    });
    const r = spawnSync(
      'docker',
      ['compose', '--env-file', file, '-f', COMPOSE, 'config', '--format', 'json'],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr.replace(/(PASSWORD|SECRET)[^\n]*/g, '$1=…'));
    const backend = JSON.parse(r.stdout).services.backend;
    for (const key of Object.keys(MENU).filter(
      (k) => k.startsWith('MENU_') && !k.endsWith('_DIR'),
    )) {
      assert.equal(backend.environment[key], MENU[key], key);
    }
    const mounts = Object.fromEntries(backend.volumes.map((v) => [v.target, v]));
    assert.equal(mounts['/menu-assembly'].source, assembly);
    assert.equal(mounts['/menu-assembly'].read_only, true);
    assert.equal(mounts['/menu-identity'].source, keys);
    assert.equal(mounts['/menu-identity'].read_only, true);
  },
);

// --- build-web-image.sh --dist -----------------------------------------------------------------

function stubDocker() {
  const bin = join(dir, `bin-${n++}`);
  mkdirSync(bin);
  const log = join(bin, 'calls.log');
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`);
  chmodSync(join(bin, 'docker'), 0o755);
  return { bin, log };
}

test('build-web-image.sh --dist packages a prebuilt dist with the same Dockerfile and tags it', () => {
  const dist = join(dir, 'prebuilt-dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'index.html'), '<html></html>');
  const { bin, log } = stubDocker();
  const r = spawnSync('bash', [BUILD_WEB, '--dist', dist, '--tag', 'v0.36.0'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  assert.equal(r.status, 0, r.stderr);
  const calls = readFileSync(log, 'utf8');
  assert.match(calls, /^build /m);
  assert.match(calls, /-f \S*apps\/platform-web\/Dockerfile\b/);
  assert.match(calls, /-t platform-release-web:v0\.36\.0/);
  // pnpm must not run on the prebuilt path (the stub PATH would not stop it, so check the output).
  assert.doesNotMatch(r.stdout + r.stderr, /build:real-prod/);
});

test('build-web-image.sh --dist refuses a directory without index.html and builds nothing', () => {
  const empty = join(dir, 'empty-dist');
  mkdirSync(empty);
  const { bin, log } = stubDocker();
  const r = spawnSync('bash', [BUILD_WEB, '--dist', empty], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /index\.html/);
  assert.throws(() => readFileSync(log, 'utf8'));
});

test('build-web-image.sh rejects an invalid tag', () => {
  const { bin } = stubDocker();
  const r = spawnSync('bash', [BUILD_WEB, '--dist', dir, '--tag', 'bad tag'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  assert.equal(r.status, 2);
});
