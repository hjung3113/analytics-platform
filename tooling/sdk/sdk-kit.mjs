// Builds the start-kit release asset (#1790): the out-of-repo assembly fixture (tooling/sdk/fixtures/out-of-repo-assembly/kit)
// as a project that installs from its own `vendor/` folder. The kit is also the import bundle's folder (#1701): its lockfile
// is the bundle's lockfile.
// Usage: node tooling/sdk/sdk-kit.mjs --tarballs <dir from sdk:pack> [--out <dir>]   (--out defaults to --tarballs)
//
// Writes `ap-start-kit-<version>.tgz` (one top folder `ap-start-kit-<version>/`) into --out and appends its line to
// --out/SHA256SUMS (the release's single checksum file). Inside the kit:
//   vendor/ap-*.tgz         the nine release tarballs, as `file:./vendor/…` dependencies
//   pnpm-lock.yaml          resolved here (needs the registry); `pnpm install --frozen-lockfile` reproduces it anywhere
//   third-party.json        every non-@ap package at its exact version (mirror check input)
//   sdk-bundle-check.mjs    the install check (verify / mirror / installed)
//   SHA256SUMS              every kit file except itself
// Nothing from apps/, menus/, platform/ or packages/ is copied; the asset is checked by sdk-kit-check.mjs.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLE_PACKAGES, parseLockfile, readTarEntry, thirdPartyList, verifyBundle } from './sdk-bundle-check.mjs';
import { releaseTarball, writeKitProject } from './sdk-consumer-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
export const KIT_PREFIX = 'ap-start-kit-';
/** Repo folders whose tracked files the kit must not carry a copy of (acceptance 1: platform source copied 0). */
const PLATFORM_SOURCE_DIRS = ['apps', 'menus', 'platform', 'packages'];
/** Files this short (empty barrels, one-line configs) match by coincidence; they say nothing about copying. */
const MIN_COMPARED_BYTES = 200;

function fail(message) {
  throw new Error(message);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited ${result.status}:\n${`${result.stdout}\n${result.stderr}`.trim().slice(-3000)}`);
  return result.stdout;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag !== '--tarballs' && flag !== '--out') fail(`unknown argument ${flag} (usage: sdk-kit --tarballs <dir> [--out <dir>])`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`${flag} needs a value`);
    options[flag.slice(2)] = resolve(value);
    i += 1;
  }
  if (!options.tarballs) fail('--tarballs <dir> is required');
  return { tarballs: options.tarballs, out: options.out ?? options.tarballs };
}

/** Every file under `root`, as `/`-separated relative paths, sorted. */
export function listFiles(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(root, path) : [path];
    })
    .sort();
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The single version the nine tarballs share (the bundle check fails on any other shape later; this names it early). */
function releaseVersion(tarballDir) {
  const versions = new Set(
    BUNDLE_PACKAGES.map((name) => JSON.parse(readTarEntry(readFileSync(releaseTarball(tarballDir, name)), 'package/package.json').toString('utf8')).version),
  );
  if (versions.size !== 1) fail(`the nine tarballs carry different versions: ${[...versions].join(', ')}`);
  return [...versions][0];
}

/** sha256 → repo path of every tracked platform source file of at least MIN_COMPARED_BYTES. */
export function platformSourceHashes() {
  // Only this repository is read (a file list). safe.directory on the command line lets a checkout owned by another uid (a CI
  // container) answer without trusting it machine-wide; a command-line value counts as protected configuration since git 2.36.
  const tracked = run('git', ['-c', `safe.directory=${repoRoot}`, 'ls-files', '-z', '--', ...PLATFORM_SOURCE_DIRS], repoRoot).split('\0').filter(Boolean);
  const hashes = new Map();
  for (const path of tracked) {
    const file = join(repoRoot, path);
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    if (bytes.length >= MIN_COMPARED_BYTES) hashes.set(createHash('sha256').update(bytes).digest('hex'), path);
  }
  if (hashes.size === 0) fail('no tracked platform source found to compare against');
  return hashes;
}

/** Fails when a kit file is a byte copy of a tracked file under apps/, menus/, platform/ or packages/. */
export function assertNoPlatformSource(kit, hashes = platformSourceHashes()) {
  const copied = listFiles(kit)
    .filter((path) => !path.startsWith('node_modules/'))
    .flatMap((path) => {
      const source = hashes.get(sha256File(join(kit, path)));
      return source ? [`${path} = ${source}`] : [];
    });
  if (copied.length > 0) fail(`kit carries copies of platform source: ${copied.join(', ')}`);
}

function buildKit(tarballs, out) {
  const version = releaseVersion(tarballs);
  const name = `${KIT_PREFIX}${version}`;
  const asset = join(out, `${name}.tgz`);
  if (existsSync(asset)) fail(`${asset} already exists (nothing is overwritten)`);
  const staging = mkdtempSync(join(tmpdir(), 'ap-sdk-kit-'));
  try {
    const relativeStaging = relative(repoRoot, staging);
    if (relativeStaging === '' || !relativeStaging.startsWith(`..${sep}`)) fail('staging directory must be outside the repository');
    const kit = join(staging, name);
    mkdirSync(join(kit, 'vendor'), { recursive: true });
    for (const pkg of BUNDLE_PACKAGES) cpSync(releaseTarball(tarballs, pkg), join(kit, 'vendor', basename(releaseTarball(tarballs, pkg))));
    writeKitProject(kit, (pkg) => `file:./vendor/${basename(releaseTarball(tarballs, pkg))}`);
    const manifest = JSON.parse(readFileSync(join(kit, 'package.json'), 'utf8'));
    manifest.name = 'ap-start-kit';
    manifest.version = version;
    writeFileSync(join(kit, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`sdk:kit resolve pnpm-lock.yaml (${name})\n`);
    run('pnpm', ['install', '--lockfile-only'], kit);
    writeFileSync(join(kit, 'third-party.json'), `${JSON.stringify(thirdPartyList(parseLockfile(readFileSync(join(kit, 'pnpm-lock.yaml'), 'utf8'))), null, 2)}\n`);
    cpSync(join(here, 'sdk-bundle-check.mjs'), join(kit, 'sdk-bundle-check.mjs'));

    assertNoPlatformSource(kit);
    const files = listFiles(kit);
    writeFileSync(join(kit, 'SHA256SUMS'), `${files.map((path) => `${sha256File(join(kit, path))}  ${path}`).join('\n')}\n`);
    const failures = verifyBundle(kit);
    if (failures.length > 0) fail(`the built kit fails its own bundle check:\n${failures.join('\n')}`);

    mkdirSync(out, { recursive: true });
    const packed = join(staging, `${name}.tgz`);
    run('tar', ['-czf', packed, '-C', staging, name], staging);
    if (existsSync(asset)) fail(`${asset} appeared during the build (nothing is overwritten)`);
    cpSync(packed, asset);
    appendFileSync(join(out, 'SHA256SUMS'), `${sha256File(asset)}  ${basename(asset)}\n`);
    process.stdout.write(`sdk:kit passed: ${basename(asset)} (${files.length} files) + SHA256SUMS line in ${out}\n`);
    return asset;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { tarballs, out } = parseArgs(process.argv.slice(2));
    buildKit(tarballs, out);
  } catch (error) {
    process.stderr.write(`sdk:kit FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
