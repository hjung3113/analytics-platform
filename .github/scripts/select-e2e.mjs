// CI `changes` job (#1019): picks the E2E specs a change can affect, so a PR or a push to main runs only those. Node builtins only (no setup-node, no install).
//
//   e2e            'all'            every spec (the default for anything not provably limited)
//                  'none'           nothing to run (docs-only change; the shard job is skipped, the required check passes from this value)
//                  'base-path-only' only the base-path run (its spec or config changed); the main-config run is skipped
//                  '<a.spec.ts> …'  space-separated spec file names under apps/platform-e2e/tests/ (all exist; never base-path.spec.ts)
//   e2e_base_path  'true' | 'false'  whether the base-path run (`pnpm e2e:base-path`) runs
//   e2e_shards     JSON matrix: [1,2,3,4] for 'all', [1] for anything else (the shard job is skipped for 'none')
//   e2e_total      '4' for 'all', '1' otherwise
//
// Rules (safe side, a file is judged alone and the strictest verdict wins):
//   Markdown or .agents/ (the same set classify-changes.mjs treats as docs)  → needs nothing
//   apps/platform-e2e/tests/<x>.spec.ts that still exists                      → that spec (base-path.spec.ts → base-path run)
//   a deleted or renamed spec                                                  → needs nothing
//   everything else → all: packages/**, apps/**, menus/** (the contract-*.spec.ts files read many menus, so there is no menu→spec table), tooling/**, patches/**,
//   ops/**, root manifests, .github/**, the e2e helpers/configs (contract-helpers.ts, support.ts, playwright*.config.ts, contract-reporter.ts, package.json), style.css,
//   and any path no rule knows.
// Events: a pull request diffs BASE...HEAD; a push diffs BASELINE (the last main SHA whose CI run was green, last-green-main-sha.mjs) against SHA, so a spec that failed
// stays in scope until a green run covers it; a manual run, FULL_INPUT=true, an empty diff, a missing baseline, an unknown event or any exception → all.
// Fail-safe: an exception prints e2e=all e2e_base_path=true e2e_shards=[1,2,3,4] e2e_total=4 and exits 0 (stderr says why). If the job itself fails the outputs are
// empty and ci.yml treats empty as "run everything".
//
//   node .github/scripts/select-e2e.mjs      reads EVENT, BASE, HEAD (pull_request), BASELINE, SHA (push), FULL_INPUT; writes $GITHUB_OUTPUT once
//   node .github/scripts/select-e2e.mjs --self-test
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, DOCS_ONLY } from './classify-changes.mjs';

const SPEC_DIR = 'apps/platform-e2e/tests';
const SPEC = /^apps\/platform-e2e\/tests\/([^/]+\.spec\.ts)$/;
const BASE_PATH_SPEC = 'base-path.spec.ts';

const ALL = Object.freeze({ e2e: 'all', e2e_base_path: 'true', e2e_shards: '[1,2,3,4]', e2e_total: '4' });
const NONE = Object.freeze({ e2e: 'none', e2e_base_path: 'false', e2e_shards: '[1]', e2e_total: '1' });

/**
 * Pure decision. `files` is the changed-file list, or null when it could not be computed. `exists(name)` tells whether a spec file is still in the checkout.
 * event: 'pull_request' | 'push' | anything else (→ all).
 */
export function select({ event, files, fullInput, exists }) {
  if (fullInput === true || fullInput === 'true') return { ...ALL };
  if ((event !== 'pull_request' && event !== 'push') || files === null) return { ...ALL };
  const list = files.filter(Boolean);
  if (list.length === 0) return { ...ALL };
  const specs = new Set();
  let basePath = false;
  for (const f of list) {
    if (DOCS_ONLY.test(f)) continue;
    const m = SPEC.exec(f);
    if (!m) return { ...ALL };
    if (!exists(m[1])) continue;
    if (m[1] === BASE_PATH_SPEC) basePath = true;
    else specs.add(m[1]);
  }
  const names = [...specs].sort();
  const base = String(basePath);
  if (names.length > 0) return { e2e: names.join(' '), e2e_base_path: base, e2e_shards: '[1]', e2e_total: '1' };
  if (basePath) return { e2e: 'base-path-only', e2e_base_path: 'true', e2e_shards: '[1]', e2e_total: '1' };
  return { ...NONE };
}

export function run(env, cwd) {
  const event = env.EVENT;
  const exists = (name) => existsSync(join(cwd, SPEC_DIR, name));
  let files = null;
  if (event === 'pull_request') files = changedFiles({ event, base: env.BASE, head: env.HEAD }, cwd);
  else if (event === 'push') files = changedFiles({ event, before: env.BASELINE, sha: env.SHA }, cwd);
  const result = select({ event, files, fullInput: env.FULL_INPUT, exists });
  if (result.e2e === 'all' && env.FULL_INPUT !== 'true') {
    const why = !['pull_request', 'push'].includes(event) ? `event "${event}"` : files === null ? `changed files unknown (baseline/base missing or git failed)` : files.length === 0 ? 'empty diff' : 'an affected path outside the spec files';
    process.stderr.write(`select-e2e: all because of ${why}\n`);
  }
  return { result, files };
}

function main() {
  let result = { ...ALL };
  let files = null;
  try {
    ({ result, files } = run(process.env, process.cwd()));
  } catch (error) {
    process.stderr.write(`select-e2e: ${error.stack ?? error}\n`);
    result = { ...ALL };
  }
  if (files) process.stdout.write(`changed files:\n${files.join('\n')}\n`);
  const text = Object.entries(result).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  process.stdout.write(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
}

function selfTest() {
  let bad = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { bad += 1; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`);
  };
  const present = new Set(['base-path.spec.ts', 'contract-board.spec.ts', 'contract-shell.spec.ts', 'hw-time.spec.ts', 'eqv.spec.ts']);
  const exists = (n) => present.has(n);
  const T = 'apps/platform-e2e/tests/';
  const out = (e2e, base, shards, total) => ({ e2e, e2e_base_path: base, e2e_shards: shards, e2e_total: total });
  const ALLV = out('all', 'true', '[1,2,3,4]', '4');
  const NONEV = out('none', 'false', '[1]', '1');
  const sub = (list, base = 'false') => out(list, base, '[1]', '1');
  const pr = (files, extra = {}) => select({ event: 'pull_request', files, exists, ...extra });
  const push = (files) => select({ event: 'push', files, exists });

  // Docs only → none (same set as classify-changes: code=false).
  check('docs: md only', pr(['README.md', 'docs/a.md']), NONEV);
  check('docs: .agents only', pr(['.agents/conductor/PROFILE.md', '.agents/skills/x/run.sh']), NONEV);
  check('docs: md under packages', pr(['packages/sdk/kernel/README.md']), NONEV);
  check('docs: nested apps/x/.agents/y.ts is not docs → all', pr(['apps/x/.agents/y.ts']), ALLV);
  // Spec-only changes.
  check('spec: one existing spec', pr([`${T}hw-time.spec.ts`]), sub('hw-time.spec.ts'));
  check('spec: several, sorted, deduplicated', pr([`${T}hw-time.spec.ts`, `${T}contract-board.spec.ts`, `${T}hw-time.spec.ts`]), sub('contract-board.spec.ts hw-time.spec.ts'));
  check('spec: spec + docs', pr([`${T}eqv.spec.ts`, 'apps/platform-e2e/AGENTS.md']), sub('eqv.spec.ts'));
  check('spec: deleted spec only → none', pr([`${T}gone.spec.ts`]), NONEV);
  check('spec: deleted spec + docs → none', pr([`${T}gone.spec.ts`, 'README.md']), NONEV);
  check('spec: deleted spec + existing spec → the existing one', pr([`${T}gone.spec.ts`, `${T}eqv.spec.ts`]), sub('eqv.spec.ts'));
  check('spec: deleted spec + code → all', pr([`${T}gone.spec.ts`, 'packages/sdk/kernel/src/a.ts']), ALLV);
  check('spec: base-path spec only → base-path-only', pr([`${T}base-path.spec.ts`]), out('base-path-only', 'true', '[1]', '1'));
  check('spec: base-path spec + another spec', pr([`${T}base-path.spec.ts`, `${T}hw-time.spec.ts`]), sub('hw-time.spec.ts', 'true'));
  check('spec: base-path spec + docs', pr([`${T}base-path.spec.ts`, 'a.md']), out('base-path-only', 'true', '[1]', '1'));
  check('spec: nested spec dir is not a spec rule → all', pr([`${T}sub/x.spec.ts`]), ALLV);
  check('spec: non-spec file in tests/ → all', pr([`${T}fixture.json`]), ALLV);
  // The e2e app's shared files → all.
  for (const f of ['contract-helpers.ts', 'support.ts']) check(`e2e: ${f} → all`, pr([`${T}${f}`]), ALLV);
  for (const f of ['playwright.config.ts', 'playwright.base-path.config.ts', 'playwright.merge.config.ts', 'contract-reporter.ts', 'package.json', 'tsconfig.json']) check(`e2e: ${f} → all`, pr([`apps/platform-e2e/${f}`]), ALLV);
  check('e2e: helper + spec → all', pr([`${T}support.ts`, `${T}hw-time.spec.ts`]), ALLV);
  // Everything that is not provably limited → all.
  for (const f of [
    'packages/sdk/kernel/src/a.ts', 'packages/adapters/mock-server/src/a.ts', 'packages/fo-ui/src/a.ts', 'apps/platform-web/src/a.ts', 'apps/platform-web/vite.config.ts',
    'apps/fo-frontend/src/a.ts', 'apps/fo-backend/src/a.ts', 'menus/mars/hw-time/src/a.ts', 'tooling/x.mjs', 'patches/x.patch', 'ops/feedbackops/x.sh',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', '.nvmrc', '.github/workflows/ci.yml', '.github/scripts/select-e2e.mjs',
    'packages/sdk/shell/src/style.css', 'site/index.html', 'docs/diagram.png', 'unknown/file.bin', '.gitignore',
  ]) check(`all: ${f}`, pr([f]), ALLV);
  check('all: code + spec', pr(['packages/sdk/kernel/src/a.ts', `${T}hw-time.spec.ts`]), ALLV);
  check('all: docs + code', pr(['a.md', 'tooling/x.mjs']), ALLV);
  check('all: menus change never maps to a spec', pr(['menus/mars/hw-time/src/a.ts', `${T}hw-time.spec.ts`]), ALLV);
  // Events and undecidable inputs → all.
  check('all: computation failed (null)', pr(null), ALLV);
  check('all: empty diff', pr([]), ALLV);
  check('all: full=true wins over docs-only', pr(['README.md'], { fullInput: 'true' }), ALLV);
  check('all: full=true (boolean)', pr(['README.md'], { fullInput: true }), ALLV);
  check('docs: full=false does not widen', pr(['README.md'], { fullInput: 'false' }), NONEV);
  check('all: dispatch', select({ event: 'workflow_dispatch', files: [], exists, fullInput: 'false' }), ALLV);
  check('all: unknown event', select({ event: 'schedule', files: ['README.md'], exists }), ALLV);
  check('all: undefined event', select({ files: ['README.md'], exists }), ALLV);
  // Push to main uses the same file rules on the baseline diff.
  check('push: docs → none', push(['docs/a.md']), NONEV);
  check('push: spec → spec', push([`${T}hw-time.spec.ts`]), sub('hw-time.spec.ts'));
  check('push: code → all', push(['packages/sdk/kernel/src/a.ts']), ALLV);
  check('push: baseline unknown (null) → all', push(null), ALLV);
  check('push: empty diff → all', push([]), ALLV);

  // Real git: a temporary repository (removed at the end). `run` reads the environment and the checkout.
  const dir = mkdtempSync(join(tmpdir(), 'select-e2e-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    git('config', 'commit.gpgsign', 'false');
    const commit = (name, files, remove = []) => {
      for (const f of files) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), `${name}\n`); }
      for (const f of remove) rmSync(join(dir, f));
      git('add', '-A');
      git('commit', '-q', '-m', name);
      return git('rev-parse', 'HEAD');
    };
    const base = commit('base', ['README.md', 'packages/sdk/kernel/src/a.ts', `${T}hw-time.spec.ts`, `${T}eqv.spec.ts`]);
    const docs = commit('docs', ['docs/a.md']);
    const spec = commit('spec', [`${T}hw-time.spec.ts`]);
    const code = commit('code', ['packages/sdk/kernel/src/a.ts']);
    const del = commit('delete', [], [`${T}eqv.spec.ts`]);
    const r = (env) => run(env, dir).result;
    check('git pr: docs range → none', r({ EVENT: 'pull_request', BASE: base, HEAD: docs }), NONEV);
    check('git pr: spec range', r({ EVENT: 'pull_request', BASE: docs, HEAD: spec }), sub('hw-time.spec.ts'));
    check('git pr: code range → all', r({ EVENT: 'pull_request', BASE: spec, HEAD: code }), ALLV);
    check('git pr: deleted spec range → none', r({ EVENT: 'pull_request', BASE: code, HEAD: del }), NONEV);
    check('git pr: unknown base → all', r({ EVENT: 'pull_request', BASE: 'deadbeef'.repeat(5), HEAD: code }), ALLV);
    check('git pr: missing BASE → all', r({ EVENT: 'pull_request', HEAD: code }), ALLV);
    check('git push: baseline..sha spans the red commit (docs + spec + code) → all', r({ EVENT: 'push', BASELINE: base, SHA: code }), ALLV);
    check('git push: baseline..sha docs + spec → the spec', r({ EVENT: 'push', BASELINE: base, SHA: spec }), sub('hw-time.spec.ts'));
    check('git push: empty baseline → all', r({ EVENT: 'push', BASELINE: '', SHA: code }), ALLV);
    check('git push: missing baseline → all', r({ EVENT: 'push', SHA: code }), ALLV);
    check('git push: unreachable baseline → all', r({ EVENT: 'push', BASELINE: 'abc123'.repeat(6), SHA: code }), ALLV);
    check('git push: baseline == sha (empty diff) → all', r({ EVENT: 'push', BASELINE: code, SHA: code }), ALLV);
    check('git dispatch: needs no git', run({ EVENT: 'workflow_dispatch', FULL_INPUT: 'true' }, join(dir, 'does-not-exist')).result, ALLV);
    check('git pr: not a repository → all', run({ EVENT: 'pull_request', BASE: base, HEAD: spec }, tmpdir()).result, ALLV);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (bad > 0) { console.error(`select-e2e self-test: ${bad} failing`); process.exit(1); }
  console.log('select-e2e self-test passed');
}

if (process.argv[2] === '--self-test') selfTest();
else if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
