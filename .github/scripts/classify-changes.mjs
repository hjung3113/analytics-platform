// CI `changes` job (#671 B6, #1018, #1019): decides which parts of ci.yml do real work. Node builtins only (the job has no setup-node or install).
//
//   code  'false' only for a pull request with a non-empty diff whose every file is Markdown or under .agents/ and none is a Markdown file
//         that code or a test reads (CODE_READS_MD, #1884); the heavy steps then skip.
//   site  'false' only for a pull request with a non-empty diff that touches nothing the intro-site captures depend on (#608).
//   sdk   'false' only for a pull request whose changed files include nothing the SDK release tarballs and outside-consumer check read
//         (isSdkPath: the nine release package dirs, tooling/sdk/, tooling/tsconfig/, patches/, root package.json, lockfile, workspace yaml;
//         #2658); 'true' runs that check on the PR, which main push always runs.
//   server 'false' only for a PR that cannot affect the API integration suite.
//   full  'true' for a manual run with full=true (weekly cold run), and whenever this script cannot decide: the consumers then run cold
//         (turbo --force, no cache restore).
// Fail-safe: any exception or git failure prints code=true site=true full=true sdk=true server=true and exits 0 (stderr says why). If the job itself fails the
// workflow ignores its outputs and uses the full-run defaults.
//
//   node .github/scripts/classify-changes.mjs                 reads EVENT, BASE, HEAD (pull_request), BEFORE, SHA (push), FULL_INPUT (dispatch); writes $GITHUB_OUTPUT once
//   node .github/scripts/classify-changes.mjs --self-test
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releasePackages } from '../../tooling/sdk/sdk-exports.mjs';

export const DOCS_ONLY = /(\.md$|^\.agents\/)/;
// Markdown that code or a test reads as input (#1884): a PR that changes only these must still run the tests, or main is the first to fail.
// When a test or script starts reading another .md file, add its path here; the self-test checks each pattern still matches a tracked file.
export const CODE_READS_MD = [
  /^(menus\/[^/]+\/[^/]+|platform\/[^/]+)\/CHANGELOG\.md$/, // tooling/gen-menu repo-invariants: first heading = package.json version
  /^packages\/eqv\/assets\/primitives\/README\.md$/, // eqv core/renderer tests: the token table
  /^packages\/eqv\/fixtures\/[^/]+\/README\.md$/, // eqv core occurrence test
  /^docs\/architecture\/platform-api\/api\/platform-port\.md$/, // platform-port conformance integration test: the method support table
  /^docs\/architecture\/platform-api\/api\/log-knowledge\.md$/, // platform-api spec-tsv test: the log-knowledge API doc
  /^docs\/design\/features\/log-knowledge-hub\/design-v0\.6-candidate\.md$/, // platform-api spec-tsv test: the design's TSV section
  /^tooling\/sdk\/fixtures\/out-of-repo-assembly\/kit\/README\.md$/, // sdk-kit test: the README «둘째 메뉴» steps
];
const docsOnly = (file) => DOCS_ONLY.test(file) && !CODE_READS_MD.some((pattern) => pattern.test(file));
// Feature screen sources are bundled into the demo through the `@` alias; GLOSSARY.md feeds the site's banned-term check.
const SITE_DIRS = /^(menus|platform|packages|apps\/feature-screens|apps\/platform-web|site|tooling|patches)\//;
const SITE_FILES = /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|GLOSSARY\.md|apps\/platform-e2e\/package\.json|\.github\/workflows\/(ci|pages)\.yml)$/;
const ZERO_SHA = /^0+$/;
// Everything `sdk:pack` and `sdk:consumer-check` read: the release package dirs come from the release list, so a new package is covered.
const SDK_DIRS = [...new Set(['packages/sdk/', 'tooling/sdk/', 'tooling/tsconfig/', 'patches/', ...releasePackages().map((p) => `${p.dir}/`)])];
const SDK_ROOT_FILES = /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/;
export const isSdkPath = (file) => SDK_DIRS.some((dir) => file.startsWith(dir)) || SDK_ROOT_FILES.test(file);

/** 'false' only for a pull request with a known diff that changes no SDK code; anything else runs the SDK kit check. */
export function sdkChanged({ event, files }) {
  if (event !== 'pull_request' || files === null) return 'true';
  return files.some((f) => isSdkPath(f) && !docsOnly(f)) ? 'true' : 'false';
}

const SERVER_PACKAGES = ['apps/platform-api', 'ops/platform-api'];
// A workspace manifest is judged by the dependency graph below (read at head), like any other file in its package; only the root one is setup.
const SERVER_SETUP = /^(?:\.github\/|patches\/|tooling\/(?:sdk|tsconfig)\/|(?:\.nvmrc|\.npmrc|\.pnpmfile\.[cm]?js|package\.json|pnpm-(?:lock|workspace)\.yaml|turbo\.json|\.dockerignore)$)|(?:^|\/)migrations\//;
const REPO_PATH = /^[\w./@+-]+$/;

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const WORKSPACE_RANGE = /^(?:[*^~]|[\^~]?\d+\.\d+\.\d+(?:[-+][\w.+-]+)?)$/;
const WORKSPACE_ALIAS = /^((?:@[\w.-]+\/)?[\w.-]+)@(.+)$/;

export function dependencyEntries(pkg) {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.entries(pkg[field] ?? {}));
}

// Local paths are relative to the declaring package. An alias names its provider before the range.
export function workspaceTargetDirectory(directory, name, version, byName) {
  const specifier = version.slice('workspace:'.length);
  if (/^\.\.?(?:\/[\w.+@-]+)+$/.test(specifier)) return posix.join(directory, specifier);
  if (WORKSPACE_RANGE.test(specifier)) return byName.get(name);
  const alias = WORKSPACE_ALIAS.exec(specifier);
  return alias && WORKSPACE_RANGE.test(alias[2]) ? byName.get(alias[1]) : undefined;
}

export function serverChanged({ event, files }, cwd) {
  if (event !== 'pull_request' || !files?.length) return 'true';
  if (files.some((file) => !REPO_PATH.test(file) || SERVER_SETUP.test(file))) return 'true';
  const read = (file) => readFileSync(join(cwd, file), 'utf8');
  // The workspace declares plain path globs. Refuse an unfamiliar YAML form rather than reading only part of the graph.
  const block = /^packages:\n((?:[ \t]+[^\n]*\n|\n)*)/m.exec(read('pnpm-workspace.yaml'))?.[1];
  const patterns = block?.split('\n').filter((line) => line.trim() && !line.trimStart().startsWith('#'))
    .map((line) => /^  - ([\w/*-]+)$/.exec(line)?.[1]);
  if (!patterns?.length || patterns.some((pattern) => !pattern)) throw new Error('cannot read workspace package globs');
  const byName = new Map();
  const byDir = new Map();
  for (const manifest of git(['ls-files', '-z', '*/package.json'], cwd).split('\0').filter(Boolean)) {
    const dir = dirname(manifest);
    if (!patterns.some((pattern) => matchesGlob(dir, pattern))) continue;
    const pkg = JSON.parse(read(manifest));
    if (!pkg.name || byName.has(pkg.name)) throw new Error(`ambiguous workspace manifest: ${manifest}`);
    byName.set(pkg.name, dir);
    byDir.set(dir, pkg);
  }
  const serverDirs = new Set();
  const visit = (dir) => {
    if (serverDirs.has(dir)) return;
    const pkg = byDir.get(dir);
    if (!pkg) throw new Error(`missing workspace dependency: ${dir}`);
    serverDirs.add(dir);
    for (const [name, version] of dependencyEntries(pkg)) {
      if (version.startsWith('workspace:')) {
        const target = workspaceTargetDirectory(dir, name, version, byName);
        if (!byDir.has(target)) throw new Error(`unresolved workspace dependency: ${name} (${version}) in ${dir}`);
        visit(target);
      } else if (/^(?:file|link):/.test(version)) {
        throw new Error(`unresolved local dependency: ${name}`);
      }
    }
  };
  SERVER_PACKAGES.forEach(visit);
  // Relative imports, fixtures and docs read by the API tests already have to be declared for Turbo cache correctness.
  const inputs = JSON.parse(read('apps/platform-api/turbo.json')).tasks.test.inputs
    .filter((input) => input !== '$TURBO_DEFAULT$')
    .map((input) => {
      if (typeof input !== 'string' || !input.startsWith('$TURBO_ROOT$/')) throw new Error('unrecognized API test input');
      return input.slice('$TURBO_ROOT$/'.length);
    });
  const inDir = (file, dirs) => [...dirs].some((dir) => file.startsWith(`${dir}/`));
  return String(files.some((file) => {
    if (inputs.some((pattern) => matchesGlob(file, pattern))) return true;
    if (docsOnly(file)) return false;
    if (inDir(file, serverDirs)) return true;
    // Only workspace files and the isolated intro site can be ruled out by the graph. Unknown trees run integration.
    return !inDir(file, byDir.keys()) && !file.startsWith('site/');
  }));
}

const ALL = Object.freeze({ code: 'true', site: 'true', full: 'true' });

/**
 * Pure decision. `files` is the changed-file list of the event, or null when it could not be computed.
 * event: 'pull_request' | 'push' | 'workflow_dispatch' (anything else is undecidable → everything, cold).
 */
export function classify({ event, files, fullInput }) {
  if (event === 'workflow_dispatch') return { code: 'true', site: 'true', full: String(fullInput === true || fullInput === 'true') };
  if (event === 'push') return files === null ? { ...ALL } : { code: 'true', site: 'true', full: 'false' };
  if (event !== 'pull_request' || files === null) return { ...ALL };
  const list = files.filter(Boolean);
  const nonEmpty = list.length > 0;
  const code = nonEmpty && list.every(docsOnly) ? 'false' : 'true';
  const touchesSite = list.some((f) => (!f.endsWith('.md') && SITE_DIRS.test(f)) || SITE_FILES.test(f));
  const site = nonEmpty && !touchesSite ? 'false' : 'true';
  return { code, site, full: 'false' };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const lines = (text) => text.split('\n').filter(Boolean);

/** Changed files for the event, or null when the base is unknown (new branch, force-push) or git fails. */
export function changedFiles({ event, base, head, before, sha }, cwd) {
  try {
    if (event === 'pull_request') {
      if (!base || !head) return null;
      return lines(git(['diff', '--name-only', '--no-renames', `${base}...${head}`], cwd));
    }
    if (event === 'push') {
      if (!before || !sha || ZERO_SHA.test(before)) return null;
      return lines(git(['diff', '--name-only', '--no-renames', before, sha], cwd));
    }
  } catch (error) {
    process.stderr.write(`classify-changes: git diff failed: ${String(error.message).split('\n')[0]}\n`);
  }
  return null;
}

export function run(env, cwd) {
  const input = { event: env.EVENT, base: env.BASE, head: env.HEAD, before: env.BEFORE, sha: env.SHA };
  const files = input.event === 'workflow_dispatch' ? [] : changedFiles(input, cwd);
  if (files === null && input.event !== 'workflow_dispatch') process.stderr.write(`classify-changes: changed files unknown for ${input.event} → code=true site=true full=true\n`);
  if (!['pull_request', 'push', 'workflow_dispatch'].includes(input.event)) process.stderr.write(`classify-changes: unsupported event "${input.event}" → everything\n`);
  const result = classify({ event: input.event, files, fullInput: env.FULL_INPUT });
  return { result, files, sdk: sdkChanged({ event: input.event, files }) };
}

function main() {
  let result = { ...ALL };
  let files = null;
  let sdk = 'true';
  let server = 'true';
  try {
    ({ result, files, sdk } = run(process.env, process.cwd()));
    server = serverChanged({ event: process.env.EVENT, files }, process.cwd());
  } catch (error) {
    process.stderr.write(`classify-changes: ${error.stack ?? error}\n`);
    result = { ...ALL };
    sdk = 'true';
  }
  if (files) process.stdout.write(`changed files:\n${files.join('\n')}\n`);
  const text = `code=${result.code}\nsite=${result.site}\nfull=${result.full}\nsdk=${sdk}\nserver=${server}\n`;
  process.stdout.write(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
}

function selfTest() {
  let bad = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { bad += 1; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`);
  };
  const F = 'false', T = 'true';
  const out = (code, site, full) => ({ code, site, full });
  const pr = (files) => classify({ event: 'pull_request', files });
  // Pull-request rules (unchanged since #1018): the existing code/site examples.
  check('pr: .md only → code=false', pr(['README.md', 'docs/a.md']).code, F);
  check('pr: .agents only → code=false', pr(['.agents/conductor/PROFILE.md', '.agents/skills/x/run.sh']).code, F);
  check('pr: .agents + packages ts → code=true', pr(['.agents/a.md', 'packages/kernel/src/x.ts']).code, T);
  check('pr: nested apps/x/.agents/y.ts → code=true', pr(['apps/x/.agents/y.ts']).code, T);
  check('pr: empty diff → code=true site=true', pr([]), out(T, T, F));
  check('pr: md + code → code=true', pr(['a.md', 'tooling/x.mjs']).code, T);
  check('pr: docs-only → site=false', pr(['docs/a.md', '.agents/x.md']), out(F, F, F));
  check('pr: menus ts → site=true', pr(['menus/mars/hw-time/src/x.ts']).site, T);
  check('pr: menus md only → site=false', pr(['menus/mars/hw-time/README.md']).site, F);
  check('pr: platform ts → site=true', pr(['platform/home/src/x.ts']).site, T);
  check('pr: platform ts → code=true', pr(['platform/home/src/x.ts']).code, T);
  check('pr: platform md only → site=false', pr(['platform/home/README.md']).site, F);
  check('pr: root package.json → site=true', pr(['package.json']).site, T);
  check('pr: GLOSSARY.md → site=true', pr(['GLOSSARY.md']).site, T);
  check('pr: ci.yml → site=true', pr(['.github/workflows/ci.yml']).site, T);
  check('pr: css-selectors.yml → site=false', pr(['.github/workflows/css-selectors.yml']).site, F);
  check('pr: e2e package.json → site=true', pr(['apps/platform-e2e/package.json']).site, T);
  check('pr: e2e spec only → site=false code=true', pr(['apps/platform-e2e/tests/a.spec.ts']), out(T, F, F));
  check('pr: feature-screens src → site=true', pr(['packages/feature/screens/src/a.ts']).site, T);
  check('pr: platform-api src → site=false', pr(['apps/platform-api/src/a.ts']).site, F);
  // #1884: Markdown that code reads counts as code.
  check('pr: menu CHANGELOG only → code=true', pr(['menus/mars/hw-time/CHANGELOG.md']).code, T);
  check('pr: platform CHANGELOG only → code=true', pr(['platform/home/CHANGELOG.md']).code, T);
  check('pr: eqv primitives README → code=true', pr(['packages/eqv/assets/primitives/README.md']).code, T);
  check('pr: eqv fixture README → code=true', pr(['packages/eqv/fixtures/cluster-single/README.md']).code, T);
  check('pr: platform-port API doc → code=true', pr(['docs/architecture/platform-api/api/platform-port.md']).code, T);
  check('pr: log-knowledge API doc → code=true', pr(['docs/architecture/platform-api/api/log-knowledge.md']).code, T);
  check('pr: log-knowledge design v0.6 → code=true', pr(['docs/design/features/log-knowledge-hub/design-v0.6-candidate.md']).code, T);
  check('pr: kit README → code=true', pr(['tooling/sdk/fixtures/out-of-repo-assembly/kit/README.md']).code, T);
  check('pr: CHANGELOG + other docs → code=true', pr(['docs/a.md', 'menus/mars/hw-time/CHANGELOG.md']).code, T);
  check('pr: menu README (not read by code) → code=false', pr(['menus/mars/hw-time/README.md']).code, F);
  check('pr: nested menu CHANGELOG (not a package root) → code=false', pr(['menus/mars/hw-time/docs/CHANGELOG.md']).code, F);
  check('pr: packages/sdk CHANGELOG (not read by code) → code=false', pr(['packages/sdk/CHANGELOG.md']).code, F);
  // Each pattern still matches a tracked file, so a moved file cannot silently fall out of the list.
  const tracked = (() => { try { return lines(git(['ls-files', '*.md'], resolve(fileURLToPath(import.meta.url), '../../..'))); } catch { return null; } })();
  if (tracked) for (const pattern of CODE_READS_MD) check(`CODE_READS_MD ${pattern} matches a tracked file`, tracked.some((f) => pattern.test(f)), true);
  else { bad += 1; console.error('FAIL git ls-files unavailable for the CODE_READS_MD check'); }
  // #2002: every repo-root Markdown input a turbo.json declares ($TURBO_ROOT$/…*.md) is code input, so CODE_READS_MD must cover each
  // tracked file it names. The two lists live apart; this check keeps the turbo list from growing past the classifier.
  try {
    const repo = resolve(fileURLToPath(import.meta.url), '../../..');
    // Turbo globs: `*` is any run (even empty) inside one path segment, `**/` any number of directories (even none), `**` anything.
    const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0000/g, '.*')}$`);
    check('glob: * matches an empty run', globToRegExp('docs/a*.md').test('docs/a.md'), true);
    check('glob: **/ matches no directory', globToRegExp('docs/**/a.md').test('docs/a.md'), true);
    check('glob: * stays inside one segment', globToRegExp('docs/*.md').test('docs/x/a.md'), false);
    const turboFiles = lines(git(['ls-files', 'turbo.json', '*/turbo.json'], repo));
    const declared = turboFiles.flatMap((file) => {
      const json = JSON.parse(readFileSync(join(repo, file), 'utf8'));
      // An input is a glob string; a structured entry carries its globs in `globs`. Anything else names no file.
      return Object.values(json.tasks ?? {}).flatMap((task) => task.inputs ?? [])
        .flatMap((input) => (typeof input === 'string' ? [input] : Array.isArray(input?.globs) ? input.globs.filter((g) => typeof g === 'string') : []))
        .filter((input) => input.startsWith('$TURBO_ROOT$/') && input.endsWith('.md'))
        .map((input) => ({ file, glob: input.slice('$TURBO_ROOT$/'.length) }));
    });
    for (const { file, glob } of declared) {
      const matches = (tracked ?? []).filter((f) => globToRegExp(glob).test(f));
      check(`${file} input ${glob} names a tracked file`, matches.length > 0, true);
      for (const f of matches) check(`${file} input ${f} is in CODE_READS_MD`, CODE_READS_MD.some((pattern) => pattern.test(f)), true);
    }
  } catch (error) { bad += 1; console.error(`FAIL turbo.json Markdown inputs unreadable: ${error.message}`); }
  check('pr: computation failed (null) → everything cold', pr(null), out(T, T, T));
  // Push to main: code stays true, turbo decides the scope; undecidable base → cold.
  const sdk = (event, files) => sdkChanged({ event, files });
  check('sdk: pr packages/sdk ts → true', sdk('pull_request', ['packages/sdk/ui/src/a.tsx']), T);
  check('sdk: pr tooling/sdk mjs → true', sdk('pull_request', ['tooling/sdk/sdk-kit.mjs']), T);
  check('sdk: pr kit README (read by a test) → true', sdk('pull_request', ['tooling/sdk/fixtures/out-of-repo-assembly/kit/README.md']), T);
  check('sdk: pr packages/sdk CHANGELOG only → false', sdk('pull_request', ['packages/sdk/CHANGELOG.md']), F);
  check('sdk: pr menus only → false', sdk('pull_request', ['menus/mars/hw-time/src/x.ts']), F);
  for (const { dir } of releasePackages()) check(`sdk: pr ${dir} → true`, sdk('pull_request', [`${dir}/src/index.ts`]), T);
  check('sdk: pr workspace yaml → true', sdk('pull_request', ['pnpm-workspace.yaml']), T);
  check('sdk: pr patches → true', sdk('pull_request', ['patches/x.patch']), T);
  check('sdk: pr tooling/tsconfig → true', sdk('pull_request', ['tooling/tsconfig/base.json']), T);
  check('sdk: pr diff unknown → true', sdk('pull_request', null), T);
  check('sdk: push → true', sdk('push', ['docs/a.md']), T);
  const server = (event, files) => serverChanged({ event, files }, resolve(fileURLToPath(import.meta.url), '../../..'));
  for (const f of [
    'apps/platform-api/migrations/new.sql', 'ops/platform-api/scripts/ci/gate.sh',
    'packages/sdk/contracts/src/a.ts', 'packages/sdk/contract-schemas/src/a.ts',
    'packages/host/http-adapter/src/a.ts', 'packages/feature/shared/src/a.ts',
    'packages/eqv/core/src/a.ts', 'tooling/eslint/src/a.js', 'tooling/tsconfig/base.json',
    'menus/log-dev/log-analysis/src/endpoints.ts', 'packages/feature/screens/src/a.ts',
    'docs/architecture/platform-api/api/platform-port.md', 'pnpm-lock.yaml',
    '.github/workflows/ci.yml', 'unknown/a.ts',
  ]) check(`server: pr ${f} → true`, server('pull_request', [f]), T);
  for (const f of ['package.json', 'apps/platform-api/package.json', 'packages/sdk/contracts/package.json']) {
    check(`server: pr ${f} → true`, server('pull_request', [f]), T);
  }
  for (const f of ['packages/sdk/ui/src/a.tsx', 'menus/mars/hw-time/src/a.tsx', 'menus/mars/hw-time/package.json', 'menus/mars/hw-time/CHANGELOG.md', 'docs/INDEX.md']) {
    check(`server: pr ${f} → false`, server('pull_request', [f]), F);
  }
  check('server: mixed diff → true', server('pull_request', ['packages/sdk/ui/src/a.tsx', 'menus/log-dev/log-knowledge/src/endpoints.ts']), T);
  check('server: unknown diff → true', server('pull_request', null), T);
  check('server: empty diff → true', server('pull_request', []), T);
  check('server: push → true', server('push', ['packages/sdk/ui/src/a.tsx']), T);
  check('server: dispatch → true', server('workflow_dispatch', []), T);
  check('push: diff known → code=true site=true full=false', classify({ event: 'push', files: ['docs/a.md'] }), out(T, T, F));
  check('push: empty diff → code=true', classify({ event: 'push', files: [] }), out(T, T, F));
  check('push: diff unknown → full=true', classify({ event: 'push', files: null }), out(T, T, T));
  // Manual run.
  check('dispatch: full=true', classify({ event: 'workflow_dispatch', files: [], fullInput: 'true' }), out(T, T, T));
  check('dispatch: full=true (boolean)', classify({ event: 'workflow_dispatch', files: [], fullInput: true }), out(T, T, T));
  check('dispatch: full=false', classify({ event: 'workflow_dispatch', files: [], fullInput: 'false' }), out(T, T, F));
  check('dispatch: full missing', classify({ event: 'workflow_dispatch', files: [] }), out(T, T, F));
  check('unknown event → everything cold', classify({ event: 'schedule', files: [] }), out(T, T, T));
  check('undefined event → everything cold', classify({ files: [] }), out(T, T, T));

  // Real git: a temporary repository (removed at the end).
  const dir = mkdtempSync(join(tmpdir(), 'classify-changes-'));
  try {
    const g = (...args) => git(args, dir).trim();
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 't');
    g('config', 'commit.gpgsign', 'false');
    const commit = (name, files) => {
      for (const f of files) { execFileSync('mkdir', ['-p', join(dir, f, '..')]); writeFileSync(join(dir, f), `${name}\n`); }
      g('add', '-A');
      g('commit', '-q', '-m', name);
      return g('rev-parse', 'HEAD');
    };
    const base = commit('base', ['README.md', 'packages/kernel/src/a.ts']);
    const docs = commit('docs', ['docs/a.md', '.agents/x.sh']);
    const code = commit('code', ['packages/kernel/src/a.ts']);
    const env = (extra) => ({ ...extra });
    check('git pr: docs-only range', run(env({ EVENT: 'pull_request', BASE: base, HEAD: docs }), dir).result, out(F, F, F));
    check('git pr: code range', run(env({ EVENT: 'pull_request', BASE: base, HEAD: code }), dir).result, out(T, T, F));
    check('git pr: unknown base sha → everything cold', run(env({ EVENT: 'pull_request', BASE: 'deadbeef'.repeat(5), HEAD: code }), dir).result, out(T, T, T));
    check('git pr: missing BASE → everything cold', run(env({ EVENT: 'pull_request', HEAD: code }), dir).result, out(T, T, T));
    check('git push: before..sha', run(env({ EVENT: 'push', BEFORE: base, SHA: code }), dir).result, out(T, T, F));
    check('git push: before all zeros → cold', run(env({ EVENT: 'push', BEFORE: '0'.repeat(40), SHA: code }), dir).result, out(T, T, T));
    check('git push: before unknown (force-push) → cold', run(env({ EVENT: 'push', BEFORE: 'abc123'.repeat(6), SHA: code }), dir).result, out(T, T, T));
    const manifests = {
      'apps/platform-api': { name: '@ap/platform-api', optionalDependencies: { '@ap/alias': 'workspace:@ap/provider@*' } },
      'ops/platform-api': { name: '@ap/platform-api-ops' },
      'packages/alias': { name: '@ap/alias' },
      'packages/provider': { name: '@ap/provider' },
    };
    for (const [directory, manifest] of Object.entries(manifests)) {
      execFileSync('mkdir', ['-p', join(dir, directory)]);
      writeFileSync(join(dir, directory, 'package.json'), JSON.stringify(manifest));
    }
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - ops/*\n  - packages/*\n');
    writeFileSync(join(dir, 'apps/platform-api/turbo.json'), JSON.stringify({ tasks: { test: { inputs: ['$TURBO_DEFAULT$'] } } }));
    g('add', '-A');
    const impact = (file) => serverChanged({ event: 'pull_request', files: [file] }, dir);
    check('workspace alias reaches provider even when alias name exists', impact('packages/provider/src/a.ts'), T);
    check('workspace alias does not reach unrelated namesake', impact('packages/alias/src/a.ts'), F);
    const api = manifests['apps/platform-api'];
    api.optionalDependencies['@ap/alias'] = 'workspace:../../packages/provider';
    writeFileSync(join(dir, 'apps/platform-api/package.json'), JSON.stringify(api));
    check('relative workspace specifier reaches provider', impact('packages/provider/src/a.ts'), T);

    check('git dispatch: needs no git', run(env({ EVENT: 'workflow_dispatch', FULL_INPUT: 'true' }), join(dir, 'does-not-exist')).result, out(T, T, T));
    check('git pr: not a repository → everything cold', run(env({ EVENT: 'pull_request', BASE: base, HEAD: code }), tmpdir()).result, out(T, T, T));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (bad > 0) { console.error(`classify-changes self-test: ${bad} failing`); process.exit(1); }
  console.log('classify-changes self-test passed');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv[2] === '--self-test') selfTest();
  else main();
}
