import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { checkMigration } from './migration-additive-check.mjs';

const script = resolve(import.meta.dirname, 'migration-additive-check.mjs');

test('each forbidden statement fails, in any case and quoting', () => {
  for (const sql of [
    'DROP TABLE "core"."old";',
    'alter table t drop column c;',
    'ALTER TABLE t RENAME TO t2;',
    'ALTER TABLE t RENAME COLUMN a TO b;',
    'ALTER TABLE t ALTER COLUMN "c" SET DATA TYPE bigint;',
    'ALTER TABLE t ALTER COLUMN c TYPE text;',
    'ALTER TABLE t ALTER COLUMN c SET NOT NULL;',
  ]) {
    assert.equal(checkMigration('m.sql', sql).failures.length, 1, sql);
  }
});

test('additive statements and comments that name a forbidden statement pass', () => {
  const sql = [
    '-- A later release will DROP COLUMN legacy; this one keeps it.',
    '/* RENAME TO is not used here */',
    'CREATE TABLE t (id uuid NOT NULL);',
    'ALTER TABLE t ADD COLUMN c text;--> statement-breakpoint',
    'ALTER TABLE t DROP CONSTRAINT k; ALTER TABLE t ADD CONSTRAINT k CHECK (c IS NOT NULL);',
  ].join('\n');
  assert.deepEqual(checkMigration('m.sql', sql), { failures: [], notes: [] });
});

test('an allow line with a reason passes and is reported; without a reason it fails', () => {
  const allowed = checkMigration(
    'm.sql',
    '-- additive-check: allow backfilled in 0141, previous backend never writes NULL\nALTER TABLE t ALTER COLUMN c SET NOT NULL;',
  );
  assert.deepEqual(allowed.failures, []);
  assert.match(allowed.notes[0], /allowed — backfilled in 0141/);
  assert.match(
    checkMigration('m.sql', '-- additive-check: allow\nDROP TABLE t;').failures[0],
    /has no reason/,
  );
});

function withRepo(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ap-migration-additive-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'test');
    const dir = join(root, 'apps/platform-api/migrations');
    mkdirSync(dir, { recursive: true });
    const add = (name, sql, message) => {
      writeFileSync(join(dir, name), sql);
      git('add', '.');
      git('commit', '-q', '-m', message);
    };
    const run = (...args) => spawnSync('node', [script, ...args], { cwd: root, encoding: 'utf8' });
    fn({ add, git, run });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('checks only migrations added since the latest release tag, skipping rc tags', () => {
  withRepo(({ add, git, run }) => {
    add('0001_old.sql', 'ALTER TABLE t DROP COLUMN c;', 'old release drops');
    git('tag', 'v1.0.0');
    add('0002_new.sql', 'CREATE TABLE u (id int);', 'additive');
    git('tag', 'v1.1.0-rc.1');
    const pass = run();
    assert.equal(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, /1 migration file\(s\) since v1\.0\.0 only add/);
    add('0003_bad.sql', 'ALTER TABLE u RENAME TO v;', 'rename');
    const fail = run();
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /0003_bad\.sql: RENAME/);
    assert.doesNotMatch(fail.stderr, /0001_old/);
    assert.equal(run('--base', 'HEAD').status, 0, 'nothing added since HEAD');
  });
});

test('refuses unknown arguments', () => {
  const result = spawnSync('node', [script, '--nope'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});
