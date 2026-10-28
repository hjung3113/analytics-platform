// Focused test for the dev-database guard in test-integration.sh: an env file whose
// DATABASE_URL or DATABASE_URL_MIGRATE targets port 5434 (the development database)
// is refused unless FEEDBACKOPS_ALLOW_DEV_DB=1. Every case stops before vitest:
// either at the guard or at the NODE_ENV=production refusal that follows it, so no
// database is ever reached.
// Run: node scripts/test-integration.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('test-integration.sh', import.meta.url));
const url = (role, port) => `postgres://${role}:${role}@localhost:${port}/platform`;
const connectionUrl = (role, target) => (typeof target === 'number' ? url(role, target) : target);

const cases = [
  ['app URL on 5434', 5434, 5439, {}, 'refusing DATABASE_URL on port 5434'],
  ['migrate URL on 5434', 5439, 5434, {}, 'refusing DATABASE_URL_MIGRATE on port 5434'],
  ['5434 with the opt-in', 5434, 5434, { FEEDBACKOPS_ALLOW_DEV_DB: '1' }, 'NODE_ENV=production'],
  ['throwaway port', 5439, 5439, {}, 'NODE_ENV=production'],
];

const devTargets = [
  ['query overrides authority', 'postgres://u:p@localhost:5432/platform?port=5434', {}],
  ['query without authority port', 'postgres://u:p@localhost/platform?port=5434', {}],
  [
    'at sign in query',
    'postgres://u:p@localhost:5434/platform?application_name=review@host',
    {},
  ],
  ['zero-padded port', 'postgres://u:p@localhost:05434/platform', {}],
  ['PGPORT fallback', 'postgres://u:p@localhost/platform', { PGPORT: '5434' }],
];
for (const variable of ['DATABASE_URL', 'DATABASE_URL_MIGRATE']) {
  for (const [shape, target, extraEnv] of devTargets) {
    for (const allow of [false, true]) {
      cases.push([
        `${variable}: ${shape}, opt-in=${allow}`,
        variable === 'DATABASE_URL' ? target : 5439,
        variable === 'DATABASE_URL_MIGRATE' ? target : 5439,
        { ...extraEnv, ...(allow ? { FEEDBACKOPS_ALLOW_DEV_DB: '1' } : {}) },
        allow ? 'NODE_ENV=production' : `refusing ${variable} on port 5434`,
      ]);
    }
  }
  for (const allow of [false, true]) {
    cases.push([
      `${variable}: invalid URL, opt-in=${allow}`,
      variable === 'DATABASE_URL' ? 'postgres://u:p@[invalid/platform' : 5439,
      variable === 'DATABASE_URL_MIGRATE' ? 'postgres://u:p@[invalid/platform' : 5439,
      allow ? { FEEDBACKOPS_ALLOW_DEV_DB: '1' } : {},
      `refusing ${variable}: cannot resolve PostgreSQL port`,
    ]);
  }
}
cases.push([
  'default port',
  'postgres://u:p@localhost/platform',
  'postgres://u:p@localhost/platform',
  {},
  'NODE_ENV=production',
]);
cases.push([
  'explicit 5439 overrides PGPORT',
  5439,
  5439,
  { PGPORT: '5434' },
  'NODE_ENV=production',
]);

const dir = mkdtempSync(join(tmpdir(), 'test-integration-guard-'));
let failures = 0;
try {
  for (const [name, appPort, migratePort, extraEnv, expected] of cases) {
    const envFile = join(dir, 'guard.env');
    writeFileSync(
      envFile,
      `DATABASE_URL=${connectionUrl('platform_app', appPort)}\nDATABASE_URL_MIGRATE=${connectionUrl('platform_migrate', migratePort)}\nWORKSPACE_ID=00000000-0000-0000-0000-000000000001\n`,
    );
    const { FEEDBACKOPS_ALLOW_DEV_DB: _inherited, PGPORT: _pgport, ...inherited } = process.env;
    const env = {
      ...inherited,
      FEEDBACKOPS_ENV_FILE: envFile,
      NODE_ENV: 'production',
      ...extraEnv,
    };
    const run = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
    try {
      assert.equal(run.status, 1, `${name}: exit`);
      assert.ok(run.stderr.includes(expected), `${name}: stderr names "${expected}"`);
      process.stdout.write(`ok - ${name}\n`);
    } catch (err) {
      failures += 1;
      console.error(`not ok - ${name}\n${err.message}\nstderr: ${run.stderr}`);
    }
  }
  // Execute the actual root backend command against a harmless vitest executable.
  // A fully populated caller environment must never reach globalSetup's reset condition.
  const manifest = JSON.parse(
    readFileSync(new URL('../../../apps/platform-api/package.json', import.meta.url), 'utf8'),
  );
  const probe = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ db: ['DATABASE_URL', 'DATABASE_URL_MIGRATE', 'WORKSPACE_ID'].some(k => k in process.env), optedOut: process.env.ALLOW_SKIPPED_INTEGRATION === '1' }));
`;
  for (const bin of ['vitest', 'pnpm']) {
    writeFileSync(join(dir, bin), probe);
    chmodSync(join(dir, bin), 0o755);
  }
  const caller = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    DATABASE_URL: url('platform_app', 5439),
    DATABASE_URL_MIGRATE: url('platform_migrate', 5439),
    WORKSPACE_ID: 'test',
    ALLOW_SKIPPED_INTEGRATION: '1',
    NODE_ENV: 'test',
  };
  const root = spawnSync('bash', ['-c', manifest.scripts.test], { env: caller, encoding: 'utf8' });
  assert.equal(root.status, 0, root.stderr);
  assert.deepEqual(JSON.parse(root.stdout), { db: false, optedOut: true });
  console.log(
    'ok - actual root backend command strips all reset inputs with a populated caller env',
  );
  const integrationEnv = join(dir, 'integration.env');
  writeFileSync(
    integrationEnv,
    `DATABASE_URL=${url('platform_app', 5439)}
DATABASE_URL_MIGRATE=${url('platform_migrate', 5439)}
WORKSPACE_ID=test
ALLOW_SKIPPED_INTEGRATION=1
`,
  );
  const integration = spawnSync('bash', [SCRIPT], {
    env: { ...caller, FEEDBACKOPS_ENV_FILE: integrationEnv },
    encoding: 'utf8',
  });
  assert.equal(integration.status, 0, integration.stderr);
  assert.deepEqual(JSON.parse(integration.stdout), { db: true, optedOut: false });
  console.log(
    'ok - separate integration path retains DB inputs and clears caller/env-file opt-out',
  );
  for (const missing of ['DATABASE_URL', 'DATABASE_URL_MIGRATE', 'WORKSPACE_ID']) {
    const env = { ...caller, FEEDBACKOPS_ENV_FILE: integrationEnv };
    delete env[missing];
    writeFileSync(
      integrationEnv,
      `${Object.entries(env)
        .filter(([key]) => ['DATABASE_URL', 'DATABASE_URL_MIGRATE', 'WORKSPACE_ID'].includes(key))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
    );
    const run = spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.ok(run.stderr.includes(`does not set ${missing}`));
  }
  console.log('ok - integration requires each of the three DB environment inputs');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} test case(s) failed`);
  process.exit(1);
}
process.stdout.write('\ntest-integration guard tests: OK\n');
