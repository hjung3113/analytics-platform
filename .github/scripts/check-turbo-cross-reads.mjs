// #2029: a cached `test` task that reads files outside its package must hash them, or a PR that changes only those
// files reuses a stale pass (rule: docs/agents/operations.md «A task reading files outside its package declares
// `$TURBO_ROOT$` inputs»). This scans every workspace package's sources for paths that leave the package and asserts
// each one is hashed by that package's `test` task, using the file list Turbo itself reports (`turbo run test --dry=json`).
//
// Only test files are scanned (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`, `test-support`, `test-setup`,
// `vitest.config`): other scripts of a package run outside its `test` task.
// A referenced FILE is covered when the task, or a task it depends on (transitively; Turbo folds those hashes in),
// hashes it. A referenced DIRECTORY is covered when one of those tasks hashes at least one file under it outside the
// package itself: this catches a missing input, not a glob that is too narrow.
//
// What it can SEE (static text only): string literals starting with `../` (resolved from the file), `new URL('<lit>',
// import.meta.url)`, consecutive literal arguments of `join(`/`resolve(` (with `'..'` segments resolved from the file),
// and — only in a file that anchors the repo root (a `../` chain or `new URL` reaching it, `REPO_ROOT`/`repoRoot`, or
// `process.cwd()`) — literals that start with a top-level workspace folder (`'apps/x'`), and bare folder names
// (`'menus'`) inside an array made only of such folder paths.
// Comments are ignored. A test file whose repo paths are names, not reads (an ESLint `lintText` target, say), says so
// once with `// turbo-cross-reads: names-only — <reason>`; the reason is required.
// What it CANNOT see: paths built at run time from variables, paths in config files, files a spawned script reads.
// Workspace package imports (`@ap/*`) are out of scope: the dependency graph hashes them.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const TOP = ['apps', 'packages', 'menus', 'platform', 'tooling', 'ops', 'docs', 'site', '.github', '.planning'];
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
const TEST_FILE = /\.(test|spec)\.|(^|\/)(__tests__|tests?)\/|test-support|test-setup|vitest\.config/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'test-results', 'playwright-report']);
const LIT = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

const MARKER = /turbo-cross-reads: names-only — \S/;

/** The text with comments blanked out (string and template contents kept). */
export function stripComments(text) {
  let out = '';
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === quote) quote = '';
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      out += ' ';
    } else {
      if (c === "'" || c === '"' || c === '`') quote = c;
      out += c;
    }
  }
  return out;
}

const norm = (p) => p.split(path.sep).join('/').replace(/\/$/, '');
const inside = (p, dir) => p === dir || p.startsWith(`${dir}/`);

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (SOURCE.test(entry.name)) out.push(full);
  }
  return out;
}

/** Repo-relative paths a source text points at. `file` is repo-relative; `pkgDir` is the package folder. */
export function referencedPaths(source, file) {
  if (MARKER.test(source)) return [];
  const text = stripComments(source);
  const dir = path.posix.dirname(file);
  const found = new Set();
  const fromFile = (rel) => path.posix.normalize(path.posix.join(dir, rel)).replace(/\/$/, '') || '.';
  const add = (p) => { const q = p?.replace(/\/$/, ''); if (q && !q.startsWith('..') && q !== '.') found.add(q); };
  const anchored = /\bREPO_ROOT\b|\brepoRoot\b|process\.cwd\(\)/.test(text)
    || [...text.matchAll(LIT)].some((m) => /^\.\.(\/\.\.)*\/?$/.test(m[2]) && fromFile(m[2]) === '.');
  for (const m of text.matchAll(LIT)) {
    const lit = m[1] === '`' ? m[2].split('${')[0] : m[2];
    if (lit.startsWith('../')) add(fromFile(lit));
    else if (anchored && TOP.some((top) => lit.startsWith(`${top}/`)) && !/[\s*{}:]/.test(lit)) add(lit);
  }
  // A bare folder name (`'menus'`) is a path only in an array made of folder paths: `['platform', 'apps/platform-web']`.
  if (anchored) {
    for (const m of text.matchAll(/\[((?:\s*(['"])[^'"\n]*\2\s*,?)+)\s*\]/g)) {
      const items = [...m[1].matchAll(/(['"])([^'"\n]*)\1/g)].map((x) => x[2]);
      const folders = items.every((it) => TOP.some((top) => it === top || it.startsWith(`${top}/`)));
      if (folders && (items.length > 1 || items[0].includes('/'))) items.forEach(add); // `['platform']` alone is a value
    }
  }
  // join(x, '..', 'apps', 'y') / resolve(__dirname, '..', '..'): the run of literal arguments forms one path.
  for (const m of text.matchAll(/\b(?:join|resolve)\(([^()]*)\)/g)) {
    const args = m[1].split(',').map((a) => a.trim());
    const lits = [];
    for (const a of args.slice(1)) {
      const l = /^(['"])([^'"]*)\1$/.exec(a);
      if (!l) break;
      lits.push(l[2]);
    }
    if (!lits.length) continue;
    const joined = lits.join('/');
    if (/^(__dirname|dirname\(|path\.dirname\()/.test(args[0] ?? '')) add(fromFile(joined));
    else if (TOP.includes(lits[0]) && anchored) add(path.posix.normalize(joined));
  }
  return [...found];
}

/** Errors for one package's test task. `hashed` holds the repo-relative files the task and its dependency tasks hash. */
export function coverageErrors({ pkgDir, refs, hashed, isDir }) {
  const errors = [];
  for (const { file, target } of refs) {
    if (inside(target, pkgDir) || target.includes('node_modules')) continue;
    const ok = isDir(target)
      ? [...hashed].some((h) => inside(h, target) && !inside(h, pkgDir))
      : hashed.has(target);
    if (!ok) errors.push(`${file}: reads ${target}${isDir(target) ? '/' : ''} but the test task does not hash it — add a $TURBO_ROOT$ input`);
  }
  return errors;
}

function main() {
  const out = execFileSync('pnpm', ['exec', 'turbo', 'run', 'test', '--dry=json'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const plan = JSON.parse(out.slice(out.indexOf('{')));
  const byId = new Map(plan.tasks.map((t) => [t.taskId, t]));
  const errors = [];
  let checked = 0;
  for (const task of plan.tasks.filter((t) => t.task === 'test' && t.command && t.command !== '<NONEXISTENT>')) {
    const pkgDir = norm(task.directory);
    const hashed = new Set();
    const seen = new Set();
    const collect = (t) => {
      if (!t || seen.has(t.taskId)) return;
      seen.add(t.taskId);
      const dir = norm(t.directory);
      for (const f of Object.keys(t.inputs ?? {})) hashed.add(path.posix.normalize(path.posix.join(dir, f)));
      for (const id of t.dependencies ?? []) collect(byId.get(id));
    };
    collect(task);
    const refs = [];
    for (const full of sources(path.join(repoRoot, pkgDir))) {
      const file = norm(path.relative(repoRoot, full));
      if (!TEST_FILE.test(file.slice(pkgDir.length + 1))) continue;
      for (const target of referencedPaths(readFileSync(full, 'utf8'), file)) {
        if (existsSync(path.join(repoRoot, target))) refs.push({ file, target });
      }
    }
    const isDir = (p) => statSync(path.join(repoRoot, p)).isDirectory();
    errors.push(...coverageErrors({ pkgDir, refs, hashed, isDir }));
    checked++;
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log(`turbo cross-reads: ${checked} test tasks hash every file they read outside their package`);
}

function selfTest() {
  let count = 0;
  const has = (text, file, want) => { assert.ok(referencedPaths(text, file).includes(want), `${file}: expected ${want} in ${referencedPaths(text, file)}`); count++; };
  const hasNot = (text, file, bad) => { assert.ok(!referencedPaths(text, file).includes(bad), `${file}: did not expect ${bad}`); count++; };
  // The three shapes of #2029 and the one of #2002.
  has("const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');\nconst R = [join(REPO_ROOT, 'apps', 'platform-api', 'src')];",
    'packages/feature-shared/src/errors/__tests__/x.test.ts', 'apps/platform-api/src');
  has("const root = fileURLToPath(new URL('../../../..', import.meta.url));\nconst SCAN_ROOTS = ['platform', 'menus'];",
    'packages/adapters/feature-bridge/src/x.test.ts', 'menus');
  has("const root = new URL('../../../', import.meta.url);\nsource('apps/platform-api/src/modules/a.ts');",
    'menus/log-dev/log-rules/x.test.mjs', 'apps/platform-api/src/modules/a.ts');
  has("readFileSync(new URL('../../../menus/log-dev/log-models/src/mock/issues.ts', import.meta.url))",
    'packages/feature-shared/src/x.test.ts', 'menus/log-dev/log-models/src/mock/issues.ts');
  has("const p = path.resolve(process.cwd(), 'docs/contract/kernel.md');", 'apps/platform-web/src/x.test.ts', 'docs/contract/kernel.md');
  // Not a path: a bare folder word in a file that never anchors the repo root, and a permission string.
  hasNot("const area = 'menus';", 'packages/sdk/shell/src/x.ts', 'menus');
  hasNot("const REPO = join(__dirname, '../../..'); db('platform'); x(['platform', 'pgboss']); expect(names).toEqual(['platform']);", 'apps/a/src/x.test.ts', 'platform');
  hasNot("const REPO = join(__dirname, '../../..');\n// reads `platform` and 'apps/x/y.ts'\n/* 'menus' */", 'apps/a/src/x.test.ts', 'apps/x/y.ts');
  hasNot("// turbo-cross-reads: names-only — lint targets\nconst REPO_ROOT = 1; lint('apps/x/y.ts');", 'tooling/eslint/src/x.test.ts', 'apps/x/y.ts');
  has("// turbo-cross-reads: names-only —\nconst REPO_ROOT = 1; read('apps/x/y.ts');", 'tooling/eslint/src/x.test.ts', 'apps/x/y.ts');
  has("const u = 'http://h/x'; const REPO_ROOT = 1; read('apps/x/y.ts');", 'tooling/eslint/src/x.test.ts', 'apps/x/y.ts');
  hasNot("const REPO_ROOT = '/'; const p = 'platform:view';", 'packages/sdk/shell/src/x.ts', 'platform:view');
  const isDir = (p) => !/\.[a-z]+$/.test(p);
  const base = { pkgDir: 'packages/feature-shared', isDir };
  const err = (refs, hashed) => coverageErrors({ ...base, refs, hashed: new Set(hashed) });
  const ref = (target) => [{ file: 'packages/feature-shared/src/x.test.ts', target }];
  assert.equal(err(ref('apps/platform-api/src'), ['packages/feature-shared/src/a.ts']).length, 1); count++;
  assert.equal(err(ref('apps/platform-api/src'), ['apps/platform-api/src/a.ts']).length, 0); count++;
  // A directory that holds the package itself is not covered by the package's own files.
  assert.equal(err(ref('packages'), ['packages/feature-shared/src/a.ts']).length, 1); count++;
  assert.equal(err(ref('menus/a/b/c.ts'), []).length, 1); count++;
  assert.equal(err(ref('menus/a/b/c.ts'), ['menus/a/b/c.ts']).length, 0); count++;
  assert.equal(err(ref('packages/feature-shared/src/b.ts'), []).length, 0); count++;
  console.log(`turbo cross-reads self-test: ${count} cases passed`);
}

if (process.argv.includes('--self-test')) selfTest();
else main();
