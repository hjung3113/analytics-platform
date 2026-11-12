// Offline install of the start-kit asset in a Linux container with no network (#1701 acceptance 3 and 7).
// Usage: node tooling/sdk/sdk-kit-offline.mjs <release dir with ap-start-kit-<version>.tgz>   (needs Docker)
//
// The in-house path the bundle guide names: a connected machine of the same OS and architecture builds the pnpm store,
// and the isolated machine installs from the kit and that store only.
//   1. connected container (same image): installs pnpm 11.1.1 into a tools folder and runs `pnpm fetch` from the kit's
//      lockfile into a store folder. The kit copy it reads is thrown away.
//   2. isolated container (`--network none`): a fresh copy of the kit from the asset, the store and the tools folder only.
//      It proves the network is off, then bundle verify → `pnpm install --offline --frozen-lockfile` → one @ap/* copy
//      each → `check` → `build`.
//   3. self-test: the same isolated install with an empty store must fail with pnpm's offline error.
// Containers run with --rm, a memory cap and the caller's uid; the temp folders are removed at the end.
// The public CI runner is linux-x64, so CI covers linux-x64 only; another architecture runs the same steps on its own host.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_PREFIX } from './sdk-kit.mjs';

export const IMAGE = 'node:26.7.0-bookworm-slim';
export const PNPM_VERSION = '11.1.1';
const MEMORY = '4g';

let step = 'setup';

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited ${result.status}:\n${`${result.stdout}\n${result.stderr}`.trim().slice(-3000)}`);
  return result.stdout;
}

function runStep(name, action) {
  step = name;
  const started = Date.now();
  const result = action();
  process.stdout.write(`sdk:kit-offline PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  return result;
}

/** `docker run` arguments shared by both containers: removed on exit, memory-capped, the caller's uid, a writable HOME. */
export function dockerArgs({ network, mounts, script }) {
  const user = typeof process.getuid === 'function' ? [`--user`, `${process.getuid()}:${process.getgid()}`] : [];
  return [
    'run', '--rm', `--memory=${MEMORY}`, `--network=${network}`, ...user,
    '-e', 'HOME=/tmp/home', '-e', 'CI=true', '-e', 'PATH=/tools/bin:/usr/local/bin:/usr/bin:/bin',
    ...mounts.flatMap(([host, container]) => ['-v', `${host}:${container}`]),
    '-w', '/kit', IMAGE, 'bash', '-euo', 'pipefail', '-c', `mkdir -p /tmp/home && ${script}`,
  ];
}

/** Proves the container has no network: any fetch must fail. */
export const NO_NETWORK_PROBE = `node -e "fetch('https://registry.npmjs.org/').then(() => { console.error('network is reachable'); process.exit(1); }, () => process.exit(0))"`;

function unpack(asset, into) {
  mkdirSync(into, { recursive: true });
  run('tar', ['-xzf', asset, '-C', into]);
  const [top, ...rest] = readdirSync(into);
  if (!top || rest.length > 0) fail(`the asset must hold one folder, found ${readdirSync(into).join(', ')}`);
  return join(into, top);
}

function main() {
  const releaseArg = process.argv[2];
  if (!releaseArg) fail('usage: sdk-kit-offline <release dir with ap-start-kit-<version>.tgz>');
  const release = resolve(releaseArg);
  const assets = readdirSync(release).filter((file) => file.startsWith(KIT_PREFIX) && file.endsWith('.tgz'));
  if (assets.length !== 1) fail(`expected one ${KIT_PREFIX}*.tgz in ${release}, found ${assets.length}`);
  const asset = join(release, assets[0]);
  const work = mkdtempSync(join(tmpdir(), 'ap-sdk-kit-offline-'));
  try {
    const tools = join(work, 'tools');
    const store = join(work, 'store');
    mkdirSync(tools);
    mkdirSync(store);
    runStep(`pull ${IMAGE}`, () => run('docker', ['pull', '--quiet', IMAGE]));
    const connectedKit = unpack(asset, join(work, 'connected'));
    runStep('connected container: pnpm into tools, pnpm fetch from the kit lockfile into the store', () => run('docker', dockerArgs({
      network: 'bridge',
      mounts: [[connectedKit, '/kit'], [tools, '/tools'], [store, '/store']],
      script: `npm install --global --prefix /tools pnpm@${PNPM_VERSION} --no-audit --no-fund >/dev/null && pnpm --version && pnpm fetch --store-dir /store`,
    })));
    rmSync(join(work, 'connected'), { recursive: true, force: true });
    const isolatedKit = unpack(asset, join(work, 'isolated'));
    runStep('isolated container (--network none): verify, offline frozen install, installed, check, build', () => run('docker', dockerArgs({
      network: 'none',
      mounts: [[isolatedKit, '/kit'], [tools, '/tools'], [store, '/store']],
      script: [
        NO_NETWORK_PROBE,
        'node sdk-bundle-check.mjs verify',
        'pnpm install --offline --frozen-lockfile --store-dir /store',
        'node sdk-bundle-check.mjs installed',
        'pnpm run check',
        'pnpm run build',
      ].join(' && '),
    })));
    // Self-test: the same isolated install with an empty store must fail with pnpm's offline error, or the step above
    // proves nothing about where the packages came from.
    const emptyStore = join(work, 'empty-store');
    mkdirSync(emptyStore);
    const bareKit = unpack(asset, join(work, 'bare'));
    runStep('self-test: the isolated install with an empty store fails (ERR_PNPM_NO_OFFLINE_TARBALL)', () => {
      const result = spawnSync('docker', dockerArgs({
        network: 'none',
        mounts: [[bareKit, '/kit'], [tools, '/tools'], [emptyStore, '/store']],
        script: 'pnpm install --offline --frozen-lockfile --store-dir /store',
      }), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const output = `${result.stdout}\n${result.stderr}`;
      if (result.status === 0) fail('an offline install with an empty store passed: the offline step does not prove the store is the only source');
      if (!output.includes('ERR_PNPM_NO_OFFLINE')) fail(`the empty-store install failed for another reason:\n${output.slice(-2000)}`);
    });
    process.stdout.write(`sdk:kit-offline passed (${IMAGE}, ${process.arch === 'x64' ? 'linux-x64' : `linux-${process.arch}`})\n`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`sdk:kit-offline FAILED at step "${step}": ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
