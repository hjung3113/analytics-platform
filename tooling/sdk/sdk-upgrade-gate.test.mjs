import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { releasePackages } from './sdk-exports.mjs';
import { assemblyHash, assertAssembly, assertKitVersion, downloadPrevious, kitAsset, kitSequence, runSequence, unpackKit, verifyBundle, verifyStartKit, FINAL_REPORT } from './sdk-upgrade-gate.mjs';

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
  // The job builds the current kit with sdk-kit.mjs, which lists tracked files with git inside a container of another uid.
  assert.ok(job.indexOf('git config --global --add safe.directory "$GITHUB_WORKSPACE"') > 0 && job.indexOf('safe.directory') < job.indexOf('node tooling/sdk/sdk-upgrade-gate.mjs'));
  assert.match(workflow, /UPGRADE: \$\{\{ needs.sdk-upgrade-gate.result \}\}/);
  assert.doesNotMatch(job, /--self-test/);
  const selftest = workflow.slice(workflow.indexOf('\n  sdk-upgrade-gate-selftest:'), workflow.indexOf('\n  platform-workspace:'));
  assert.match(selftest, /name: SDK upgrade gate self-test/);
  assert.match(selftest, /node tooling\/sdk\/sdk-upgrade-gate.mjs --self-test/);
  assert.match(workflow, /SELFTEST: \$\{\{ needs.sdk-upgrade-gate-selftest.result \}\}/);
});

test('assembly manifest scripts stay protected while nine release URLs change', () => fixture(root => {
  const kit = project(root);
  const expected = assemblyHash(kit);
  const urls = JSON.parse(readFileSync(join(kit, 'package.json')));
  for (const name of names) urls.dependencies[`@ap/${name}`] = `http://127.0.0.1:1234/c/ap-${name}-0.0.0-c.tgz`;
  writeFileSync(join(kit, 'package.json'), JSON.stringify(urls));
  assertAssembly(kit, expected);
  const manifest = JSON.parse(readFileSync(join(kit, 'package.json')));
  manifest.scripts = { build: 'changed assembly command' };
  writeFileSync(join(kit, 'package.json'), JSON.stringify(manifest));
  assert.throws(() => assertAssembly(kit, expected), /assembly code changed/);
}));
test('required upgrade verdict rejects every failed, cancelled, missing or skipped gate for code changes outside a pull request', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const verdict = workflow.split('      - name: SDK upgrade verdict\n')[1].split('      - name: Shard verdict')[0];
  const script = verdict.split('        run: |\n')[1].trim();
  // #1931: a pull request skips both gates on purpose until production; push and manual runs (release full=true) still require them.
  for (const GITHUB_EVENT_NAME of ['push', 'workflow_dispatch', 'pull_request']) {
    for (const CODE of ['true', '', 'false']) {
      for (const UPGRADE of ['success', 'failure', 'cancelled', 'skipped', '']) {
        for (const SELFTEST of ['success', 'failure', 'cancelled', 'skipped', '']) {
          const result = spawnSync('sh', ['-e', '-c', script], { cwd: new URL('../..', import.meta.url), env: { ...process.env, GITHUB_EVENT_NAME, CODE, UPGRADE, SELFTEST } });
          const pass = CODE === 'false' || GITHUB_EVENT_NAME === 'pull_request' || (UPGRADE === 'success' && SELFTEST === 'success');
          assert.equal(result.status === 0, pass, JSON.stringify({ GITHUB_EVENT_NAME, CODE, UPGRADE, SELFTEST }));
        }
      }
    }
  }
});

/** A previous release directory that also holds a fake `ap-start-kit-<V>.tgz` (top folder stripped on extraction). */
function withStartKit(root, version, { sums = true, corrupt = false } = {}) {
  const entry = bundle(root, version);
  const kit = join(root, `kit-src-${version}`, `ap-start-kit-${version}`);
  mkdirSync(kit, { recursive: true });
  writeFileSync(join(kit, 'package.json'), JSON.stringify({ scripts: { check: 'x', build: 'y' }, dependencies: { react: '19', ...Object.fromEntries(names.map(name => [`@ap/${name}`, `file:vendor/${name}.tgz`])) } }));
  writeFileSync(join(kit, 'menus.ts'), 'export const menus = [];\n');
  writeFileSync(join(kit, 'FROM-PREVIOUS-KIT.txt'), 'marker');
  const file = `ap-start-kit-${version}.tgz`;
  const tar = spawnSync('tar', ['-czf', join(entry.directory, file), '-C', join(root, `kit-src-${version}`), `ap-start-kit-${version}`]);
  assert.equal(tar.status, 0);
  const bytes = readFileSync(join(entry.directory, file));
  if (sums) writeFileSync(join(entry.directory, 'SHA256SUMS'), `${readFileSync(join(entry.directory, 'SHA256SUMS'), 'utf8')}${hash(bytes)}  ${file}\n`);
  if (corrupt) writeFileSync(join(entry.directory, file), 'tampered');
  return { ...entry, sha256: hash(readFileSync(join(entry.directory, 'SHA256SUMS'))) };
}

/**
 * A start-kit asset that passes the shipped bundle check: nine vendor tarballs, a lockfile resolving them, the real
 * sdk-bundle-check.mjs and SHA256SUMS over every file. Kit files carry the version so the test can tell kits apart.
 */
function realKit(root, version, { withoutLockfile = false, extra = {}, vendorVersion = version } = {}) {
  const release = join(root, `release-${version}`);
  const stage = join(root, `kit-stage-${version}`);
  const kit = join(stage, `ap-start-kit-${version}`);
  mkdirSync(join(kit, 'vendor'), { recursive: true });
  mkdirSync(release);
  const tarball = name => `ap-${name}-${vendorVersion}.tgz`;
  for (const name of names) {
    const pkg = join(root, `pkg-${version}-${name}`, 'package');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: `@ap/${name}`, version: vendorVersion }));
    assert.equal(spawnSync('tar', ['-czf', join(kit, 'vendor', tarball(name)), '-C', dirname(pkg), 'package']).status, 0);
  }
  const files = {
    'package.json': JSON.stringify({ name: 'ap-start-kit', version, scripts: { check: 'x', build: 'y' }, dependencies: Object.fromEntries(names.map(name => [`@ap/${name}`, `file:./vendor/${tarball(name)}`])) }),
    'pnpm-lock.yaml': ["lockfileVersion: '9.0'", '', 'packages:', '', ...names.flatMap(name => [`  '@ap/${name}@file:vendor/${tarball(name)}':`, `    resolution: {integrity: sha512-${hash(name)}, tarball: file:vendor/${tarball(name)}}`, '']), 'snapshots:', '', ...names.map(name => `  '@ap/${name}@file:vendor/${tarball(name)}': {}`), ''].join('\n'),
    'third-party.json': '[]\n',
    'menus.ts': `export const menus = ['sample ${version}'];\n`,
    'menus/sample/menu.ts': `sample ${version}\n`,
    'mock/assembly.ts': `mock ${version}\n`,
    'src/start.tsx': `start ${version}\n`,
    'sdk-bundle-check.mjs': readFileSync(new URL('./sdk-bundle-check.mjs', import.meta.url), 'utf8'),
    ...extra,
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(kit, path)), { recursive: true });
    writeFileSync(join(kit, path), content);
  }
  const listed = [...Object.keys(files), ...names.map(name => `vendor/${tarball(name)}`)];
  writeFileSync(join(kit, 'SHA256SUMS'), `${listed.map(path => `${hash(readFileSync(join(kit, path)))}  ${path}`).join('\n')}\n`);
  if (withoutLockfile) rmSync(join(kit, 'pnpm-lock.yaml'));
  assert.equal(spawnSync('tar', ['-czf', join(release, `ap-start-kit-${version}.tgz`), '-C', stage, `ap-start-kit-${version}`]).status, 0);
  return { directory: release, version, kit: kitAsset(release, version) };
}
/** Runs the kit's own node scripts for real (verify, adopt); records pnpm and the post-install check, which need an install. */
function recorder() {
  const commands = [];
  const run = async (command, args, cwd) => {
    commands.push({ command, args, cwd });
    if (command !== 'node' || args.includes('installed')) return;
    const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}: ${result.stderr}`);
  };
  return { commands, run };
}
const read = (root, path) => readFileSync(join(root, path), 'utf8');

test('kit change procedure: older kit → newer kit → back, each from its own lockfile with --frozen-lockfile', () => fixture(async root => {
  const previous = realKit(root, '0.0.0-a');
  const formal = realKit(root, '0.0.0-b');
  const { commands, run } = recorder();
  const roots = {};
  const hashes = [];
  await kitSequence({ work: root, previous: previous.directory, formal: formal.directory, previousKit: previous.kit, formalKit: formal.kit, previousVersion: previous.version, formalVersion: formal.version, run, log: () => {}, afterInstall: async (phase, project) => {
    roots[phase] = project;
    hashes.push(assemblyHash(project));
  } });
  assert.equal(new Set(Object.values(roots)).size, 3, 'each kit change unpacks into a new folder');
  assert.equal(new Set(hashes).size, 1, 'the assembly is byte-identical in every phase');
  const installs = commands.filter(({ command, args }) => command === 'pnpm' && args[0] === 'install');
  assert.deepEqual(installs.map(({ args, cwd }) => [args.join(' '), cwd]), Object.values(roots).map(cwd => ['install --frozen-lockfile', cwd]));
  const adopts = commands.filter(({ args }) => args.includes('adopt'));
  assert.deepEqual(adopts.map(({ args }) => args), [
    [join(roots.formal, 'sdk-bundle-check.mjs'), 'adopt', '--from', roots.rc, '--bundle', roots.formal],
    [join(roots.formal, 'sdk-bundle-check.mjs'), 'adopt', '--from', roots.formal, '--bundle', roots.rollback],
  ], 'adopt runs from the newer kit: the target on upgrade, the current project on rollback');
  assert.match(read(roots.formal, 'pnpm-lock.yaml'), /ap-kernel-0\.0\.0-b\.tgz/);
  assert.ok(existsSync(join(roots.formal, 'vendor/ap-kernel-0.0.0-b.tgz')) && !existsSync(join(roots.formal, 'vendor/ap-kernel-0.0.0-a.tgz')));
  assert.equal(read(roots.formal, 'src/start.tsx'), 'start 0.0.0-b\n', 'kit files come from the new kit');
  assert.equal(read(roots.formal, 'menus/sample/menu.ts'), 'sample 0.0.0-a\n', 'menus come from the project');
  assert.ok(existsSync(join(roots.formal, 'round-trip/main.tsx')), 'an added folder travels with the project');
  assert.match(read(roots.rollback, 'pnpm-lock.yaml'), /ap-kernel-0\.0\.0-a\.tgz/);
  assert.equal(read(roots.rollback, 'src/start.tsx'), 'start 0.0.0-a\n');
}));
test('a new kit without its lockfile stops the upgrade before any install in that kit', () => fixture(async root => {
  const previous = realKit(root, '0.0.0-a');
  const formal = realKit(root, '0.0.0-b', { withoutLockfile: true });
  const { commands, run } = recorder();
  await assert.rejects(kitSequence({ work: root, previous: previous.directory, formal: formal.directory, previousKit: previous.kit, formalKit: formal.kit, previousVersion: previous.version, formalVersion: formal.version, run, log: () => {} }), /pnpm-lock\.yaml: listed in SHA256SUMS but missing/);
  assert.equal(commands.filter(({ command, args }) => command === 'pnpm' && args[0] === 'install').length, 1, 'only the rc install ran');
  assert.ok(!commands.some(({ args }) => args.includes('adopt')));
}));
test('an assembly edit after the rc run fails before the kit change', () => fixture(async root => {
  const previous = realKit(root, '0.0.0-a');
  const formal = realKit(root, '0.0.0-b');
  const { commands, run } = recorder();
  await assert.rejects(kitSequence({ work: root, previous: previous.directory, formal: formal.directory, previousKit: previous.kit, formalKit: formal.kit, previousVersion: previous.version, formalVersion: formal.version, run, log: () => {}, afterInstall: async (phase, project) => {
    if (phase === 'rc') writeFileSync(join(project, 'menus.ts'), 'changed assembly line\n');
  } }), /assembly code changed/);
  assert.ok(!commands.some(({ args }) => args.includes('adopt')));
}));
test('start kit checksum mismatch or missing entry fails before install', () => fixture(async root => {
  const bad = withStartKit(root, '0.0.0-a', { corrupt: true });
  assert.throws(() => verifyStartKit(bad.directory, bad.version), /Start kit checksum mismatch: ap-start-kit-0.0.0-a.tgz/);
  const missing = withStartKit(root, '0.0.0-b', { sums: false });
  assert.throws(() => verifyStartKit(missing.directory, missing.version), /Start kit missing from SHA256SUMS: ap-start-kit-0.0.0-b.tgz/);
  const { cpSync } = await import('node:fs');
  await assert.rejects(downloadPrevious(missing, join(root, 'dl'), async (_pin, destination) => cpSync(missing.directory, destination, { recursive: true })), /Start kit missing from SHA256SUMS/);
}));
test('a release directory without a start kit has no kit asset (the gate builds one with sdk-kit.mjs)', () => fixture(root => {
  const previous = bundle(root, '0.0.0-c');
  assert.equal(verifyStartKit(previous.directory, previous.version), null);
  assert.equal(kitAsset(previous.directory, previous.version), null);
  const kit = withStartKit(root, '0.0.0-d');
  assert.equal(kitAsset(kit.directory, '0.0.0-d'), join(kit.directory, 'ap-start-kit-0.0.0-d.tgz'));
}));
test('unpacking a kit refuses a folder that is not empty', () => fixture(root => {
  const kit = withStartKit(root, '0.0.0-e');
  const target = join(root, 'p');
  unpackKit(target, kitAsset(kit.directory, '0.0.0-e'));
  assert.ok(existsSync(join(target, 'FROM-PREVIOUS-KIT.txt')), 'top folder stripped');
  assert.throws(() => unpackKit(target, kitAsset(kit.directory, '0.0.0-e')), /is not empty/);
}));

test('a kit is bound to its release: another version in the directory, or a kit installing another version, is refused', () => fixture(async root => {
  const previous = realKit(root, '0.0.0-a');
  const formal = realKit(root, '0.0.0-b');
  // The formal release directory also holds the previous release's kit: picking "the first start kit" would install A twice.
  cpSync(previous.kit, join(formal.directory, 'ap-start-kit-0.0.0-a.tgz'));
  assert.throws(() => kitAsset(formal.directory, '0.0.0-b'), /holds a start kit of another version: ap-start-kit-0\.0\.0-a\.tgz/);
  // A kit named for B whose vendor/ installs A: its own verify passes, the release binding does not.
  const renamed = realKit(root, '0.0.0-c', { vendorVersion: '0.0.0-a' });
  const unpacked = join(root, 'renamed');
  unpackKit(unpacked, renamed.kit);
  assert.throws(() => assertKitVersion(unpacked, '0.0.0-c'), /is not release 0\.0\.0-c: vendor\/ holds ap-app-host-0\.0\.0-a\.tgz/);
  assert.doesNotThrow(() => assertKitVersion(unpacked, '0.0.0-a'));
  const { commands, run } = recorder();
  await assert.rejects(kitSequence({ work: root, previous: previous.directory, formal: renamed.directory, previousKit: previous.kit, formalKit: renamed.kit, previousVersion: '0.0.0-a', formalVersion: '0.0.0-c', run, log: () => {} }), /is not release 0\.0\.0-c/);
  assert.ok(!commands.some(({ args }) => args.includes('adopt')), 'refused before the kit change');
  await assert.rejects(kitSequence({ work: root, previous: previous.directory, formal: formal.directory, previousKit: previous.kit, formalKit: previous.kit, previousVersion: '0.0.0-a', formalVersion: '0.0.0-b', run, log: () => {} }), /is not release 0\.0\.0-b/);
}));
test('a newer kit file in a carried menu folder is the kit\'s, not an assembly change; it is kept on upgrade and travels back', () => fixture(async root => {
  // 0.35.0-rc.1 → rc.2: the newer kit adds menus/sample/conformance.ts to the sample menu the project carries.
  const previous = realKit(root, '0.0.0-a');
  const formal = realKit(root, '0.0.0-b', { extra: { 'menus/sample/conformance.ts': 'cases b\n' } });
  const { run } = recorder();
  const roots = {};
  await kitSequence({ work: root, previous: previous.directory, formal: formal.directory, previousKit: previous.kit, formalKit: formal.kit, previousVersion: previous.version, formalVersion: formal.version, run, log: () => {}, afterInstall: async (phase, project) => {
    roots[phase] = project;
  } });
  assert.equal(read(roots.formal, 'menus/sample/conformance.ts'), 'cases b\n', 'the newer kit keeps its file in the carried sample folder');
  assert.equal(read(roots.formal, 'menus/sample/menu.ts'), 'sample 0.0.0-a\n', 'the carried menu file is the project\'s');
  assert.equal(read(roots.rollback, 'menus/sample/conformance.ts'), 'cases b\n', 'the rolled-back project keeps the folder as it was');
  // An integrator file that appears between runs is still a change, even under menus/.
  await assert.rejects(kitSequence({ work: root, previous: previous.directory, formal: formal.directory, previousKit: previous.kit, formalKit: formal.kit, previousVersion: previous.version, formalVersion: formal.version, run, log: () => {}, afterInstall: async (phase, project) => {
    if (phase === 'formal') writeFileSync(join(project, 'menus/sample/extra.ts'), 'mine\n');
  } }), /assembly code changed between upgrade runs: menus\/sample\/extra\.ts is new and is not a kit file/);
}));
