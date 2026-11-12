// Negative checks of the out-of-repo assembly (host-entry-contract §10.5, ADR-0141's entry condition; #1702 node 1702e2).
// Usage: node tooling/sdk/sdk-consumer-negatives.mjs <dir with the ap-*.tgz from `pnpm sdk:pack`> [--skip <id>]...
//
// One consumer project (the #1790 kit fixture, installed from local release tarballs) carries
// the whole table. Every id must prove its own gate: a malformed declaration is rejected with its own message, an output
// scan fails on what it forbids, a planted second kernel copy fails the single-copy check, stored items of a removed menu
// survive, an unknown URL key survives a navigation, and the offline install passes only from a warmed store. `--skip id`
// (test hook) removes one id; the run then fails naming that id.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { releaseTarball, singleCopyPeers, writeKitProject } from './sdk-consumer-check.mjs';
import { scanBuildOutput } from './sdk-kit-check.mjs';
import { checkManifests, readTarEntry } from './sdk-bundle-check.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NEGATIVES_FIXTURE = join(repoRoot, 'tooling', 'sdk', 'fixtures', 'out-of-repo-assembly', 'negatives');
/** The planted offender of external-origin-in-output: an origin no allowlist entry can match. */
const PLANTED_ORIGIN = 'https://external-origin.negatives.example/leak';

function fail(message) {
  throw new Error(message);
}

/** The ten negative ids of §10.5, in acceptance order. `fixture` is copied into the consumer project for vitest ids. */
export const NEGATIVES = Object.freeze([
  { id: 'duplicate-menu-id', kind: 'vitest', reason: 'Duplicate menu id "kit-overview"' },
  { id: 'undeclared-permission', kind: 'vitest', reason: 'permission "kit:not-declared" is not a platform permission' },
  { id: 'unsupported-contract-integer', kind: 'vitest', reason: 'declares unsupported contract 99' },
  { id: 'missing-required-host-feature', kind: 'vitest', reason: 'requires host feature "write" which this host does not provide' },
  { id: 'two-kernel-copies', kind: 'kernel-copies', reason: 'two kernel copies (host-entry-contract §5)' },
  { id: 'removed-menu-stored-items-kept', kind: 'vitest', reason: 'the removed menu’s stored item is kept' },
  { id: 'unknown-url-key-preserved', kind: 'vitest', reason: 'zzFuture=keep-me survives the navigation' },
  { id: 'sourcemap-in-output', kind: 'output-scan', reason: '.js.map: source map in the build output' },
  { id: 'external-origin-in-output', kind: 'output-scan', reason: `external origin ${PLANTED_ORIGIN}` },
  { id: 'install-needs-network', kind: 'install', reason: 'offline install passes from the warmed store, fails without one dependency' },
].map((entry) => Object.freeze(entry)));
export const NEGATIVE_IDS = Object.freeze(NEGATIVES.map((entry) => entry.id));

/** Every id must run; a run that skipped or lost one fails naming it (the unit test drives this with `--skip`). */
export function assertComplete(ranIds, skippedIds = []) {
  const missing = NEGATIVE_IDS.filter((id) => !ranIds.includes(id));
  if (missing.length > 0) {
    const via = skippedIds.length > 0 ? ` (--skip: ${skippedIds.join(', ')})` : '';
    fail(`the negative table did not run completely; missing: ${missing.join(', ')}${via}`);
  }
}

/** The production runner and omission tests share the same dispatch and completeness gate. */
export async function runNegativeTable(execute, skipped = []) {
  const ran = [];
  for (const entry of NEGATIVES) {
    if (skipped.includes(entry.id)) continue;
    try {
      await execute(entry);
    } catch (error) {
      fail(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    ran.push(entry.id);
  }
  assertComplete(ran, skipped);
}

/** Remove one package's index from this run's private store, leaving the frozen project unchanged. */
export function removeStoreDependency(store, name, version) {
  let removed = 0;
  // pnpm 11.1.1 (the pinned runner) stores `integrity\tpkgId` keys in v11/index.db.
  // Edit only the dedicated store after pnpm exits; no global store or content shared by another package is touched.
  for (const versionEntry of readdirSync(store)) {
    const index = join(store, versionEntry, 'index.db');
    if (!existsSync(index)) continue;
    const db = new DatabaseSync(index);
    try {
      const keys = db.prepare('SELECT key FROM package_index').all()
        .map(row => row.key).filter(key => key.endsWith(`\t${name}@${version}`));
      const remove = db.prepare('DELETE FROM package_index WHERE key = ?');
      for (const key of keys) removed += Number(remove.run(key).changes);
    } finally { db.close(); }
  }
  if (removed === 0) fail(`${name}@${version} not found in the dedicated warmed store`);
  return removed;
}

/** Node lookup from `dir` upward for a package's real directory (package.json is not an exported subpath of the SDK). */
function resolveFrom(dir, name) {
  for (let current = realpathSync(dir); ; current = dirname(current)) {
    const candidate = join(current, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(current) === current) return null;
  }
}

/** Single-copy check reused for the §5 kernel negative (sdk:consumer-check asserts all peers; this names the kernel). */
export function kernelCopyMismatches(root) {
  const appKernel = resolveFrom(root, '@ap/kernel');
  if (appKernel === null) fail('@ap/kernel does not resolve from the consumer project');
  const consumers = singleCopyPeers().filter(([consumer]) => ['components', 'shell', 'app-host'].includes(consumer));
  const mismatches = [];
  for (const [consumer] of consumers) {
    const consumerDir = resolveFrom(root, `@ap/${consumer}`);
    if (consumerDir === null) fail(`@ap/${consumer} does not resolve from the consumer project`);
    const found = resolveFrom(consumerDir, '@ap/kernel');
    if (found !== null && found !== appKernel) {
      mismatches.push(`two-kernel-copies: @ap/${consumer} resolves @ap/kernel to ${found}, the app resolves ${appKernel} — two copies break the shared provider (host-entry-contract §5)`);
    }
  }
  return mismatches;
}

/** No install script and no git/URL/path dependency in any of the nine tarball manifests (reuse of the bundle gate). */
export function manifestFailures(tarballDir) {
  const manifests = readdirSync(tarballDir).filter((file) => file.endsWith('.tgz')).map((file) => {
    const tgz = readFileSync(join(tarballDir, file));
    const entry = readTarEntry(tgz, 'package/package.json') ?? readTarEntry(tgz, 'package.json');
    const manifest = JSON.parse(entry?.toString('utf8') ?? fail(`${file} carries no package.json`));
    return { file, manifest };
  });
  return checkManifests(manifests);
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    // stdin closed: a prompt fails the step instead of hanging it. The tarball server in this process answers pnpm.
    const child = spawn(command, args, { cwd, env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => reject(new Error(`${command} could not run: ${error.message}`)));
    child.on('close', (status) => resolvePromise({ status: status ?? -1, output }));
  });
}

function expectFailure(id, { status, output }, pattern) {
  if (status === 0) fail(`${id}: expected the check to fail with "${pattern}", it passed instead:\n${output.trim().slice(-2000)}`);
  if (!pattern.test(output)) fail(`${id}: failed for another reason (wanted "${pattern}"):\n${output.trim().slice(-3000)}`);
}

async function main(argv) {
  const tarballArg = argv[0];
  if (!tarballArg || !existsSync(resolve(tarballArg))) fail('usage: sdk-consumer-negatives <dir with the ap-*.tgz files> [--skip <id>]...');
  const tarballDir = resolve(tarballArg);
  const skip = [];
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] !== '--skip' || !NEGATIVE_IDS.includes(argv[index + 1])) fail(`unknown argument ${argv[index]}; only --skip <id> of ${NEGATIVE_IDS.join(', ')}`);
    skip.push(argv[index + 1]);
    index += 1;
  }

  const started = Date.now();
  const step = (name) => process.stdout.write(`sdk:consumer-negatives ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  const work = mkdtempSync(join(tmpdir(), 'ap-sdk-negatives-'));
  const root = join(work, 'project');
  const store = join(work, 'store');
  try {
    if (relative(repoRoot, root) === '' || !relative(repoRoot, root).startsWith(`..${sep}`)) fail('consumer directory must be outside the repository');
    step(`write consumer project (kit fixture + negative fixtures) at ${root}`);
    writeKitProject(root, (name) => `file:${releaseTarball(tarballDir, name)}`);
    mkdirSync(join(root, 'src', 'negatives'));
    for (const entry of NEGATIVES.filter((candidate) => candidate.kind === 'vitest')) {
      const fixture = join(NEGATIVES_FIXTURE, `${entry.id}.test.tsx`);
      if (!existsSync(fixture)) fail(`negative fixture missing: ${fixture}`);
      cpSync(fixture, join(root, 'src', 'negatives', `${entry.id}.test.tsx`));
    }
    step('install-needs-network (pre): no tarball manifest carries an install script or a git/URL dependency');
    const manifestProblems = manifestFailures(tarballDir);
    if (manifestProblems.length > 0) fail(`install-needs-network: ${manifestProblems.join('; ')}`);

    step('pnpm install (local release tarballs, dedicated store warmed for the offline checks)');
    const install = await run('pnpm', ['install', '--no-frozen-lockfile', '--store-dir', store], root);
    if (install.status !== 0) fail(`pnpm install exited ${install.status}:\n${install.output.trim().slice(-3000)}`);

    step('tsc --noEmit (kit program, negative fixtures included)');
    const tsc = await run('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], root);
    if (tsc.status !== 0) fail(`tsc exited ${tsc.status}:\n${tsc.output.trim().slice(-3000)}`);

    step("kit script 'build' (dist/ for the output scans)");
    const build = await run('pnpm', ['run', 'build'], root);
    if (build.status !== 0) fail(`pnpm run build exited ${build.status}:\n${build.output.trim().slice(-3000)}`);

    await runNegativeTable(async (entry) => {
      const idStart = Date.now();
      if (entry.kind === 'vitest') {
        // The fixture applies the malformed input to the installed packages and asserts the rejection message; the step
        // fails when the platform stops rejecting, and the runner names the id and its own message.
        const result = await run('pnpm', ['exec', 'vitest', 'run', `src/negatives/${entry.id}.test.tsx`], root);
        if (result.status !== 0) fail(`${entry.id}: the fixture failed (the platform no longer rejects with "${entry.reason}"):\n${result.output.trim().slice(-3000)}`);
      } else if (entry.id === 'two-kernel-copies') {
        const clean = kernelCopyMismatches(root);
        if (clean.length > 0) fail(`two-kernel-copies: the single-copy check failed before anything was planted: ${clean.join('; ')}`);
        const planted = join(root, 'node_modules', '@ap', 'components', 'node_modules', '@ap', 'kernel');
        // dereference: node_modules/@ap/kernel is a pnpm symlink; a symlink plant would realpath to the app copy.
        cpSync(join(root, 'node_modules', '@ap', 'kernel'), planted, { recursive: true, dereference: true });
        try {
          const mismatches = kernelCopyMismatches(root);
          if (!mismatches.some((message) => message.includes('two-kernel-copies'))) {
            fail(`two-kernel-copies: a planted second @ap/kernel copy was not detected: [${mismatches.join('; ')}]`);
          }
        } finally {
          rmSync(planted, { recursive: true, force: true });
        }
      } else if (entry.id === 'sourcemap-in-output') {
        const dist = join(root, 'dist');
        const clean = scanBuildOutput(dist);
        if (clean.length > 0) fail(`sourcemap-in-output: the built dist is not clean before planting: ${clean.join('; ')}`);
        const plantedMap = join(dist, 'assets', 'negatives-check.js.map');
        writeFileSync(plantedMap, '{"version":3}\n');
        const failures = scanBuildOutput(dist).join('\n');
        if (!/negatives-check\.js\.map: source map/.test(failures)) fail(`sourcemap-in-output: a planted .map file was not reported:\n${failures}`);
        rmSync(plantedMap, { force: true }); // the origin scan below starts from a clean dist again
      } else if (entry.id === 'external-origin-in-output') {
        const dist = join(root, 'dist');
        const target = readdirSync(join(dist, 'assets')).find((file) => file.endsWith('.js')) ?? fail('dist/assets carries no JS file');
        const asset = join(dist, 'assets', target);
        writeFileSync(asset, `${readFileSync(asset, 'utf8')}\nconst negativesLeak = "${PLANTED_ORIGIN}";\n`);
        const failures = scanBuildOutput(dist).join('\n');
        // the scan reports the bare origin (https://host), not the full URL with its path
        if (!failures.includes(`external origin ${new URL(PLANTED_ORIGIN).origin}`)) fail(`external-origin-in-output: the planted origin was not reported:\n${failures}`);
      } else if (entry.id === 'install-needs-network') {
        // Exactly the same manifest and frozen lockfile, with node_modules absent on both attempts.
        rmSync(join(root, 'node_modules'), { recursive: true, force: true });
        const args = ['install', '--offline', '--frozen-lockfile', '--store-dir', store];
        const warmed = await run('pnpm', args, root);
        if (warmed.status !== 0) fail(`install-needs-network: the warmed-store offline install failed:\n${warmed.output.trim().slice(-3000)}`);
        step('install-needs-network: warmed store, node_modules removed, offline frozen install exited 0');
        const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'typescript', 'package.json'), 'utf8'));
        rmSync(join(root, 'node_modules'), { recursive: true, force: true });
        removeStoreDependency(store, 'typescript', version);
        const missing = await run('pnpm', args, root);
        expectFailure('install-needs-network', missing, /ERR_PNPM_(?:NO_OFFLINE_TARBALL|MISSING_PACKAGE_OFFLINE)/);
        step(`install-needs-network: typescript@${version} missing from store, offline frozen install exited ${missing.status} with pnpm offline error`);
      } else {
        fail(`negative ${entry.id} has no runner`);
      }
      step(`PASS ${entry.id} — ${entry.reason} (${((Date.now() - idStart) / 1000).toFixed(1)}s)`);
    }, skip);
    process.stdout.write('sdk:consumer-negatives mock 통과\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`sdk:consumer-negatives FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
