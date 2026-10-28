import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { archiveFiles, readme } from './sdk-schemas.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(repoRoot, 'tooling', 'sdk', 'sdk-schemas.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'ap-sdk-schemas-test-'));

test('the archive holds exactly the schemas, endpoints, vocab and a README, with a matching SHA256SUMS-schemas', () => {
  const parent = tmp();
  const out = join(parent, 'out');
  try {
    const run = spawnSync('node', [script, '--version', '0.0.0-ci', '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(readdirSync(out).sort(), ['SHA256SUMS-schemas', 'contract-schemas-0.0.0-ci.tgz']);

    const listing = spawnSync('tar', ['-tzf', join(out, 'contract-schemas-0.0.0-ci.tgz')], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
    const schemas = readdirSync(join(repoRoot, 'packages/sdk/contract-schemas/schemas')).filter((file) => file.endsWith('.json')).sort();
    assert.ok(schemas.length > 0);
    assert.deepEqual(listing, [...schemas.map((file) => `schemas/${file}`), 'endpoints.json', 'vocab.json', 'README.md']);
    assert.deepEqual(listing, archiveFiles());

    const sum = createHash('sha256').update(readFileSync(join(out, 'contract-schemas-0.0.0-ci.tgz'))).digest('hex');
    assert.equal(readFileSync(join(out, 'SHA256SUMS-schemas'), 'utf8'), `${sum}  contract-schemas-0.0.0-ci.tgz\n`);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('vocab.json in the archive is the contracts copy, not a rebuilt one', () => {
  const parent = tmp();
  const out = join(parent, 'out');
  try {
    assert.equal(spawnSync('node', [script, '--version', '1.2.3', '--out', out], { encoding: 'utf8' }).status, 0);
    const vocab = spawnSync('tar', ['-xzOf', join(out, 'contract-schemas-1.2.3.tgz'), 'vocab.json'], { encoding: 'utf8' }).stdout;
    assert.equal(vocab, readFileSync(join(repoRoot, 'packages/sdk/contracts/src/vocab.json'), 'utf8'));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a non-empty --out and a loose version are refused, and nothing in --out is deleted', () => {
  const out = tmp();
  try {
    writeFileSync(join(out, 'keep.txt'), 'x');
    const busy = spawnSync('node', [script, '--version', '1.2.3', '--out', out], { encoding: 'utf8' });
    assert.notEqual(busy.status, 0);
    assert.match(busy.stderr, /not empty/);
    assert.deepEqual(readdirSync(out), ['keep.txt']);
    const loose = spawnSync('node', [script, '--version', 'v1', '--out', join(out, 'new')], { encoding: 'utf8' });
    assert.notEqual(loose.status, 0);
    assert.match(loose.stderr, /not a SemVer/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the README names the version', () => {
  assert.match(readme('4.5.6'), /^# contract-schemas 4\.5\.6/);
});

// endpoints.json is generated from the menu sources, which turbo's cache for the package `test` cannot see; this is its gate (P3).
test('endpoints.json matches the menu endpoint declarations', () => {
  const run = spawnSync('pnpm', ['--filter', '@ap/contract-schemas', 'run', 'check:endpoints'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});
