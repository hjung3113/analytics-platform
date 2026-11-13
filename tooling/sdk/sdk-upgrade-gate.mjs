// Host-only integration: node tooling/sdk/sdk-upgrade-gate.mjs <current bundle directory>
// --self-test packs this tree at gate-a/gate-b, builds a start kit for each and exercises upgrade, rollback and mutation.
// The assembly (menus/, menus.ts, mock/assembly.ts and the round-trip fixture) starts in the PREVIOUS release's start kit
// (`ap-start-kit-<V>.tgz`) and moves between kits by the documented kit change procedure (`kitSequence`): unpack the target kit
// into a new folder, `adopt`, install from that kit's own lockfile with --frozen-lockfile. A menu built on N-1 must run unchanged on
// N and back, so the assembly bytes never change between phases. A release directory without a kit gets one from sdk-kit.mjs.
// Tests inject the download and command execution; they never install, fetch or launch browsers.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releasePackages } from './sdk-exports.mjs';
import { releaseTarball } from './sdk-consumer-check.mjs';
import { assemblyFiles, parseSums, readTarEntry } from './sdk-bundle-check.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const names = releasePackages().map(({ name }) => name);
const digest = content => createHash('sha256').update(content).digest('hex');
export const FINAL_REPORT = 'rc-based replacement passed; first real N-1 to N is v0.37.0';

/** Authenticate the checksum list before trusting any of its nine release entries. Start-kit assets are separate. */
export function verifyBundle(directory, { version, sha256 } = {}) {
  const sums = readFileSync(join(directory, 'SHA256SUMS'));
  if (sha256 && digest(sums) !== sha256) throw new Error('SHA256SUMS checksum does not match the previous-bundle pin');
  const entries = parseSums(sums.toString('utf8'));
  for (const path of entries.keys()) if (path.includes('/') || path.includes('\\')) throw new Error(`Invalid or duplicate SHA256SUMS entry: ${path}`);
  const files = names.map(name => {
    const file = version ? `ap-${name}-${version}.tgz` : basename(releaseTarball(directory, name));
    if (!existsSync(join(directory, file))) throw new Error(`Missing previous bundle file: ${file}`);
    if (entries.get(file) !== digest(readFileSync(join(directory, file)))) throw new Error(`Bundle checksum mismatch: ${file}`);
    return file;
  });
  return files;
}

/** The start-kit asset is optional only when absent from both the directory and SHA256SUMS; otherwise it must match the list. */
export function verifyStartKit(directory, version) {
  const file = `ap-start-kit-${version}.tgz`;
  const present = existsSync(join(directory, file));
  const expected = parseSums(readFileSync(join(directory, 'SHA256SUMS'), 'utf8')).get(file);
  if (!present && !expected) return null;
  if (!expected) throw new Error(`Start kit missing from SHA256SUMS: ${file}`);
  if (!present) throw new Error(`Missing previous start kit file: ${file}`);
  if (expected !== digest(readFileSync(join(directory, file)))) throw new Error(`Start kit checksum mismatch: ${file}`);
  return file;
}

/** The release directory's start-kit asset, or null. */
export function kitAsset(directory) {
  const file = readdirSync(directory).find(entry => /^ap-start-kit-.+\.tgz$/.test(entry));
  return file ? join(directory, file) : null;
}
/** Procedure step 1: unpack a start-kit asset into a new empty folder (top folder stripped). */
export function unpackKit(root, file) {
  if (existsSync(root) && readdirSync(root).length > 0) throw new Error(`Kit target ${root} is not empty`);
  mkdirSync(root, { recursive: true });
  const result = spawnSync('tar', ['-xzf', file, '-C', root, '--strip-components=1']);
  if (result.status !== 0) throw new Error(`Cannot extract ${file}: ${result.stderr}`);
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  for (const script of ['check', 'build']) if (!scripts[script]) throw new Error(`Start kit ${basename(file)} has no "${script}" script`);
}

async function fetchPrevious(pin, destination) {
  const url = new URL(pin.url);
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/hjung3113/analytics-platform/releases/tag/')) throw new Error('Previous bundle must be pinned to this repository release');
  const base = pin.url.replace('/releases/tag/', '/releases/download/');
  mkdirSync(destination, { recursive: true });
  for (const file of ['SHA256SUMS', ...names.map(name => `ap-${name}-${pin.version}.tgz`), `ap-start-kit-${pin.version}.tgz`]) {
    const response = await fetch(`${base}/${file}`);
    if (!response.ok) throw new Error(`Previous download ${file}: HTTP ${response.status}`);
    writeFileSync(join(destination, file), Buffer.from(await response.arrayBuffer()));
    // Reject a tampered list before downloading payloads.
    if (file === 'SHA256SUMS' && digest(readFileSync(join(destination, file))) !== pin.sha256) throw new Error('SHA256SUMS checksum does not match the previous-bundle pin');
  }
}
export async function downloadPrevious(pin, destination, download = fetchPrevious) {
  await download(pin, destination);
  verifyBundle(destination, pin);
  verifyStartKit(destination, pin.version);
  return destination;
}

/**
 * The assembly is what the kit change carries (`assemblyFiles`: menus/, menus.ts, mock/assembly.ts and files the kit did not ship,
 * round-trip included); it must be byte-identical in every phase. Kit files (vendor/, lockfile, manifest) change with the kit.
 * Without a kit SHA256SUMS every file counts, with the nine @ap specifiers and the lockfile left out.
 */
export function assemblyHash(root) {
  const hash = createHash('sha256');
  for (const key of assemblyFiles(root).filter(path => path !== 'pnpm-lock.yaml')) {
    let content = readFileSync(join(root, key));
    if (key === 'package.json') {
      const manifest = JSON.parse(content.toString('utf8'));
      for (const name of names) if (manifest.dependencies?.[`@ap/${name}`]) manifest.dependencies[`@ap/${name}`] = '<bundle>';
      content = JSON.stringify(manifest);
    }
    hash.update(key).update('\0').update(content).update('\0');
  }
  return hash.digest('hex');
}
export function assertAssembly(root, expected) {
  if (assemblyHash(root) !== expected) throw new Error('assembly code changed between upgrade runs');
}
/** `execute(phase, directory, mode, root)` may return the folder the next phase starts from (a kit change moves the project). */
export async function runSequence({ root: start, previous, formal, execute, log = console.log }) {
  let root = start;
  const expected = assemblyHash(root);
  for (const [phase, directory, mode] of [['rc', previous, 'save'], ['formal', formal, 'restore'], ['rollback', previous, 'restore']]) {
    assertAssembly(root, expected);
    log(`sdk:upgrade-gate ${phase}: change kit → frozen install → build → run kit → ${mode} view`);
    const started = Date.now();
    const next = await execute(phase, directory, mode, root);
    if (typeof next === 'string') root = next;
    assertAssembly(root, expected);
    log(`sdk:upgrade-gate PASS ${phase} (${((Date.now() - started) / 1000).toFixed(1)}s; assembly ${expected})`);
  }
  log('sdk:upgrade-gate mock 통과');
  log(FINAL_REPORT);
}

function command(commandName, args, cwd = repo, env = {}) {
  return new Promise((done, reject) => {
    const child = spawn(commandName, args, { cwd, env: { ...process.env, CI: 'true', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', status => done({ status, output }));
  });
}
async function checked(commandName, args, cwd, env) {
  const label = `${commandName} ${args.join(' ')}`;
  console.log(`sdk:upgrade-gate RUN ${label}`);
  const started = Date.now();
  const result = await command(commandName, args, cwd, env);
  if (result.status !== 0) throw new Error(`${commandName} ${args.join(' ')} exited ${result.status}:\n${result.output.slice(-6000)}`);
  console.log(`sdk:upgrade-gate PASS ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  return result;
}

/**
 * The kit change procedure of docs/guides/standalone-start-kit.md «버전 교체와 되돌리기», verbatim: rc starts from the previous kit
 * unpacked and verified; formal and rollback each unpack the target kit into a new folder, verify it, `adopt` the current project
 * with the newer kit's script, and install from the target kit's own lockfile with --frozen-lockfile (never regenerated).
 * `run(command, args, cwd)` executes one command; `afterInstall(phase, root, mode)` runs the browser checks.
 */
export async function kitSequence({ work, previous, formal, previousKit, formalKit, run, afterInstall = async () => {}, log }) {
  const start = join(work, `project-rc-${randomUUID()}`);
  unpackKit(start, previousKit);
  // The round-trip fixture is not part of the kit asset: it is the same browser assertion in every phase, so it comes from this
  // tree and travels with the project like any file the integrator added.
  cpSync(join(repo, 'tooling/sdk/fixtures/out-of-repo-assembly/round-trip'), join(start, 'round-trip'), { recursive: true });
  await run('node', ['sdk-bundle-check.mjs', 'verify'], start);
  await runSequence({ root: start, previous, formal, log, execute: async (phase, directory, mode, current) => {
    let root = current;
    if (phase !== 'rc') {
      root = join(work, `project-${phase}-${randomUUID()}`);
      unpackKit(root, directory === formal ? formalKit : previousKit);
      await run('node', ['sdk-bundle-check.mjs', 'verify'], root);
      // The newer kit carries `adopt`: the target on upgrade, the current project on rollback.
      const newer = phase === 'rollback' ? current : root;
      await run('node', [join(newer, 'sdk-bundle-check.mjs'), 'adopt', '--from', current, '--bundle', root], root);
    }
    await run('pnpm', ['install', '--frozen-lockfile'], root);
    await run('node', ['sdk-bundle-check.mjs', 'installed'], root);
    await run('pnpm', ['run', 'check'], root);
    await run('pnpm', ['run', 'build'], root);
    await afterInstall(phase, root, mode);
    return root;
  } });
}

/** Same round-trip fixture and browser assertions as e1, with storageState carried across installs at one stable origin. */
async function savedView(root, state, mode) {
  const require = createRequire(join(repo, 'apps/platform-e2e/package.json'));
  const { chromium, expect } = require('@playwright/test');
  const port = process.env.E2E_UPGRADE_PORT ?? '4193';
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('E2E_UPGRADE_PORT must be a port from 1024 to 65535');
  const origin = `http://127.0.0.1:${port}`;
  const fixture = join(root, 'round-trip');
  const server = spawn(join(root, 'node_modules/.bin/vite'), [fixture, '--config', join(fixture, 'vite.config.ts'), '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(done => server.once('close', done));
  let launchError;
  server.once('error', error => { launchError = error; });
  let browser;
  try {
    await expect.poll(async () => {
      if (launchError) throw launchError;
      if (server.exitCode !== null) throw new Error(`Round-trip Vite exited ${server.exitCode}: ${output}`);
      try { return (await fetch(origin)).status; } catch { return 0; }
    }, { timeout: 60_000 }).toBe(200);
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(mode === 'restore' ? { storageState: state } : {}) });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('platform:role', JSON.stringify('engineer')));
    await page.goto(`${origin}/inhouse`);
    await expect(page.getByRole('cell', { name: 'all-A', exact: true })).toBeVisible();
    const globalBefore = await page.getByTestId('round-trip-context').textContent();
    if (mode === 'save') {
      await page.getByLabel('Axis group').selectOption('team');
      await page.getByLabel('Row filter').selectOption('new');
      await page.getByRole('button', { name: 'Save menu view', exact: true }).click();
      await expect(page.getByRole('status', { name: 'View operation' })).toHaveText('Saved');
      const entries = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('platform:saved-views:v1:')));
      expect(entries).toHaveLength(1);
      expect(JSON.parse(entries[0][1]).views).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'menu-view', page: expect.arrayContaining([['rtFilter', 'new'], ['rtAxis', 'team']]) })]));
      await context.storageState({ path: state });
    } else {
      await page.getByRole('button', { name: 'Restore menu view', exact: true }).click();
      await expect(page.getByRole('status', { name: 'View operation' })).toHaveText('Restored');
      await expect(page.getByLabel('Axis group')).toHaveValue('team');
      await expect(page.getByLabel('Row filter')).toHaveValue('new');
      await expect(page).toHaveURL(/rtFilter=new/);
      await expect(page.getByRole('cell', { name: 'new-A', exact: true })).toBeVisible();
    }
    expect(JSON.parse(await page.getByTestId('round-trip-context').textContent())).toEqual(JSON.parse(globalBefore));
    await context.close();
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill('SIGTERM');
    await exited;
  }
}

async function integration(previous, formal, work, { mutate = false } = {}) {
  verifyBundle(previous);
  verifyBundle(formal);
  // Check archive versions too: the installed specifiers alone do not prove different releases were exercised.
  const versions = [previous, formal].map(directory => new Set(names.map(name => {
    const file = releaseTarball(directory, name);
    const manifest = JSON.parse(readTarEntry(readFileSync(file), 'package/package.json').toString('utf8'));
    if (manifest.name !== `@ap/${name}`) throw new Error(`Wrong package in ${file}`);
    return manifest.version;
  })));
  if (versions.some(set => set.size !== 1) || [...versions[0]][0] === [...versions[1]][0]) throw new Error('Upgrade requires two distinct, internally consistent bundle versions');
  // A release directory without a start-kit asset (sdk:pack output, an rc before #1790) gets one built from its nine tarballs.
  for (const directory of [previous, formal]) if (!kitAsset(directory)) await checked('node', ['tooling/sdk/sdk-kit.mjs', '--tarballs', directory]);
  const state = join(work, `storage-${randomUUID()}.json`);
  const started = Date.now();
  await kitSequence({
    work, previous, formal, previousKit: kitAsset(previous), formalKit: kitAsset(formal),
    run: (commandName, args, cwd) => checked(commandName, args, cwd),
    afterInstall: async (phase, root, mode) => {
      await checked('pnpm', ['--filter', '@ap/platform-e2e', 'exec', 'playwright', 'test', '--config', 'playwright.kit.config.ts'], repo, { AP_SDK_KIT_DIR: root });
      console.log(`sdk:upgrade-gate ${phase}: ${mode} saved view via storageState`);
      await savedView(root, state, mode);
      if (mutate && phase === 'rc') writeFileSync(join(root, 'menus.ts'), `${readFileSync(join(root, 'menus.ts'), 'utf8')}\n// self-test: changed assembly line\n`);
    },
  });
  console.log(`sdk:upgrade-gate three kit changes/installs/builds/runs: ${((Date.now() - started) / 1000).toFixed(1)}s (isolated CI job)`);
}

async function main(args) {
  if (args.length !== 1) throw new Error('usage: sdk-upgrade-gate <current bundle directory> | --self-test');
  const work = mkdtempSync(join(tmpdir(), 'ap-sdk-upgrade-'));
  try {
    if (args[0] === '--self-test') {
      const a = join(work, 'a');
      const b = join(work, 'b');
      for (const [out, version] of [[a, '0.0.0-gate-a'], [b, '0.0.0-gate-b']]) await checked('node', ['tooling/sdk/sdk-pack.mjs', '--version', version, '--out', out]);
      await integration(a, b, work);
      try {
        await integration(a, b, work, { mutate: true });
      } catch (error) {
        if (!error.message.includes('assembly code changed')) throw error;
        console.log('sdk:upgrade-gate PASS self-test: one changed assembly line rejected');
        console.log(FINAL_REPORT);
        return;
      }
      throw new Error('Self-test accepted an assembly mutation');
    }
    const formal = resolve(args[0]);
    verifyBundle(formal);
    const pin = JSON.parse(readFileSync(join(repo, 'tooling/sdk/previous-bundle.json'), 'utf8'));
    console.log(`sdk:upgrade-gate download previous bundle ${pin.version} (${pin.url})`);
    const previous = await downloadPrevious(pin, join(work, 'previous'));
    await integration(previous, formal, work);
    console.log(FINAL_REPORT);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`sdk:upgrade-gate FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
