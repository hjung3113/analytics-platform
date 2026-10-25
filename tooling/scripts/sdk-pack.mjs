// Builds the five SDK packages and packs them into release tarballs (ADR-0056, #519).
// Usage: pnpm sdk:pack --version X.Y.Z --out <dir>   (--version defaults to 0.0.0-ci)
//
// Builds each package in dependency order (the build configs resolve siblings to the emitted declarations of the sibling),
// stages `dist` plus a generated release manifest in a temp directory outside the repo, runs `pnpm pack` there, writes
// SHA256SUMS next to the tarballs and rejects archives that carry source, tests, tsconfigs or a loose @ap/* version.
// `--out` must be absent or an empty directory (nothing in it is ever deleted); the five tarballs + SHA256SUMS are built in
// the temp directory and moved into `--out` only after every step passed.
// Tracked files are never touched; the only repo writes are the git-ignored `packages/<name>/dist` folders.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDK_PACKAGES, distTarget } from './sdk-exports.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCOPE = '@ap/';

function fail(message) {
  throw new Error(message);
}

function oneLine(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`;
    fail(`${command} ${args.join(' ')} failed (${result.status}): ${oneLine(detail).slice(0, 1500)}`);
  }
  return result.stdout;
}

function parseArgs(argv) {
  const options = { version: '0.0.0-ci', out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--version' || flag === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail(`${flag} needs a value`);
      options[flag.slice(2)] = value;
      i += 1;
    } else {
      fail(`unknown argument ${flag} (usage: sdk-pack --version X.Y.Z --out <dir>)`);
    }
  }
  if (!options.out) fail('--out <dir> is required');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(options.version)) fail(`--version ${options.version} is not a SemVer`);
  return options;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

/**
 * The release manifest of one package. Siblings (`@ap/*`) become peers at exactly the release version, never dependencies: a
 * consumer installs every tarball by URL, and pnpm's default `blockExoticSubdeps` rejects a URL-resolved package that a
 * dependency pulls in (`ERR_PNPM_EXOTIC_SUBDEP`, #806). As peers they resolve to the consumer's own direct URL dependencies.
 */
export function releaseManifest(name, source, version) {
  const exports = {};
  for (const [subpath, target] of Object.entries(source.exports ?? {})) exports[subpath] = distTarget(target, `${name} exports["${subpath}"]`);
  if (Object.keys(exports).length === 0) fail(`${name}: source manifest has no exports`);
  const external = Object.fromEntries(Object.entries(source.dependencies ?? {}).filter(([dep]) => !dep.startsWith(SCOPE)));
  const siblings = Object.fromEntries(Object.keys(source.dependencies ?? {}).filter((dep) => dep.startsWith(SCOPE)).map((dep) => [dep, version]));
  const manifest = {
    name: source.name,
    version,
    type: 'module',
    exports,
    files: ['dist'],
  };
  // Keeps tree-shaking for consumers: without it a bundler keeps every module a barrel re-exports (@ap/ui, #706).
  if (source.sideEffects !== undefined) manifest.sideEffects = source.sideEffects;
  if (Object.keys(external).length > 0) manifest.dependencies = external;
  const optional = name === 'components' ? { vitest: source.devDependencies?.vitest } : undefined;
  if (optional && !optional.vitest) fail('@ap/components must declare devDependencies.vitest for its optional testing peer');
  const peerDependencies = { ...source.peerDependencies, ...siblings, ...optional };
  if (Object.keys(peerDependencies).length > 0) manifest.peerDependencies = peerDependencies;
  if (optional) manifest.peerDependenciesMeta = Object.fromEntries(Object.keys(optional).map((peer) => [peer, { optional: true }]));
  return manifest;
}

function archiveRelativePath(path) {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized.split('/').includes('..') || normalized.startsWith('/')) fail(`unsafe path in packed archive: ${path}`);
  if (normalized === 'package') return '';
  if (!normalized.startsWith('package/')) fail(`unexpected packed archive path: ${path}`);
  return normalized.slice('package/'.length);
}

export function validateArchive(name, paths, manifest, version) {
  const files = paths.map(archiveRelativePath).filter(Boolean);
  const bad = (reason, test) => {
    const hit = files.find(test);
    if (hit) fail(`${name} tarball ${reason}: ${hit}`);
  };
  bad('includes source', (path) => path === 'src' || path.startsWith('src/'));
  bad('includes a tsconfig', (path) => path.split('/').some((part) => part.startsWith('tsconfig')));
  bad('includes a test file', (path) => /(^|\/)[^/]*\.test\.[^/]+$/.test(path) || path.split('/').includes('__tests__') || path.split('/').includes('__fixtures__'));
  for (const field of ['dependencies', 'optionalDependencies']) {
    const sibling = Object.keys(manifest[field] ?? {}).find((dep) => dep.startsWith(SCOPE));
    if (sibling) fail(`${name} tarball ${field}.${sibling}: siblings must be exact-version peerDependencies (blockExoticSubdeps, #806)`);
  }
  for (const [dep, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (dep.startsWith(SCOPE) && range !== version) fail(`${name} tarball peerDependencies.${dep} is ${range}, expected exactly ${version}`);
  }
  const present = new Set(files);
  const targets = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(targets));
  for (const target of Object.values(manifest.exports).flatMap(targets)) {
    if (!present.has(target.slice('./'.length))) fail(`${name} tarball is missing its exports target ${target}`);
  }
}

/** `--out` is never cleaned: it must be absent or an empty directory, so a failed run cannot destroy an earlier release. */
function assertOutDirFree(outDir) {
  if (!existsSync(outDir)) return;
  if (!statSync(outDir).isDirectory()) fail(`--out ${outDir} exists and is not a directory`);
  if (readdirSync(outDir).length > 0) fail(`--out ${outDir} is not empty; pass a new or empty directory (nothing is deleted)`);
}

function main() {
  const { version, out } = parseArgs(process.argv.slice(2));
  const outDir = resolve(out);
  const staging = mkdtempSync(join(tmpdir(), 'ap-sdk-pack-'));
  try {
    const relativeStaging = relative(repoRoot, staging);
    if (relativeStaging === '' || !relativeStaging.startsWith(`..${sep}`)) fail('staging directory must be outside the repository');
    assertOutDirFree(outDir);
    const collected = join(staging, 'out');
    mkdirSync(collected);

    const tarballs = [];
    for (const name of SDK_PACKAGES) {
      const packageRoot = join(repoRoot, 'packages', name);
      const source = readJson(join(packageRoot, 'package.json'));
      // dist is git-ignored; clearing it keeps a deleted source file from lingering in the tarball.
      rmSync(join(packageRoot, 'dist'), { recursive: true, force: true });
      process.stdout.write(`sdk:pack build ${source.name}\n`);
      run('pnpm', ['--filter', source.name, 'run', 'build'], repoRoot);
      if (!existsSync(join(packageRoot, 'dist'))) fail(`${source.name} build produced no dist`);

      const manifest = releaseManifest(name, source, version);
      const stage = join(staging, name);
      mkdirSync(stage);
      cpSync(join(packageRoot, 'dist'), join(stage, 'dist'), { recursive: true });
      writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

      const packDir = join(staging, `pack-${name}`);
      mkdirSync(packDir);
      run('pnpm', ['pack', '--pack-destination', packDir], stage);
      const packed = readdirSync(packDir).filter((file) => file.endsWith('.tgz'));
      if (packed.length !== 1) fail(`${source.name}: expected one tarball, found ${packed.length}`);
      const expectedName = `ap-${name}-${version}.tgz`;
      if (packed[0] !== expectedName) fail(`${source.name}: pnpm pack wrote ${packed[0]}, expected ${expectedName}`);

      const archivePaths = run('tar', ['-tzf', join(packDir, packed[0])], staging).split(/\r?\n/).filter(Boolean);
      const extracted = join(staging, `extract-${name}`);
      mkdirSync(extracted);
      run('tar', ['-xzf', join(packDir, packed[0]), '-C', extracted], staging);
      validateArchive(name, archivePaths, readJson(join(extracted, 'package', 'package.json')), version);

      cpSync(join(packDir, packed[0]), join(collected, packed[0]));
      tarballs.push(packed[0]);
    }

    const sums = tarballs.map((file) => `${createHash('sha256').update(readFileSync(join(collected, file))).digest('hex')}  ${file}`);
    writeFileSync(join(collected, 'SHA256SUMS'), `${sums.join('\n')}\n`);
    assertOutDirFree(outDir);
    mkdirSync(outDir, { recursive: true });
    for (const file of readdirSync(collected)) cpSync(join(collected, file), join(outDir, file));
    process.stdout.write(`sdk:pack passed: ${tarballs.length} tarballs (${version}) + SHA256SUMS in ${outDir}\n`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`sdk:pack FAILED: ${oneLine(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  }
}
