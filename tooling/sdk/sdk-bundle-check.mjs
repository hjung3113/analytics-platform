#!/usr/bin/env node
// Install check of the approved-release import bundle (#1701, docs/integration/approved-release-bundle.md §설치 검사).
// This file ships inside the bundle and runs on the in-house side before `pnpm install`, so it imports Node built-ins only.
//
// The bundle is the start kit folder itself (the kit's lockfile is the bundle's lockfile): `vendor/` holds the nine release
// tarballs, `pnpm-lock.yaml` resolves them as `file:vendor/…`, `third-party.json` lists every other package at its exact
// version, and `SHA256SUMS` covers the shipped files.
//
//   node sdk-bundle-check.mjs verify   [--bundle <dir>]                 checks 1–4, before install; exit 1 lists every failure
//   node sdk-bundle-check.mjs mirror   --registry <url> [--bundle <dir>] check 5: report third-party name@version missing
//                                                                        from the mirror (report only, installs nothing)
//   node sdk-bundle-check.mjs installed [--bundle <dir>]                after install: one copy of each @ap/* package on disk
//   node sdk-bundle-check.mjs third-party --lockfile <path>             prints third-party.json for a lockfile (release side)
//
// The mirror check sends only package names to the registry URL given on the command line; its result stays on the
// machine that runs it. Set AP_MIRROR_AUTH to a full Authorization header value if the mirror needs one.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const SCOPE = '@ap/';
// The nine release packages (ADR-0143). A repo test keeps this list equal to tooling/sdk/sdk-exports.mjs releasePackages().
export const BUNDLE_PACKAGES = Object.freeze([
  'contracts',
  'kernel',
  'ui',
  'components',
  'shell',
  'mock-server',
  'http-adapter',
  'server-conformance',
  'app-host',
]);
const INSTALL_SCRIPTS = Object.freeze(['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']);
const DEPENDENCY_FIELDS = Object.freeze(['dependencies', 'optionalDependencies', 'peerDependencies']);

export class UsageError extends Error {}

/** `"<hex>  <path>"` lines → Map(path → hex). Paths must stay inside the bundle. */
export function parseSums(text) {
  const sums = new Map();
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (raw.trim() === '') continue;
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(raw);
    if (!match) throw new Error(`SHA256SUMS line ${index + 1} is not "<sha256>  <path>"`);
    const path = match[2];
    if (path.startsWith('/') || path.split(/[\\/]/).includes('..')) throw new Error(`SHA256SUMS line ${index + 1} leaves the bundle: ${path}`);
    if (sums.has(path)) throw new Error(`SHA256SUMS lists ${path} twice`);
    sums.set(path, match[1]);
  }
  return sums;
}

/** Reads one file out of a .tgz without extracting it (ustar + pax path headers; pnpm/npm pack output). */
export function readTarEntry(tgz, wanted) {
  const tar = gunzipSync(tgz);
  let offset = 0;
  let paxPath;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const size = Number.parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const prefix = field(345, 155);
    const name = paxPath ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    const body = tar.subarray(offset + 512, offset + 512 + size);
    paxPath = undefined;
    if (type === 'x') {
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      if (path) paxPath = path[1];
    } else if ((type === '0' || type === '' || type === '\0') && name === wanted) {
      return body;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return undefined;
}

function isRegistrySpec(spec) {
  // A semver version or range. Anything with a protocol, a path or a git host is not from the registry.
  return typeof spec === 'string' && !/[:/]/.test(spec) && !spec.startsWith('.');
}

/** Checks 2–4 on the nine tarball manifests. Returns failure strings. */
export function checkManifests(manifests) {
  const failures = [];
  const byName = new Map(manifests.map((entry) => [entry.manifest.name, entry]));
  for (const name of BUNDLE_PACKAGES) {
    if (!byName.has(`${SCOPE}${name}`)) failures.push(`missing tarball for ${SCOPE}${name} (the nine are installed together: exact-version peers)`);
  }
  const versions = new Set(manifests.map((entry) => entry.manifest.version));
  if (versions.size > 1) failures.push(`tarballs carry different versions: ${[...versions].sort().join(', ')}`);
  const [version] = versions;
  for (const { file, manifest } of manifests) {
    const label = `${file} (${manifest.name})`;
    if (!manifest.name?.startsWith(SCOPE) || !BUNDLE_PACKAGES.includes(manifest.name.slice(SCOPE.length))) failures.push(`${label}: not one of the nine release packages`);
    if (file !== `ap-${manifest.name?.slice(SCOPE.length)}-${manifest.version}.tgz`) failures.push(`${label}: file name does not match name and version ${manifest.version}`);
    for (const script of INSTALL_SCRIPTS) {
      if (manifest.scripts?.[script] !== undefined) failures.push(`${label}: has install script "${script}"`);
    }
    for (const field of DEPENDENCY_FIELDS) {
      for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
        if (dep.startsWith(SCOPE)) {
          if (field !== 'peerDependencies') failures.push(`${label}: ${field}.${dep} — siblings must be exact-version peers`);
          else if (spec !== version) failures.push(`${label}: peerDependencies.${dep} is ${spec}, expected exactly ${version}`);
        } else if (!isRegistrySpec(spec)) {
          failures.push(`${label}: ${field}.${dep} is "${spec}" — git, URL and path dependencies are not allowed`);
        }
      }
    }
  }
  return failures;
}

function unquote(key) {
  return key.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
}

/** `name@version` (scoped names keep their leading @). */
export function splitKey(key) {
  const at = key.indexOf('@', 1);
  if (at < 0) throw new Error(`lockfile key without a version: ${key}`);
  return { name: key.slice(0, at), version: key.slice(at + 1) };
}

/**
 * The `packages:` and `snapshots:` blocks of a pnpm v9 lockfile. Only the shape this check needs is read: two-space keys and
 * the `resolution:` flow map of each package.
 */
export function parseLockfile(text) {
  const lockfileVersion = /^lockfileVersion: '?([^'\n]+)'?$/m.exec(text)?.[1];
  const packages = new Map();
  const snapshots = [];
  let section;
  let current;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      section = line.replace(/:.*$/, '');
      current = undefined;
      continue;
    }
    const key = /^ {2}(\S.*):(?: \{\})?$/.exec(line);
    if (key) {
      const name = unquote(key[1]);
      if (section === 'packages') {
        current = { key: name, resolution: undefined };
        packages.set(name, current);
      } else if (section === 'snapshots') {
        snapshots.push(name);
      }
      continue;
    }
    const resolution = /^ {4}resolution: \{(.*)\}$/.exec(line);
    if (resolution && current && section === 'packages') {
      current.resolution = Object.fromEntries(
        resolution[1].split(/,\s*/).map((pair) => {
          const colon = pair.indexOf(':');
          return [pair.slice(0, colon).trim(), unquote(pair.slice(colon + 1).trim())];
        }),
      );
    }
  }
  return { lockfileVersion, packages, snapshots };
}

/** Every non-@ap package of the lockfile at its exact version, sorted (the bundle's third-party.json). */
export function thirdPartyList(lock) {
  const list = [];
  for (const [key, entry] of lock.packages) {
    const { name, version } = splitKey(key);
    if (name.startsWith(SCOPE)) continue;
    list.push({ name, version, integrity: entry.resolution?.integrity ?? null });
  }
  return list.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
}

/** Check 2 (single copy, as resolved) and 4 (no git/URL resolution) on the lockfile, plus third-party.json equality. */
export function checkLockfile(lock, version, listed) {
  const failures = [];
  if (lock.lockfileVersion !== '9.0') failures.push(`pnpm-lock.yaml lockfileVersion is ${lock.lockfileVersion ?? 'missing'}, expected 9.0 (pnpm 11)`);
  const apPackages = new Map();
  for (const [key, entry] of lock.packages) {
    const { name, version: resolved } = splitKey(key);
    const resolution = entry.resolution ?? {};
    if (name.startsWith(SCOPE)) {
      const expected = `file:vendor/ap-${name.slice(SCOPE.length)}-${version}.tgz`;
      if (resolved !== expected || resolution.tarball !== expected) failures.push(`pnpm-lock.yaml ${key}: an @ap/* package must resolve to ${expected}`);
      if (!resolution.integrity?.startsWith('sha512-')) failures.push(`pnpm-lock.yaml ${key}: no sha512 integrity`);
      apPackages.set(name, (apPackages.get(name) ?? 0) + 1);
      continue;
    }
    if (resolution.type === 'git' || resolution.repo || resolution.commit) failures.push(`pnpm-lock.yaml ${key}: git dependency`);
    else if (resolution.tarball) failures.push(`pnpm-lock.yaml ${key}: tarball/URL dependency ${resolution.tarball}`);
    else if (resolution.type === 'directory' || resolution.directory) failures.push(`pnpm-lock.yaml ${key}: directory dependency`);
    else if (!resolution.integrity) failures.push(`pnpm-lock.yaml ${key}: no integrity (not a registry package)`);
  }
  for (const name of BUNDLE_PACKAGES) {
    if (!apPackages.has(`${SCOPE}${name}`)) failures.push(`pnpm-lock.yaml does not resolve ${SCOPE}${name}`);
  }
  // A package resolved under two different peer sets is installed twice: two @ap/kernel copies break the Host (§5).
  const copies = new Map();
  for (const key of lock.snapshots) {
    const base = key.replace(/\(.*$/, '');
    const { name } = splitKey(base);
    if (name.startsWith(SCOPE)) copies.set(name, [...(copies.get(name) ?? []), key]);
  }
  for (const [name, keys] of copies) {
    if (keys.length > 1) failures.push(`pnpm-lock.yaml installs ${name} ${keys.length} times: ${keys.join(' | ')}`);
  }
  if (listed) {
    const expected = new Set(thirdPartyList(lock).map((item) => `${item.name}@${item.version}`));
    const actual = new Set(listed.map((item) => `${item.name}@${item.version}`));
    for (const item of expected) if (!actual.has(item)) failures.push(`third-party.json is missing ${item} from pnpm-lock.yaml`);
    for (const item of actual) if (!expected.has(item)) failures.push(`third-party.json lists ${item}, which pnpm-lock.yaml does not resolve`);
  }
  return failures;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
}

/** Checks 1–4 on a bundle folder. Returns failure strings (empty = pass). */
export function verifyBundle(bundle) {
  const failures = [];
  const sumsPath = join(bundle, 'SHA256SUMS');
  if (!existsSync(sumsPath)) return [`${sumsPath} is missing`];
  let sums;
  try {
    sums = parseSums(readFileSync(sumsPath, 'utf8'));
  } catch (error) {
    return [error.message];
  }
  for (const [path, hex] of sums) {
    const file = join(bundle, path);
    if (!existsSync(file)) failures.push(`${path}: listed in SHA256SUMS but missing`);
    else if (sha256(file) !== hex) failures.push(`${path}: checksum does not match SHA256SUMS`);
  }
  for (const required of ['pnpm-lock.yaml', 'third-party.json', 'package.json']) {
    if (!sums.has(required)) failures.push(`${required}: not listed in SHA256SUMS`);
  }
  const vendor = join(bundle, 'vendor');
  const tarballs = existsSync(vendor) ? readdirSync(vendor).filter((file) => file.endsWith('.tgz')).sort() : [];
  if (tarballs.length === 0) failures.push('vendor/ has no tarballs');
  for (const file of tarballs) {
    if (!sums.has(`vendor/${file}`)) failures.push(`vendor/${file}: not listed in SHA256SUMS`);
  }
  if (failures.length > 0) return failures; // Do not read archives whose bytes are not the released ones.

  const manifests = [];
  for (const file of tarballs) {
    const body = readTarEntry(readFileSync(join(vendor, file)), 'package/package.json');
    if (!body) {
      failures.push(`vendor/${file}: no package/package.json`);
      continue;
    }
    manifests.push({ file, manifest: JSON.parse(body.toString('utf8')) });
  }
  failures.push(...checkManifests(manifests));
  const version = manifests[0]?.manifest.version;

  const project = readJsonFile(join(bundle, 'package.json'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [dep, spec] of Object.entries(project[field] ?? {})) {
      if (dep.startsWith(SCOPE)) {
        if (spec !== `file:./vendor/ap-${dep.slice(SCOPE.length)}-${version}.tgz`) failures.push(`package.json ${field}.${dep} is "${spec}", expected file:./vendor/ap-${dep.slice(SCOPE.length)}-${version}.tgz`);
      } else if (!isRegistrySpec(spec)) {
        failures.push(`package.json ${field}.${dep} is "${spec}" — git, URL and path dependencies are not allowed`);
      }
    }
  }
  const lock = parseLockfile(readFileSync(join(bundle, 'pnpm-lock.yaml'), 'utf8'));
  failures.push(...checkLockfile(lock, version, readJsonFile(join(bundle, 'third-party.json'))));
  return failures;
}

/** After install: exactly one directory per @ap/* package in the pnpm virtual store. */
export function checkInstalled(bundle) {
  const store = join(bundle, 'node_modules', '.pnpm');
  if (!existsSync(store)) return [`${store} is missing: run pnpm install first`];
  const failures = [];
  const entries = readdirSync(store);
  for (const name of BUNDLE_PACKAGES) {
    const copies = entries.filter((entry) => entry.startsWith(`@ap+${name}@`));
    if (copies.length !== 1) failures.push(`${SCOPE}${name} is installed ${copies.length} times${copies.length > 1 ? `: ${copies.join(', ')}` : ''}`);
  }
  return failures;
}

function packumentUrl(registry, name) {
  return `${registry.replace(/\/+$/, '')}/${name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)}`;
}

/**
 * Check 5: asks the mirror for each third-party package once and reports what it lacks. `missing` = name or version not
 * served; `integrity` = served with a different sha512 than the lockfile (a mirror copy that is not the released one).
 */
export async function checkMirror(registry, list, fetchImpl = fetch, auth = process.env.AP_MIRROR_AUTH) {
  const byName = new Map();
  for (const item of list) byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
  const missing = [];
  const integrity = [];
  const errors = [];
  const headers = { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8' };
  if (auth) headers.authorization = auth;
  const names = [...byName.keys()];
  const queue = [...names];
  async function worker() {
    while (queue.length > 0) {
      const name = queue.shift();
      let response;
      try {
        response = await fetchImpl(packumentUrl(registry, name), { headers });
      } catch (error) {
        errors.push(`${name}: ${error.message}`);
        continue;
      }
      if (response.status === 404) {
        for (const item of byName.get(name)) missing.push(`${item.name}@${item.version}`);
        continue;
      }
      if (!response.ok) {
        errors.push(`${name}: HTTP ${response.status}`);
        continue;
      }
      const packument = await response.json();
      for (const item of byName.get(name)) {
        const served = packument.versions?.[item.version];
        if (!served) missing.push(`${item.name}@${item.version}`);
        else if (item.integrity && served.dist?.integrity && served.dist.integrity !== item.integrity) integrity.push(`${item.name}@${item.version}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, names.length) }, worker));
  return { checked: list.length, missing: missing.sort(), integrity: integrity.sort(), errors: errors.sort() };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, bundle: dirname(fileURLToPath(import.meta.url)) };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (!['--bundle', '--registry', '--lockfile'].includes(flag)) throw new UsageError(`unknown argument ${flag}`);
    const value = rest[i + 1];
    if (!value || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    options[flag.slice(2)] = value;
    i += 1;
  }
  if (!['verify', 'mirror', 'installed', 'third-party'].includes(command)) throw new UsageError('usage: sdk-bundle-check.mjs <verify|mirror|installed|third-party> [--bundle <dir>] [--registry <url>] [--lockfile <path>]');
  if (command === 'mirror' && !options.registry) throw new UsageError('mirror needs --registry <url>');
  if (command === 'third-party' && !options.lockfile) throw new UsageError('third-party needs --lockfile <path>');
  options.bundle = resolve(options.bundle);
  return options;
}

function report(title, failures) {
  if (failures.length === 0) {
    process.stdout.write(`${title}: passed\n`);
    return 0;
  }
  process.stderr.write(`${title}: FAILED (${failures.length})\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
  return 1;
}

export async function main(argv) {
  const options = parseArgs(argv);
  if (options.command === 'third-party') {
    const lock = parseLockfile(readFileSync(options.lockfile, 'utf8'));
    process.stdout.write(`${JSON.stringify(thirdPartyList(lock), null, 2)}\n`);
    return 0;
  }
  if (options.command === 'verify') return report(`bundle verify ${options.bundle}`, verifyBundle(options.bundle));
  if (options.command === 'installed') return report(`bundle installed ${options.bundle}`, checkInstalled(options.bundle));
  const list = readJsonFile(join(options.bundle, 'third-party.json'));
  const result = await checkMirror(options.registry, list);
  const lines = [
    ...result.missing.map((item) => `missing ${item}`),
    ...result.integrity.map((item) => `integrity differs ${item}`),
    ...result.errors.map((item) => `error ${item}`),
  ];
  process.stdout.write(`bundle mirror: ${result.checked} packages checked, ${result.missing.length} missing, ${result.integrity.length} integrity differs, ${result.errors.length} errors\n`);
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`);
  if (result.errors.length > 0) return 3;
  return lines.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`sdk-bundle-check: ${error.message}\n`);
      process.exitCode = error instanceof UsageError ? 2 : 1;
    },
  );
}
