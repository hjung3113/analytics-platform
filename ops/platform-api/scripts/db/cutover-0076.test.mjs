// Focused test for the argument/safety refusals of cutover-0076-platform-identity.sh (#1100 a). Every case stops
// before a database is reached (URL parsing and option checks run first), so no Postgres is needed.
// The live cutover (history, rename, migrate, MD5/session/conflict refusals) is rehearsed on an exclusive 5449
// cluster by apps/platform-api/src/db/__tests__/identity-cutover.rehearsal.test.ts.
// Run: node scripts/db/cutover-0076.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
