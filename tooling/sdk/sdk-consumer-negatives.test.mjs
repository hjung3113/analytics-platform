// Unit tests for the negative-check table (network-free; the end-to-end run is `node tooling/sdk/sdk-consumer-negatives.mjs`).
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { scanBuildOutput } from './sdk-kit-check.mjs';
import { assertComplete, kernelCopyMismatches, NEGATIVES, NEGATIVE_IDS, manifestFailures, runNegativeTable, removeStoreDependency } from './sdk-consumer-negatives.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'out-of-repo-assembly', 'negatives');

test('the table is exactly the ten §10.5 ids, each once, each with a reason', () => {
  assert.deepEqual(NEGATIVE_IDS, [
    'duplicate-menu-id', 'undeclared-permission', 'unsupported-contract-integer', 'missing-required-host-feature', 'two-kernel-copies',
    'removed-menu-stored-items-kept', 'unknown-url-key-preserved', 'sourcemap-in-output', 'external-origin-in-output', 'install-needs-network',
  ]);
  assert.equal(new Set(NEGATIVE_IDS).size, 10);
  for (const entry of NEGATIVES) assert.ok(entry.reason.length > 0, `${entry.id} needs its own reason`);
});

test('every vitest id has its fixture file, and every fixture file belongs to a vitest id', () => {
  for (const entry of NEGATIVES.filter((candidate) => candidate.kind === 'vitest')) {
    assert.ok(existsSync(join(FIXTURES, `${entry.id}.test.tsx`)), `${entry.id}.test.tsx is missing`);
  }
  for (const entry of NEGATIVES.filter((candidate) => candidate.kind !== 'vitest')) {
    assert.ok(!existsSync(join(FIXTURES, `${entry.id}.test.tsx`)), `${entry.id} is not a vitest id; its fixture would never run`);
  }
});

test('a run that skips any one id fails naming that id (every id in turn)', async () => {
  for (const skipped of NEGATIVE_IDS) {
    const ran = NEGATIVE_IDS.filter((id) => id !== skipped);
    const wanted = new RegExp(`missing: ${skipped}( |$)`);
    const executed = [];
    await assert.rejects(runNegativeTable(async ({ id }) => executed.push(id), [skipped]), wanted, `${skipped} must be named`);
    assert.deepEqual(executed, ran);
  }
  assert.doesNotThrow(() => assertComplete(NEGATIVE_IDS));
});

test('each runner failure names its ID and preserves its own reason', async () => {
  for (const target of NEGATIVE_IDS) {
    await assert.rejects(runNegativeTable(async ({ id }) => {
      if (id === target) throw new Error('probe rejection');
    }), { message: `${target}: probe rejection` });
  }
});

/** A consumer tree: `@ap/<name>` dirs that resolve `@ap/kernel` by walking up to the app-level copy. */
function consumerTree(root) {
  const kernel = join(root, 'node_modules', '@ap', 'kernel');
  mkdirSync(kernel, { recursive: true });
  writeFileSync(join(kernel, 'package.json'), '{"name":"@ap/kernel","version":"0.0.0"}\n');
  for (const name of ['components', 'shell', 'app-host']) {
    const dir = join(root, 'node_modules', '@ap', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), `{"name":"@ap/${name}","version":"0.0.0"}\n`);
  }
  return kernel;
}

test('kernelCopyMismatches: one kernel copy is clean; a second copy nested under @ap/components is named', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-sdk-neg-kernel-'));
  try {
    const kernel = consumerTree(root);
    assert.deepEqual(kernelCopyMismatches(root), [], 'a single kernel copy is no mismatch');
    const planted = join(root, 'node_modules', '@ap', 'components', 'node_modules', '@ap', 'kernel');
    cpSync(kernel, planted, { recursive: true });
    const found = kernelCopyMismatches(root);
    assert.equal(found.length, 1);
    assert.match(found[0], /two-kernel-copies: @ap\/components resolves @ap\/kernel to /);
    assert.match(found[0], new RegExp(`the app resolves ${kernel.replaceAll('/', '\\/')}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('manifestFailures: an empty directory fails on the nine missing tarballs, kernel among them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-sdk-neg-manifests-'));
  try {
    const problems = manifestFailures(dir);
    assert.ok(problems.some((line) => /missing tarball for @ap\/kernel/.test(line)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Only the private warmed store may be edited; a missing index forces pnpm's offline resolution to fail.
test('removeStoreDependency removes exactly the selected dependency from a warmed store', () => {
  const store = mkdtempSync(join(tmpdir(), 'ap-sdk-neg-store-'));
  try {
    const versioned = join(store, 'v11');
    mkdirSync(versioned);
    const db = new DatabaseSync(join(versioned, 'index.db'));
    db.exec('CREATE TABLE package_index (key TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID');
    const insert = db.prepare('INSERT INTO package_index VALUES (?, ?)');
    for (const key of ['sha512-a\ttypescript@1.2.3', 'sha512-b\treact@1.2.3', 'sha512-c\ttypescript@1.2.4']) insert.run(key, new Uint8Array());
    db.close();
    assert.equal(removeStoreDependency(store, 'typescript', '1.2.3'), 1);
    const after = new DatabaseSync(join(versioned, 'index.db'), { readOnly: true });
    try {
      assert.deepEqual(after.prepare('SELECT key FROM package_index ORDER BY key').all().map(row => row.key), [
        'sha512-b\treact@1.2.3', 'sha512-c\ttypescript@1.2.4',
      ]);
    } finally { after.close(); }
    assert.throws(() => removeStoreDependency(store, 'typescript', '1.2.3'), /typescript@1.2.3.*not found/);
  } finally {
    rmSync(store, { recursive: true, force: true });
  }
});

test('build-output scans reject a map and an unlisted origin with distinct reasons', () => {
  const dist = mkdtempSync(join(tmpdir(), 'ap-sdk-neg-output-'));
  try {
    writeFileSync(join(dist, 'allowed.js'), '"http://www.w3.org/2000/svg";"https://react.dev/errors/1";');
    assert.deepEqual(scanBuildOutput(dist), []);
    writeFileSync(join(dist, 'probe.js.map'), '{}');
    writeFileSync(join(dist, 'probe.js'), '"https://external-origin.negatives.example/leak";');
    const failures = scanBuildOutput(dist);
    assert.ok(failures.some((message) => message === 'probe.js.map: source map in the build output'));
    assert.ok(failures.some((message) => message === 'probe.js: external origin https://external-origin.negatives.example'));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
