// Focused test for the platform infrastructure identities (#1100 b): compose project/container/volume names, the
// pinned legacy data volumes, the smoke script's owned volumes, the Keycloak realm/client and the storage defaults.
// No Docker or database is reached: image-smoke.sh --print-identity exits before any compose call, and the compose
// and realm files are read as text/JSON.
// Run: node scripts/release/release-identity.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const SMOKE = fileURLToPath(new URL('image-smoke.sh', import.meta.url));
const release = read('../../docker-compose.release.yml');
const dev = read('../../docker-compose.dev.yml');

const LEGACY_RELEASE_PG = 'feedbackops-release-1060_release-postgres-data';
const LEGACY_RELEASE_MINIO = 'feedbackops-release-1060_release-minio-data';
const LEGACY_DEV_DB = 'feedbackops_feedbackops-db-data';

/** Resolve a compose `name: ${VAR:-default}` volume name the way compose does, for one environment. */
function volumeName(compose, key, env = {}) {
  const block = compose.match(
    new RegExp(`^ {2}${key}:\\n(?: {4}labels: .+\\n)? {4}name: (.+)$`, 'm'),
  );
  assert.ok(block, `volume ${key} has an explicit name`);
  const interpolated = block[1].match(/^\$\{(\w+):-([^}]+)\}$/);
  if (interpolated) return env[interpolated[1]] || interpolated[2];
  return block[1];
}

function smoke(args, env = {}) {
  const result = spawnSync('bash', [SMOKE, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
  const identity = result.stderr.split('\n').find((line) => line.startsWith('{"project"'));
  return {
    code: result.status,
    verdict: JSON.parse(result.stdout.trim().split('\n').pop()),
    identity: identity ? JSON.parse(identity) : null,
  };
}

test('release compose: project and images use the platform names', () => {
  assert.match(release, /^name: platform-api$/m);
  assert.doesNotMatch(release, /feedbackops-release-1060-(backend|migrate)|platform-release-1060/);
  assert.match(release, /image: platform-release-backend:local/);
  assert.match(release, /image: platform-release-migrate:local/);
  assert.match(release, /OIDC_CLIENT_ID: platform-release-local/);
  assert.match(release, /STORAGE_S3_BUCKET: \$\{STORAGE_S3_BUCKET:-platform-attachments\}/);
  assert.doesNotMatch(release, /feedbackops-release-local|fops-attachments/);
});

test('release compose: legacy data volumes are pinned by default, each independently overridable', () => {
  assert.equal(volumeName(release, 'release-postgres-data'), LEGACY_RELEASE_PG);
  assert.equal(volumeName(release, 'release-minio-data'), LEGACY_RELEASE_MINIO);
  // An existing install under another project name selects its own volumes, one variable per volume.
  const env = {
    RELEASE_POSTGRES_VOLUME: 'old-proj_release-postgres-data',
    RELEASE_MINIO_VOLUME: 'old-proj_release-minio-data',
  };
  assert.equal(volumeName(release, 'release-postgres-data', env), env.RELEASE_POSTGRES_VOLUME);
  assert.equal(volumeName(release, 'release-minio-data', env), env.RELEASE_MINIO_VOLUME);
  assert.equal(
    volumeName(release, 'release-postgres-data', { RELEASE_MINIO_VOLUME: 'x' }),
    LEGACY_RELEASE_PG,
  );
});

test('dev compose: platform project and containers keep the existing database volume and MinIO bind', () => {
  assert.match(dev, /^name: platform-api$/m);
  for (const container of ['db', 'minio', 'keycloak', 'mailpit']) {
    assert.match(dev, new RegExp(`container_name: platform-${container}$`, 'm'));
  }
  assert.doesNotMatch(dev, /container_name: feedbackops-/);
  assert.equal(volumeName(dev, 'platform-db-data'), LEGACY_DEV_DB);
  assert.match(dev, /^ {6}- platform-db-data:\/var\/lib\/postgresql\/data$/m);
  assert.match(dev, /^ {6}- \.\/minio_data:\/data$/m);
  assert.match(dev, /MINIO_ROOT_USER: platform-minio$/m);
  assert.match(dev, /MINIO_ROOT_PASSWORD: fops-minio-secret-change-me$/m);
});

test('image smoke owns its volumes and ignores operator volume selections', () => {
  const { code, verdict, identity } = smoke(['--print-identity']);
  assert.equal(code, 0);
  assert.equal(verdict.status, 'passed');
  assert.deepEqual(identity, {
    project: 'platform-api-smoke',
    postgresVolume: 'platform-api-smoke_smoke-postgres-data',
    minioVolume: 'platform-api-smoke_smoke-minio-data',
  });
  // Operator selections of the pinned legacy volumes (caller env or any other source) never reach a smoke run.
  const hostile = smoke(['--print-identity'], {
    RELEASE_POSTGRES_VOLUME: LEGACY_RELEASE_PG,
    RELEASE_MINIO_VOLUME: LEGACY_RELEASE_MINIO,
    RELEASE_PROJECT_NAME: 'owned-check-1',
  });
  assert.deepEqual(hostile.identity, {
    project: 'owned-check-1',
    postgresVolume: 'owned-check-1_smoke-postgres-data',
    minioVolume: 'owned-check-1_smoke-minio-data',
  });
  for (const volume of [
    identity.postgresVolume,
    identity.minioVolume,
    hostile.identity.postgresVolume,
  ]) {
    assert.ok(![LEGACY_RELEASE_PG, LEGACY_RELEASE_MINIO, LEGACY_DEV_DB].includes(volume));
  }
});

test('image smoke refuses the legacy operator project and unknown arguments', () => {
  const legacy = smoke(['--print-identity'], { RELEASE_PROJECT_NAME: 'feedbackops-release-1060' });
  assert.equal(legacy.code, 1);
  assert.equal(legacy.verdict.status, 'failed');
  assert.match(legacy.verdict.reason, /operator-project/);
  // The operator default project (ADR-0097) is never the smoke's, even when named explicitly.
  const operatorDefault = smoke(['--print-identity'], { RELEASE_PROJECT_NAME: 'platform-api' });
  assert.equal(operatorDefault.code, 1);
  assert.match(operatorDefault.verdict.reason, /operator-project/);
  assert.equal(smoke(['--print-identity', 'extra']).code, 1);
});

test('Keycloak realm file: platform realm/client with the unchanged security controls', () => {
  const realm = JSON.parse(read('../../deploy/keycloak/platform-realm.json'));
  assert.equal(realm.realm, 'platform');
  const [client, ...others] = realm.clients;
  assert.equal(others.length, 0);
  assert.equal(client.clientId, 'platform');
  assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
  assert.equal(client.publicClient, false);
  assert.equal(client.standardFlowEnabled, true);
  assert.equal(client.implicitFlowEnabled, false);
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.secret, '${PLATFORM_API_CLIENT_SECRET}');
  assert.deepEqual(client.redirectUris, ['${PLATFORM_API_REDIRECT_URI}']);
  assert.deepEqual(client.webOrigins, ['${PLATFORM_API_WEB_ORIGIN}']);
  assert.equal(realm.verifyEmail, true);
  assert.equal(realm.registrationAllowed, true);
  assert.equal(realm.sslRequired, 'external');
  assert.match(JSON.stringify(realm), /\$\{KC_ALLOWED_EMAIL_PATTERN\}/);
  assert.doesNotMatch(JSON.stringify(realm), /FEEDBACKOPS_/);
});

test('dev compose mounts the renamed realm file and passes the renamed placeholders', () => {
  assert.match(
    dev,
    /\.\/deploy\/keycloak\/platform-realm\.json:\/opt\/keycloak\/data\/import\/platform-realm\.json:ro/,
  );
  for (const key of ['CLIENT_SECRET', 'REDIRECT_URI', 'WEB_ORIGIN']) {
    assert.match(dev, new RegExp(`PLATFORM_API_${key}: `));
    assert.doesNotMatch(dev, new RegExp(`FEEDBACKOPS_${key}`));
  }
});

test('env templates use the platform issuer, client and storage defaults', () => {
  const example = read('../../.env.example');
  assert.match(example, /^# OIDC_ISSUER_URL=http:\/\/localhost:8085\/realms\/platform$/m);
  assert.match(example, /^# OIDC_CLIENT_ID=platform$/m);
  assert.match(example, /^STORAGE_S3_BUCKET=platform-attachments$/m);
  assert.match(example, /^STORAGE_S3_ACCESS_KEY_ID=platform-minio$/m);
  assert.match(read('../../.env.release.example'), /^STORAGE_S3_BUCKET=platform-attachments$/m);
});

// --- smoke ownership (fake docker seam; no real Docker) ----------------------------------------------------------

const fakeDir = mkdtempSync(join(tmpdir(), 'image-smoke-fake-'));
after(() => rmSync(fakeDir, { recursive: true, force: true }));
const FAKE_ENV_FILE = join(fakeDir, 'env.release');
const FAKE_LOG = join(fakeDir, 'docker.log');
writeFileSync(FAKE_ENV_FILE, 'POSTGRES_PASSWORD=x\n');
writeFileSync(
  join(fakeDir, 'docker'),
  `#!/usr/bin/env bash
printf '%s|PG=%s|MINIO=%s|OWNER=%s\\n' "$*" "$RELEASE_POSTGRES_VOLUME" "$RELEASE_MINIO_VOLUME" "$RELEASE_OWNER" >> "$FAKE_DOCKER_LOG"
case "$1" in
  ps) [[ -z "$FAKE_DOCKER_FAIL_LIST" ]] || exit 1; printf '%s' "$FAKE_DOCKER_CONTAINERS" ;;
  volume)
    if [[ "$*" == *label=com.docker.compose.project* ]]; then printf '%s' "$FAKE_DOCKER_PROJECT_VOLUMES"; else printf '%s' "$FAKE_DOCKER_ALL_VOLUMES"; fi ;;
  compose) [[ " $* " != *" build "* ]] || exit 1 ;; # the first mutation ends the run: nothing after it is under test
esac
`,
);
chmodSync(join(fakeDir, 'docker'), 0o755);

function smokeWithFakeDocker(args, fake = {}, env = {}) {
  writeFileSync(FAKE_LOG, '');
  const result = spawnSync('bash', [SMOKE, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${fakeDir}:${process.env.PATH}`,
      RELEASE_ENV_FILE: FAKE_ENV_FILE,
      FAKE_DOCKER_LOG: FAKE_LOG,
      FAKE_DOCKER_CONTAINERS: fake.containers ?? '',
      FAKE_DOCKER_PROJECT_VOLUMES: fake.projectVolumes ?? '',
      FAKE_DOCKER_ALL_VOLUMES: fake.allVolumes ?? '',
      ...env,
    },
  });
  const calls = readFileSync(FAKE_LOG, 'utf8').split('\n').filter(Boolean);
  return {
    code: result.status,
    verdict: JSON.parse(result.stdout.trim().split('\n').pop()),
    calls,
    compose: calls.filter((call) => call.startsWith('compose ')),
    mutating: calls.filter((call) => /^(compose|rm|volume rm|stop|kill|network rm)/.test(call)),
  };
}

const OWNED = {
  postgres: 'owned-1_smoke-postgres-data',
  minio: 'owned-1_smoke-minio-data',
};
const ENV = { RELEASE_PROJECT_NAME: 'owned-1' };

test('image smoke refuses a project with a foreign container before any compose call', () => {
  for (const args of [[], ['--down']]) {
    const run = smokeWithFakeDocker(
      args,
      { containers: 'operator-db-1|\noperator-minio-1|operator\n' },
      ENV,
    );
    assert.equal(run.code, 1, args.join(' '));
    assert.match(run.verdict.reason, /not-owned-by-the-smoke/);
    assert.deepEqual(run.mutating, [], `${args.join(' ') || 'start'} must not mutate`);
  }
});

test('image smoke refuses a project with a foreign volume, labelled or only named like an owned one', () => {
  const labelled = smokeWithFakeDocker(
    [],
    { projectVolumes: 'owned-1_release-postgres-data|\n' },
    ENV,
  );
  assert.equal(labelled.code, 1);
  assert.deepEqual(labelled.mutating, []);
  // An existing volume with the smoke's name but without its marker (e.g. created by hand) is an operator's.
  for (const args of [[], ['--down']]) {
    const named = smokeWithFakeDocker(args, { allVolumes: `${OWNED.postgres}|\n` }, ENV);
    assert.equal(named.code, 1, args.join(' '));
    assert.match(named.verdict.reason, /not-owned-by-the-smoke/);
    assert.deepEqual(named.mutating, []);
  }
  // A failing listing is not "no resources".
  const broken = smokeWithFakeDocker([], {}, { ...ENV, FAKE_DOCKER_FAIL_LIST: '1' });
  assert.equal(broken.code, 1);
  assert.equal(broken.verdict.reason, 'ownership-check-failed');
  assert.deepEqual(broken.mutating, []);
});

test('image smoke on a clean project, or its own previous stack, mounts only its own volumes', () => {
  const own = {
    containers: 'owned-1-postgres-1|smoke\n',
    projectVolumes: `${OWNED.postgres}|smoke\n${OWNED.minio}|smoke\n`,
    allVolumes: `${OWNED.postgres}|smoke\n${OWNED.minio}|smoke\n`,
  };
  for (const fake of [{}, own]) {
    const run = smokeWithFakeDocker([], fake, ENV);
    assert.equal(run.verdict.reason, 'unexpected-command-failure'); // the fake's build failure
    assert.equal(run.compose.length, 1);
    assert.match(run.compose[0], /^compose --project-name owned-1 .* build backend migrate\|/);
    // The ownership queries come first; every compose call carries only the smoke's volumes and marker.
    assert.ok(
      run.calls.findIndex((c) => c.startsWith('ps ')) <
        run.calls.findIndex((c) => c.startsWith('compose ')),
    );
    assert.ok(
      run.compose.every((c) =>
        c.endsWith(`|PG=${OWNED.postgres}|MINIO=${OWNED.minio}|OWNER=smoke`),
      ),
    );
  }
});

test('image smoke --down removes only the smoke-owned project and never touches foreign data', () => {
  const own = {
    containers: 'owned-1-postgres-1|smoke\n',
    projectVolumes: `${OWNED.postgres}|smoke\n`,
    allVolumes: `${OWNED.postgres}|smoke\n`,
  };
  const run = smokeWithFakeDocker(['--down'], own, {
    ...ENV,
    RELEASE_POSTGRES_VOLUME: LEGACY_RELEASE_PG,
    RELEASE_MINIO_VOLUME: LEGACY_RELEASE_MINIO,
  });
  assert.equal(run.code, 0);
  assert.equal(run.compose.length, 1);
  assert.match(
    run.compose[0],
    /down -v\|PG=owned-1_smoke-postgres-data\|MINIO=owned-1_smoke-minio-data\|OWNER=smoke$/,
  );
  assert.deepEqual(run.mutating, run.compose);
  // A foreign operator volume in the same project stops --down before `down -v` can reach it.
  const foreign = smokeWithFakeDocker(
    ['--down'],
    { ...own, projectVolumes: `${LEGACY_RELEASE_PG}|\n` },
    ENV,
  );
  assert.equal(foreign.code, 1);
  assert.deepEqual(foreign.mutating, []);
});

test('release compose marks every service and volume with the ownership label', () => {
  assert.match(
    release,
    /^x-ownership: &ownership\n {2}platform\.release\.owner: \$\{RELEASE_OWNER:-operator\}$/m,
  );
  const labelled = release.match(/^ {4}labels: \*ownership$/gm) ?? [];
  const services = release.match(/^ {2}[a-z-]+:\n(?= {4}(labels|profiles|image))/gm) ?? [];
  assert.equal(labelled.length, 7 + 2); // 7 services (incl. job-only cutover) + 2 volumes
  assert.ok(services.length >= 7);
});
