import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { releasePackages } from './sdk-exports.mjs';
import { assemblyHash, assertAssembly, downloadPrevious, replaceBundle, runSequence, verifyBundle, FINAL_REPORT } from './sdk-upgrade-gate.mjs';

const names = releasePackages().map(({ name }) => name);
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(action) {
  const root = mkdtempSync(join(tmpdir(), 'ap-upgrade-test-'));
  return Promise.resolve().then(() => action(root)).finally(() => rmSync(root, { recursive: true, force: true }));
}
function bundle(root, version) {
  const directory = join(root, version);
  mkdirSync(directory);
  const sums = names.map(name => {
    const file = `ap-${name}-${version}.tgz`;
    writeFileSync(join(directory, file), name);
    return `${hash(name)}  ${file}`;
  }).join('\n') + '\n';
  writeFileSync(join(directory, 'SHA256SUMS'), sums);
  return { directory, version, sha256: hash(sums) };
}
function project(root) {
  const directory = join(root, 'project');
  mkdirSync(directory);
  writeFileSync(join(directory, 'menus.ts'), 'export const menus = [];\n');
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ dependencies: { react: '19', ...Object.fromEntries(names.map(name => [`@ap/${name}`, 'old'])) } }));
  return directory;
}

test('pin identifies the actual rc and authenticated sums', () => {
  const pin = JSON.parse(readFileSync(new URL('./previous-bundle.json', import.meta.url)));
  assert.equal(pin.version, '0.35.0-rc.1');
  assert.equal(pin.url, 'https://github.com/hjung3113/analytics-platform/releases/tag/sdk-v0.35.0-rc.1');
  assert.equal(pin.sha256, 'be7d57614b56be98c6d659728b989192d0abd558603e7b7d122d5c944fa77b52');
});
test('download is injectable with a local directory and always verifies checksums', () => fixture(async root => {
  const previous = bundle(root, '0.35.0-rc.1');
  const received = [];
  await downloadPrevious(previous, join(root, 'download'), async (pin, destination) => {
    received.push(pin);
    const { cpSync } = await import('node:fs');
    cpSync(previous.directory, destination, { recursive: true });
  });
  assert.deepEqual(received, [previous]);
}));
test('every missing tarball names its exact file, including unit 2', () => fixture(root => {
  for (const name of names) {
    const entry = bundle(root, `0.0.0-${name}`);
    const file = `ap-${name}-${entry.version}.tgz`;
    rmSync(join(entry.directory, file));
    assert.throws(() => verifyBundle(entry.directory, entry), error => error.message.includes(file));
  }
}));
test('checksum list and payload corruption fail before install', () => fixture(root => {
  const entry = bundle(root, '0.0.0-a');
  assert.throws(() => verifyBundle(entry.directory, { ...entry, sha256: '0'.repeat(64) }), /SHA256SUMS checksum/);
  writeFileSync(join(entry.directory, 'ap-kernel-0.0.0-a.tgz'), 'corrupt');
  assert.throws(() => verifyBundle(entry.directory, entry), /checksum.*ap-kernel/);
}));
test('replacement rewrites exactly nine specifiers atomically and preserves third parties', () => fixture(root => {
  const entry = bundle(root, '0.0.0-b');
  const kit = project(root);
  replaceBundle(kit, entry.directory, 'http://127.0.0.1:1234/b');
  const dependencies = JSON.parse(readFileSync(join(kit, 'package.json'))).dependencies;
  assert.equal(dependencies.react, '19');
  for (const name of names) assert.equal(dependencies[`@ap/${name}`], `http://127.0.0.1:1234/b/ap-${name}-${entry.version}.tgz`);
  rmSync(join(entry.directory, `ap-kernel-${entry.version}.tgz`));
  const before = readFileSync(join(kit, 'package.json'), 'utf8');
  assert.throws(() => replaceBundle(kit, entry.directory, 'bad'), /kernel/);
  assert.equal(readFileSync(join(kit, 'package.json'), 'utf8'), before);
}));
test('assembly hash ignores install/build state and detects a single assembly line', () => fixture(root => {
  const kit = project(root);
  const before = assemblyHash(kit);
  writeFileSync(join(kit, 'pnpm-lock.yaml'), 'changed');
  mkdirSync(join(kit, 'dist'));
  writeFileSync(join(kit, 'dist', 'app.js'), 'built');
  assertAssembly(kit, before);
  writeFileSync(join(kit, 'menus.ts'), 'export const menus = [1];\n');
  assert.throws(() => assertAssembly(kit, before), /assembly code changed/);
}));
test('named sequence runs rc/save, formal/restore, rollback/restore with one assembly', () => fixture(async root => {
  const kit = project(root);
  const phases = [];
  const output = [];
  await runSequence({ root: kit, previous: 'previous', formal: 'formal', log: line => output.push(line), execute: async (phase, directory, mode) => phases.push([phase, directory, mode]) });
  assert.deepEqual(phases, [['rc', 'previous', 'save'], ['formal', 'formal', 'restore'], ['rollback', 'previous', 'restore']]);
  assert.ok(output.some(line => line.includes('save view')));
  assert.ok(output.some(line => line.includes('rollback')));
  assert.equal(output.at(-1), FINAL_REPORT);
  assert.equal(FINAL_REPORT, 'rc-based replacement passed; first real N-1 to N is v0.37.0');
}));
test('editing one assembly line between runs fails before replacement', () => fixture(async root => {
  const kit = project(root);
  const phases = [];
  await assert.rejects(runSequence({ root: kit, previous: 'a', formal: 'b', log: () => {}, execute: async phase => {
    phases.push(phase);
    writeFileSync(join(kit, 'menus.ts'), 'changed assembly line');
  } }), /assembly code changed/);
  assert.deepEqual(phases, ['rc']);
}));
test('nonzero execution failure aborts without a passing report', () => fixture(async root => {
  const output = [];
  await assert.rejects(runSequence({ root: project(root), previous: 'a', formal: 'b', log: line => output.push(line), execute: async () => { throw new Error('exit 7'); } }), /exit 7/);
  assert.ok(!output.includes(FINAL_REPORT));
}));
test('CI isolates the upgrade cost and runs SDK upgrade gate after consumer and negatives', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const job = workflow.slice(workflow.indexOf('\n  sdk-upgrade-gate:'), workflow.indexOf('\n  sdk-upgrade-gate-selftest:'));
  assert.match(job, /name: SDK upgrade gate/);
  assert.match(job, /needs: \[changes, platform-static\]/);
  const consumer = workflow.indexOf('pnpm sdk:consumer-check');
  const negatives = workflow.indexOf('node tooling/sdk/sdk-consumer-negatives.mjs');
  assert.ok(consumer > 0 && consumer < negatives && negatives < workflow.indexOf('\n  sdk-upgrade-gate:'));
  assert.match(job, /node tooling\/sdk\/sdk-upgrade-gate.mjs/);
  assert.match(workflow, /UPGRADE: \$\{\{ needs.sdk-upgrade-gate.result \}\}/);
  assert.doesNotMatch(job, /--self-test/);
  const selftest = workflow.slice(workflow.indexOf('\n  sdk-upgrade-gate-selftest:'), workflow.indexOf('\n  platform-workspace:'));
  assert.match(selftest, /name: SDK upgrade gate self-test/);
  assert.match(selftest, /node tooling\/sdk\/sdk-upgrade-gate.mjs --self-test/);
  assert.match(workflow, /SELFTEST: \$\{\{ needs.sdk-upgrade-gate-selftest.result \}\}/);
});

test('assembly manifest scripts stay protected while nine release URLs change', () => fixture(root => {
  const kit = project(root);
  const entry = bundle(root, '0.0.0-c');
  const expected = assemblyHash(kit);
  replaceBundle(kit, entry.directory, 'http://127.0.0.1:1234/c');
  assertAssembly(kit, expected);
  const manifest = JSON.parse(readFileSync(join(kit, 'package.json')));
  manifest.scripts = { build: 'changed assembly command' };
  writeFileSync(join(kit, 'package.json'), JSON.stringify(manifest));
  assert.throws(() => assertAssembly(kit, expected), /assembly code changed/);
}));
test('required upgrade verdict rejects every failed, cancelled, missing or skipped gate for code changes', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const verdict = workflow.split('      - name: SDK upgrade verdict\n')[1].split('      - name: Shard verdict')[0];
  const script = verdict.split('        run: |\n')[1].trim();
  for (const CODE of ['true', '', 'false']) {
    for (const UPGRADE of ['success', 'failure', 'cancelled', 'skipped', '']) {
      for (const SELFTEST of ['success', 'failure', 'cancelled', 'skipped', '']) {
        const result = spawnSync('sh', ['-e', '-c', script], { cwd: new URL('../..', import.meta.url), env: { ...process.env, CODE, UPGRADE, SELFTEST } });
        assert.equal(result.status === 0, CODE === 'false' || (UPGRADE === 'success' && SELFTEST === 'success'), JSON.stringify({ CODE, UPGRADE, SELFTEST }));
      }
    }
  }
});
