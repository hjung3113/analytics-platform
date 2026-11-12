// Host-only integration: node tooling/sdk/sdk-upgrade-gate.mjs <current bundle directory>
// --self-test packs this tree at gate-a/gate-b and exercises replacement, rollback, mutation and strict peers.
// The assembly is the PREVIOUS release's start kit (`ap-start-kit-<V>.tgz`) for rc, formal and rollback alike: a menu built on N-1
// must run unchanged on N and back, so the kit never changes between phases. The current tree's kit against the new bundle is
// sdk-kit-check's job. Without a start-kit asset (the --self-test path) the tree kit is the assembly.
// Tests inject the download and phase execution; they never install, fetch or launch browsers.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releasePackages } from './sdk-exports.mjs';
import { releaseTarball, writeKitProject } from './sdk-consumer-check.mjs';
import { readTarEntry } from './sdk-bundle-check.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const names = releasePackages().map(({ name }) => name);
const digest = content => createHash('sha256').update(content).digest('hex');
export const FINAL_REPORT = 'rc-based replacement passed; first real N-1 to N is v0.37.0';

/** Authenticate the checksum list before trusting any of its nine release entries. Start-kit assets are separate. */
export function verifyBundle(directory, { version, sha256 } = {}) {
  const sums = readFileSync(join(directory, 'SHA256SUMS'));
  if (sha256 && digest(sums) !== sha256) throw new Error('SHA256SUMS checksum does not match the previous-bundle pin');
  const entries = new Map();
  for (const line of sums.toString('utf8').trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    if (!match || entries.has(match[2])) throw new Error(`Invalid or duplicate SHA256SUMS entry: ${line}`);
    entries.set(match[2], match[1]);
  }
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
  const line = readFileSync(join(directory, 'SHA256SUMS'), 'utf8').split(/\r?\n/).find(entry => entry.endsWith(`  ${file}`));
  if (!present && !line) return null;
  if (!line) throw new Error(`Start kit missing from SHA256SUMS: ${file}`);
  if (!present) throw new Error(`Missing previous start kit file: ${file}`);
  if (line.slice(0, 64) !== digest(readFileSync(join(directory, file)))) throw new Error(`Start kit checksum mismatch: ${file}`);
  return file;
}

/** Project root from the previous start kit when the directory has one, else from this tree's kit. */
export function buildProject(root, previous, apSpec) {
  const kit = readdirSync(previous).find(file => /^ap-start-kit-.+\.tgz$/.test(file));
  if (!kit) writeKitProject(root, apSpec);
  else extractStartKit(root, join(previous, kit));
  // The round-trip fixture is not part of the kit asset: it is the same browser assertion for every phase, so it comes from this tree.
  cpSync(join(repo, 'tooling/sdk/fixtures/out-of-repo-assembly/round-trip'), join(root, 'round-trip'), { recursive: true });
  return kit ? 'previous-kit' : 'tree';
}
function extractStartKit(root, file) {
  mkdirSync(root, { recursive: true });
  const result = spawnSync('tar', ['-xzf', file, '-C', root, '--strip-components=1']);
  if (result.status !== 0) throw new Error(`Cannot extract ${kit}: ${result.stderr}`);
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  for (const script of ['check', 'build']) if (!scripts[script]) throw new Error(`Previous start kit has no "${script}" script`);
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

/** Resolve every specifier before a single atomic manifest rename: partial replacements cannot be written. */
export function replaceBundle(root, directory, base) {
  const replacements = Object.fromEntries(names.map(name => [`@ap/${name}`, `${base}/${basename(releaseTarball(directory, name))}`]));
  const manifestPath = join(root, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.dependencies = { ...manifest.dependencies, ...replacements };
  const pending = `${manifestPath}.replacement`;
  writeFileSync(pending, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(pending, manifestPath);
}

/** All fixture files, including mock/real assembly and round-trip, are immutable; only install/build outputs differ. */
export function assemblyHash(root) {
  const hash = createHash('sha256');
  const ignored = new Set(['node_modules', 'dist', '.vite', 'pnpm-lock.yaml']);
  function walk(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored.has(entry.name)) continue;
      const path = join(directory, entry.name);
      const key = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(path, `${key}/`);
      else if (entry.isFile()) {
        let content = readFileSync(path);
        if (key === 'package.json') {
          const manifest = JSON.parse(content.toString('utf8'));
          for (const name of names) if (manifest.dependencies?.[`@ap/${name}`]) manifest.dependencies[`@ap/${name}`] = '<bundle>';
          content = JSON.stringify(manifest);
        }
        hash.update(key).update('\0').update(content).update('\0');
      }
      else throw new Error(`Unexpected assembly entry: ${key}`);
    }
  }
  walk(root);
  return hash.digest('hex');
}
export function assertAssembly(root, expected) {
  if (assemblyHash(root) !== expected) throw new Error('assembly code changed between upgrade runs');
}
export async function runSequence({ root, previous, formal, execute, log = console.log }) {
  const expected = assemblyHash(root);
  for (const [phase, directory, mode] of [['rc', previous, 'save'], ['formal', formal, 'restore'], ['rollback', previous, 'restore']]) {
    assertAssembly(root, expected);
    log(`sdk:upgrade-gate ${phase}: replace all nine → install → build → run kit → ${mode} view`);
    const started = Date.now();
    await execute(phase, directory, mode);
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

async function serveBundles(directories) {
  const token = randomUUID();
  const server = createServer((request, response) => {
    const [run, id, file, ...rest] = (request.url ?? '').slice(1).split('/');
    const directory = directories[Number(id)];
    if (request.method !== 'GET' || run !== token || !directory || rest.length || !file || basename(file) !== file || !file.endsWith('.tgz') || !existsSync(join(directory, file))) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200).end(readFileSync(join(directory, file)));
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  return { server, base: directory => `http://127.0.0.1:${server.address().port}/${token}/${directories.indexOf(directory)}` };
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

async function integration(previous, formal, work, { mutate = false, strictPeerProbe = false } = {}) {
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
  const root = join(work, `project-${randomUUID()}`);
  const served = await serveBundles([previous, formal]);
  try {
    console.log(`sdk:upgrade-gate assembly from ${buildProject(root, previous, name => `${served.base(previous)}/${basename(releaseTarball(previous, name))}`)}`);
    const state = join(work, `storage-${randomUUID()}.json`);
    const started = Date.now();
    await runSequence({ root, previous, formal, execute: async (phase, directory, mode) => {
      console.log(`sdk:upgrade-gate ${phase}: rewrite all nine specifiers from ${directory}`);
      replaceBundle(root, directory, served.base(directory));
      await checked('pnpm', ['install', '--no-frozen-lockfile'], root);
      await checked('pnpm', ['run', 'check'], root);
      await checked('pnpm', ['run', 'build'], root);
      await checked('pnpm', ['--filter', '@ap/platform-e2e', 'exec', 'playwright', 'test', '--config', 'playwright.kit.config.ts'], repo, { AP_SDK_KIT_DIR: root });
      console.log(`sdk:upgrade-gate ${phase}: ${mode} saved view via storageState`);
      await savedView(root, state, mode);
      if (mutate && phase === 'rc') writeFileSync(join(root, 'menus.ts'), `${readFileSync(join(root, 'menus.ts'), 'utf8')}\n// self-test: changed assembly line\n`);
    } });
    console.log(`sdk:upgrade-gate three installs/builds/runs: ${((Date.now() - started) / 1000).toFixed(1)}s (isolated CI job)`);
    if (strictPeerProbe) {
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const oldKernel = manifest.dependencies['@ap/kernel'];
      replaceBundle(root, formal, served.base(formal));
      const mixed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      mixed.dependencies['@ap/kernel'] = oldKernel;
      writeFileSync(join(root, 'package.json'), JSON.stringify(mixed));
      const result = await command('pnpm', ['install', '--no-frozen-lockfile'], root);
      if (!Number.isInteger(result.status) || result.status <= 0 || !result.output.includes('ERR_PNPM_PEER_DEP_ISSUES')) throw new Error(`Eight-of-nine replacement did not fail with strict-peer error (exit ${result.status}): ${result.output.slice(-3000)}`);
      console.log(`sdk:upgrade-gate PASS eight-of-nine replacement rejected: ERR_PNPM_PEER_DEP_ISSUES (exit ${result.status})`);
    }
  } finally {
    await new Promise(done => served.server.close(done));
    rmSync(root, { recursive: true, force: true });
  }
}

async function main(args) {
  if (args.length !== 1) throw new Error('usage: sdk-upgrade-gate <current bundle directory> | --self-test');
  const work = mkdtempSync(join(tmpdir(), 'ap-sdk-upgrade-'));
  try {
    if (args[0] === '--self-test') {
      const a = join(work, 'a');
      const b = join(work, 'b');
      for (const [out, version] of [[a, '0.0.0-gate-a'], [b, '0.0.0-gate-b']]) await checked('node', ['tooling/sdk/sdk-pack.mjs', '--version', version, '--out', out]);
      await integration(a, b, work, { strictPeerProbe: true });
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
