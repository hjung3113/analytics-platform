import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { BUNDLE_PACKAGES, checkInstalled, checkMirror, parseLockfile, readTarEntry, thirdPartyList, verifyBundle } from './sdk-bundle-check.mjs';
import { releasePackages } from './sdk-exports.mjs';

const VERSION = '1.2.3';
const INTEGRITY = (seed) => `sha512-${createHash('sha512').update(seed).digest('base64')}`;

function tgz(dir, file, manifest) {
  const stage = mkdtempSync(join(tmpdir(), 'ap-bundle-check-pkg-'));
  mkdirSync(join(stage, 'package'));
  writeFileSync(join(stage, 'package', 'package.json'), JSON.stringify(manifest));
  const result = spawnSync('tar', ['-czf', join(dir, file), '-C', stage, 'package'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function manifestFor(name, version = VERSION) {
  const manifest = { name: `@ap/${name}`, version, type: 'module' };
  if (name !== 'contracts') manifest.peerDependencies = { '@ap/contracts': version, react: '^19.0.0' };
  if (name === 'contracts') manifest.dependencies = { zod: '^4.0.0' };
  return manifest;
}

function lockText({ extraPackages = [], extraSnapshots = [] } = {}) {
  const ap = BUNDLE_PACKAGES.map((name) => `ap-${name}-${VERSION}.tgz`);
  return [
    "lockfileVersion: '9.0'",
    '',
    'settings:',
    '  autoInstallPeers: true',
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    "      '@ap/contracts':",
    `        specifier: file:./vendor/ap-contracts-${VERSION}.tgz`,
    `        version: file:vendor/ap-contracts-${VERSION}.tgz`,
    '',
    'packages:',
    '',
    ...BUNDLE_PACKAGES.flatMap((name, index) => [
      `  '@ap/${name}@file:vendor/${ap[index]}':`,
      `    resolution: {integrity: ${INTEGRITY(name)}, tarball: file:vendor/${ap[index]}}`,
      `    version: ${VERSION}`,
      '',
    ]),
    '  react@19.3.0:',
    `    resolution: {integrity: ${INTEGRITY('react')}}`,
    "    engines: {node: '>=0.10.0'}",
    '',
    '  zod@4.1.0:',
    `    resolution: {integrity: ${INTEGRITY('zod')}}`,
    '',
    ...extraPackages,
    'snapshots:',
    '',
    ...BUNDLE_PACKAGES.map((name, index) => `  '@ap/${name}@file:vendor/${ap[index]}${name === 'contracts' ? '' : `(@ap/contracts@file:vendor/ap-contracts-${VERSION}.tgz)`}': {}`),
    '',
    '  react@19.3.0: {}',
    '',
    '  zod@4.1.0: {}',
    ...extraSnapshots,
    '',
  ].join('\n');
}

function writeSums(bundle) {
  const files = ['package.json', 'pnpm-lock.yaml', 'third-party.json', ...readdirSync(join(bundle, 'vendor')).map((file) => `vendor/${file}`)];
  const lines = files.map((file) => `${createHash('sha256').update(readFileSync(join(bundle, file))).digest('hex')}  ${file}`);
  writeFileSync(join(bundle, 'SHA256SUMS'), `${lines.join('\n')}\n`);
}

function makeBundle({ manifests = {}, lock = lockText(), thirdParty, project } = {}) {
  const bundle = mkdtempSync(join(tmpdir(), 'ap-bundle-check-'));
  mkdirSync(join(bundle, 'vendor'));
  for (const name of BUNDLE_PACKAGES) {
    const manifest = name in manifests ? manifests[name] : manifestFor(name);
    if (manifest === null) continue;
    tgz(join(bundle, 'vendor'), `ap-${name}-${manifest.version}.tgz`, manifest);
  }
  const dependencies = Object.fromEntries(BUNDLE_PACKAGES.map((name) => [`@ap/${name}`, `file:./vendor/ap-${name}-${VERSION}.tgz`]));
  writeFileSync(join(bundle, 'package.json'), JSON.stringify(project ?? { name: 'kit', private: true, dependencies: { ...dependencies, react: '19.3.0' } }));
  writeFileSync(join(bundle, 'pnpm-lock.yaml'), lock);
  writeFileSync(join(bundle, 'third-party.json'), JSON.stringify(thirdParty ?? thirdPartyList(parseLockfile(lock))));
  writeSums(bundle);
  return bundle;
}

test('the shipped package list is the nine release packages of sdk-exports', () => {
  assert.deepEqual([...BUNDLE_PACKAGES].sort(), releasePackages().map(({ name }) => name).sort());
});

test('a well-formed bundle passes verify', () => {
  assert.deepEqual(verifyBundle(makeBundle()), []);
});

test('readTarEntry reads package.json out of a pnpm pack tarball', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-bundle-check-pack-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@ap/kernel', version: VERSION }));
  const out = mkdtempSync(join(tmpdir(), 'ap-bundle-check-packout-'));
  const result = spawnSync('pnpm', ['pack', '--pack-destination', out], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const [file] = readdirSync(out);
  assert.equal(JSON.parse(readTarEntry(readFileSync(join(out, file)), 'package/package.json').toString('utf8')).name, '@ap/kernel');
});

test('check 1: a changed tarball byte, a missing listed file and an unlisted tarball fail', () => {
  const tampered = makeBundle();
  appendFileSync(join(tampered, 'vendor', `ap-kernel-${VERSION}.tgz`), Buffer.from([0]));
  assert.match(verifyBundle(tampered).join('\n'), /vendor\/ap-kernel-1\.2\.3\.tgz: checksum does not match/);

  const extra = makeBundle();
  tgz(join(extra, 'vendor'), 'ap-extra-1.2.3.tgz', { name: '@ap/extra', version: VERSION });
  assert.match(verifyBundle(extra).join('\n'), /vendor\/ap-extra-1\.2\.3\.tgz: not listed in SHA256SUMS/);

  const escape = makeBundle();
  appendFileSync(join(escape, 'SHA256SUMS'), `${'0'.repeat(64)}  ../outside\n`);
  assert.match(verifyBundle(escape).join('\n'), /leaves the bundle/);
});

test('check 3: a missing tarball, a version mismatch and a loose sibling peer fail', () => {
  assert.match(verifyBundle(makeBundle({ manifests: { 'app-host': null } })).join('\n'), /missing tarball for @ap\/app-host/);
  assert.match(verifyBundle(makeBundle({ manifests: { ui: manifestFor('ui', '1.2.4') } })).join('\n'), /different versions: 1\.2\.3, 1\.2\.4/);
  const loose = { ...manifestFor('shell'), peerDependencies: { '@ap/contracts': '^1.2.3' } };
  assert.match(verifyBundle(makeBundle({ manifests: { shell: loose } })).join('\n'), /peerDependencies\.@ap\/contracts is \^1\.2\.3, expected exactly 1\.2\.3/);
  const asDependency = { ...manifestFor('kernel'), dependencies: { '@ap/contracts': VERSION } };
  assert.match(verifyBundle(makeBundle({ manifests: { kernel: asDependency } })).join('\n'), /dependencies\.@ap\/contracts — siblings must be exact-version peers/);
});

test('check 4: an install script or a git/URL dependency in a tarball fails', () => {
  const scripted = { ...manifestFor('ui'), scripts: { postinstall: 'node x.js' } };
  assert.match(verifyBundle(makeBundle({ manifests: { ui: scripted } })).join('\n'), /has install script "postinstall"/);
  const git = { ...manifestFor('components'), dependencies: { echarts: 'github:apache/echarts' } };
  assert.match(verifyBundle(makeBundle({ manifests: { components: git } })).join('\n'), /dependencies\.echarts is "github:apache\/echarts"/);
  const url = { ...manifestFor('components'), dependencies: { echarts: 'https://example.invalid/echarts.tgz' } };
  assert.match(verifyBundle(makeBundle({ manifests: { components: url } })).join('\n'), /git, URL and path dependencies are not allowed/);
});

test('check 4: a git, URL or integrity-less resolution in the lockfile fails', () => {
  const lock = lockText({
    extraPackages: [
      '  left-pad@1.3.0:',
      '    resolution: {tarball: https://example.invalid/left-pad-1.3.0.tgz}',
      '',
      '  right-pad@1.0.0:',
      '    resolution: {commit: abc123, repo: https://example.invalid/right-pad.git, type: git}',
      '',
      '  mid-pad@1.0.0:',
      '    version: 1.0.0',
      '',
    ],
  });
  const failures = verifyBundle(makeBundle({ lock })).join('\n');
  assert.match(failures, /left-pad@1\.3\.0: tarball\/URL dependency/);
  assert.match(failures, /right-pad@1\.0\.0: git dependency/);
  assert.match(failures, /mid-pad@1\.0\.0: no integrity/);
});

test('check 2: an @ap package resolved under two peer sets is two copies', () => {
  const lock = lockText({ extraSnapshots: ['', `  '@ap/kernel@file:vendor/ap-kernel-${VERSION}.tgz(react@19.3.0)': {}`] });
  assert.match(verifyBundle(makeBundle({ lock })).join('\n'), /installs @ap\/kernel 2 times/);
});

test('an @ap dependency outside vendor/ and a third-party list that drifted from the lockfile fail', () => {
  const project = { name: 'kit', dependencies: { '@ap/kernel': 'https://example.invalid/ap-kernel.tgz' } };
  assert.match(verifyBundle(makeBundle({ project })).join('\n'), /package\.json dependencies\.@ap\/kernel is "https:\/\/example\.invalid\/ap-kernel\.tgz"/);
  const failures = verifyBundle(makeBundle({ thirdParty: [{ name: 'react', version: '19.3.0' }, { name: 'lodash', version: '4.17.21' }] })).join('\n');
  assert.match(failures, /third-party\.json is missing zod@4\.1\.0/);
  assert.match(failures, /third-party\.json lists lodash@4\.17\.21/);
});

test('third-party list excludes @ap packages and keeps exact versions and integrity', () => {
  assert.deepEqual(thirdPartyList(parseLockfile(lockText())), [
    { name: 'react', version: '19.3.0', integrity: INTEGRITY('react') },
    { name: 'zod', version: '4.1.0', integrity: INTEGRITY('zod') },
  ]);
});

test('installed: one directory per @ap package, two copies fail', () => {
  const bundle = makeBundle();
  for (const name of BUNDLE_PACKAGES) mkdirSync(join(bundle, 'node_modules', '.pnpm', `@ap+${name}@file+vendor+ap-${name}-${VERSION}.tgz`), { recursive: true });
  assert.deepEqual(checkInstalled(bundle), []);
  mkdirSync(join(bundle, 'node_modules', '.pnpm', `@ap+kernel@file+vendor+ap-kernel-${VERSION}.tgz_react@19.3.0`));
  assert.match(checkInstalled(bundle).join('\n'), /@ap\/kernel is installed 2 times/);
});

test('mirror: reports a missing name, a missing version and a different integrity; sends only package names', async () => {
  const requested = [];
  const served = {
    react: { versions: { '19.3.0': { dist: { integrity: INTEGRITY('react') } } } },
    zod: { versions: { '4.0.0': { dist: { integrity: INTEGRITY('zod') } } } },
    '@scope/lib': { versions: { '1.0.0': { dist: { integrity: INTEGRITY('other') } } } },
  };
  const fakeFetch = async (url) => {
    requested.push(url);
    const name = decodeURIComponent(url.slice('https://mirror.invalid/npm/'.length));
    if (!served[name]) return { status: 404, ok: false };
    return { status: 200, ok: true, json: async () => served[name] };
  };
  const list = [
    { name: 'react', version: '19.3.0', integrity: INTEGRITY('react') },
    { name: 'zod', version: '4.1.0', integrity: INTEGRITY('zod') },
    { name: '@scope/lib', version: '1.0.0', integrity: INTEGRITY('lib') },
    { name: 'gone', version: '2.0.0', integrity: INTEGRITY('gone') },
  ];
  const result = await checkMirror('https://mirror.invalid/npm/', list, fakeFetch, undefined);
  assert.deepEqual(result, { checked: 4, missing: ['gone@2.0.0', 'zod@4.1.0'], integrity: ['@scope/lib@1.0.0'], errors: [] });
  assert.ok(requested.includes('https://mirror.invalid/npm/@scope%2Flib'));
  assert.ok(requested.every((url) => !url.includes('?') && !url.includes('19.3.0')));
});

test('mirror: a network error is reported, not counted as present', async () => {
  const result = await checkMirror('https://mirror.invalid', [{ name: 'react', version: '19.3.0', integrity: null }], async () => {
    throw new Error('ECONNREFUSED');
  }, undefined);
  assert.deepEqual(result.errors, ['react: ECONNREFUSED']);
  assert.deepEqual(result.missing, []);
});
