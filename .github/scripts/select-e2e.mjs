// CI `changes` job (#1019): picks the E2E specs for PR feedback; main pushes and manual runs always run the full suite. Node builtins only (no setup-node, no install).
//
//   e2e            'all'            every spec (non-PR events and PR fail-safes below)
//                  'none'           nothing to run (the shard job is skipped, the required check passes from this value)
//                  'base-path-only' only the base-path run (its spec changed); the main-config run is skipped
//                  '<a.spec.ts> …'  space-separated spec file names under apps/platform-e2e/tests/ (all exist; never base-path.spec.ts)
//   e2e_base_path  'true' | 'false'  whether the base-path run (`pnpm e2e:base-path`) runs
//   e2e_shards     JSON matrix: 8 for 'all', 3 for bounded code selections, 1 for spec-only selections
//   e2e_total      number of shards in the matrix
//   e2e_kit        'true' on push and dispatch; kit browser checks are release-only
//   e2e_parallel / integration_parallel  PR runner-budget limits; full matrix sizes outside PRs
//
// PR rules:
//   Markdown or .agents/ (the same set classify-changes.mjs treats as docs)  → needs nothing
//   apps/platform-e2e/tests/<x>.spec.ts that still exists                      → that spec (base-path.spec.ts → base-path run)
//   apps/platform-e2e/tests-real/** or playwright.real*.config.ts → needs no mock run
//   apps/platform-e2e/tests-kit/** or playwright.kit.config.ts → needs no mock run
//   a deleted or renamed spec                                                  → needs nothing
//   apps/platform-api/** or ops/platform-api/** except ops/platform-api/tsconfig.base.json → needs nothing (the mock E2E web server is `@ap/platform-web` on the mock adapter and its workspace
//     dependency graph reaches neither tree; the one exception is tsconfig.base.json, which packages/feature/shared and packages/feature/screens extend)
//   tooling/storybook/**                                                       → needs nothing
//   a spec file name outside [A-Za-z0-9_.-] (it would become a regex filter)    → all
//   all other paths → contract smoke specs + the base-path check, plus any existing mapped or directly changed specs
// Uncomputable/empty diffs, missing contract smoke specs, full=true and non-PR events use the full matrix.
// Fail-safe: an exception prints e2e=all e2e_base_path=true e2e_shards=[1,2,3,4,5,6,7,8] e2e_total=8 and exits 0 (stderr says why). If the job itself fails the outputs are
// empty and ci.yml treats empty as "run everything".
//
//   node .github/scripts/select-e2e.mjs      reads EVENT, BASE, HEAD (pull_request), SERVER (classifier output), FULL_INPUT; writes $GITHUB_OUTPUT once
//   node .github/scripts/select-e2e.mjs --self-test
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, DOCS_ONLY } from './classify-changes.mjs';

const SPEC_DIR = 'apps/platform-e2e/tests';
const SPEC = /^apps\/platform-e2e\/tests\/([^/]+\.spec\.ts)$/;
const BASE_PATH_SPEC = 'base-path.spec.ts';
// Any file the main config could collect (testDir `./tests`, recursive, Playwright's default testMatch). Only a top-level `.spec.ts` can be named
// as a filter, so any other test file there runs the full suite rather than the smoke set.
const E2E_TEST_FILE = /^apps\/platform-e2e\/tests\/.*\.(?:spec|test)\.[cm]?[jt]sx?$/;
// Server trees the mock E2E never builds (verified against the @ap/platform-web dependency graph, #1680). The one file in them that the graph reads still runs smoke.
const SERVER_ONLY = /^(?:apps|ops)\/platform-api\//;
const SERVER_ONLY_EXCEPTION = 'ops/platform-api/tsconfig.base.json';
// Following workspace manifest dependencies transitively from @ap/platform-web and @ap/platform-e2e reaches no @ap/storybook package.
const STORYBOOK_ONLY = 'tooling/storybook/';
// Playwright reads positional arguments as regexes. Allow plain names starting with a letter or digit.
// `.` can over-match; other regex metacharacters or line breaks could miss a file or inject output lines.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.spec\.ts$/;

// Platform contract maintainers review this list when adding a contract area or when timing changes.
const CONTRACT_SMOKE = [
  'contract-chart.spec.ts',
  'contract-column-groups.spec.ts',
  'contract-components.spec.ts',
  'contract-context-links.spec.ts',
  'contract-navigation-guard.spec.ts',
  'contract-no-reload.spec.ts',
  'contract-shell.spec.ts',
];
// Existing mapped specs add menu coverage to the PR smoke set. Update the mapping when moving routes or adding coverage.
const MENU_SPECS = {
  'menus/log-dev/log-analysis/': ['features-log-explorer.spec.ts'],
  'menus/log-dev/log-knowledge/': ['features-log-knowledge-import.spec.ts', 'features-log-knowledge-search.spec.ts', 'features-log-knowledge-spec.spec.ts', 'hub-model-topview.spec.ts'],
  'menus/log-dev/log-models/': ['log-datasets.spec.ts', 'log-lifecycle.spec.ts'],
  'menus/mars/configuration/': ['configuration.spec.ts', 'hw-time.spec.ts'],
  'menus/mars/hw-time/': ['configuration.spec.ts', 'contract-saved-view.spec.ts', 'hw-time.spec.ts'],
  'menus/tools/topview-studio/': ['eqv-onboarding.spec.ts', 'eqv-studio.spec.ts', 'eqv.spec.ts', 'hub-model-topview.spec.ts'],
  'menus/tools/topview/': ['eqv.spec.ts', 'hub-model-topview.spec.ts'],
  'platform/access/': ['api-tokens.spec.ts', 'contract-features.spec.ts', 'features-admin.spec.ts', 'features-navigation.spec.ts'],
  'platform/admin/': ['contract-features.spec.ts', 'features-admin.spec.ts', 'features-navigation.spec.ts'],
  'platform/findings/': ['features-findings.spec.ts', 'features-integration.spec.ts'],
  'platform/integration/': ['features-integration.spec.ts'],
  'platform/surveys/': ['features-surveys.spec.ts'],
  'platform/tasks/': ['features-navigation.spec.ts', 'features-tasks.spec.ts'],
};

const FULL_SHARDS = 8;
const BOUNDED_SHARDS = 3;
const INTEGRATION_SHARDS = 3;
const matrix = (total) => ({
  e2e_shards: JSON.stringify(Array.from({ length: total }, (_, i) => i + 1)),
  e2e_total: String(total),
});
const ALL = Object.freeze({ e2e: 'all', e2e_base_path: 'true', ...matrix(FULL_SHARDS) });
const NONE = Object.freeze({ e2e: 'none', e2e_base_path: 'false', ...matrix(1) });

// The PR workspace runs up to six jobs alongside these matrices, within a budget of ten (two PRs fill the account's 20 runners).
// One suite alone uses three shards at once; a PR that needs both suites gives each two.
export const SHARED_PARALLEL = 2;
export function prMatrixLimits({ server, e2e }) {
  const shared = server !== 'false' && e2e !== 'none';
  return { e2e_parallel: shared ? SHARED_PARALLEL : BOUNDED_SHARDS, integration_parallel: shared ? SHARED_PARALLEL : INTEGRATION_SHARDS };
}

// Exceptional PR inputs still select all shards, with the PR parallelism cap applied.
export const maxPrE2eShards = FULL_SHARDS;

/**
 * Pure decision. `files` is the changed-file list, or null when it could not be computed. `exists(name)` tells whether a spec file is still in the checkout.
 * event: 'pull_request' | 'push' | anything else (→ all).
 */
export function select({ event, files, fullInput, exists }) {
  if (fullInput === true || fullInput === 'true') return { ...ALL };
  if (event !== 'pull_request' || files === null) return { ...ALL };
  const list = files.filter(Boolean);
  if (list.length === 0) return { ...ALL };
  const specs = new Set();
  let basePath = false;
  let bounded = false;
  for (const f of list) {
    if (/^apps\/platform-e2e\/(?:tests-real\/|playwright\.real[^/]*\.config\.ts$)/.test(f)) continue;
    if (/^apps\/platform-e2e\/(?:tests-kit\/|playwright\.kit\.config\.ts$)/.test(f)) continue;
    if (DOCS_ONLY.test(f)) continue;
    if (SERVER_ONLY.test(f) && f !== SERVER_ONLY_EXCEPTION) continue;
    if (f.startsWith(STORYBOOK_ONLY)) continue;
    // Git quotes paths with special characters. Recognize quoted spec paths for the fail-safe only.
    const quoted = f.startsWith('"') && f.endsWith('"');
    const spec = SPEC.exec(quoted ? f.slice(1, -1) : f);
    if (spec) {
      const [, name] = spec;
      if (quoted || !SAFE_NAME.test(name)) return { ...ALL };
      if (!exists(name)) continue;
      if (name === BASE_PATH_SPEC) basePath = true;
      else specs.add(name);
      continue;
    }
    if (E2E_TEST_FILE.test(quoted ? f.slice(1, -1) : f)) return { ...ALL };
    bounded = true;
    const menu = Object.keys(MENU_SPECS).find((dir) => f.startsWith(dir));
    if (menu) {
      for (const name of MENU_SPECS[menu]) {
        if (exists(name)) specs.add(name);
      }
    }
  }
  if (bounded) {
    if (CONTRACT_SMOKE.some((name) => !exists(name))) return { ...ALL };
    for (const name of CONTRACT_SMOKE) specs.add(name);
    basePath = true;
  }
  const names = [...specs].sort();
  const base = String(basePath);
  if (names.length > 0) return { e2e: names.join(' '), e2e_base_path: base, ...matrix(bounded ? BOUNDED_SHARDS : 1) };
  if (basePath) return { e2e: 'base-path-only', e2e_base_path: 'true', e2e_shards: '[1]', e2e_total: '1' };
  return { ...NONE };
}

export function run(env, cwd) {
  const event = env.EVENT;
  const exists = (name) => existsSync(join(cwd, SPEC_DIR, name));
  let files = null;
  if (event === 'pull_request') files = changedFiles({ event, base: env.BASE, head: env.HEAD }, cwd);
  const result = select({ event, files, fullInput: env.FULL_INPUT, exists });
  if (result.e2e === 'all' && env.FULL_INPUT !== 'true') {
    let why = 'unsafe spec filename or missing contract smoke spec';
    if (event !== 'pull_request') why = `event "${event}"`;
    else if (files === null) why = 'changed files unknown (base missing or git failed)';
    else if (files.length === 0) why = 'empty diff';
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
  const isPr = process.env.EVENT === 'pull_request';
  const limits = isPr
    ? prMatrixLimits({ server: process.env.SERVER, e2e: result.e2e })
    : { e2e_parallel: FULL_SHARDS, integration_parallel: INTEGRATION_SHARDS };
  const text = Object.entries({ ...result, ...limits, e2e_kit: String(!isPr) }).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
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
  const ALLV = out('all', 'true', '[1,2,3,4,5,6,7,8]', '8');
  const NONEV = out('none', 'false', '[1]', '1');
  const sub = (list, base = 'false') => out(list, base, '[1]', '1');
  const pr = (files, extra = {}) => select({ event: 'pull_request', files, exists, ...extra });
  const push = (files) => select({ event: 'push', files, exists });

  const contracts = ['contract-chart.spec.ts', 'contract-column-groups.spec.ts', 'contract-components.spec.ts',
    'contract-context-links.spec.ts', 'contract-navigation-guard.spec.ts', 'contract-no-reload.spec.ts', 'contract-shell.spec.ts'];
  const hwTimeSpecs = ['configuration.spec.ts', 'contract-saved-view.spec.ts', 'hw-time.spec.ts'];
  const inventory = [...contracts, ...present, ...hwTimeSpecs];
  const sdkPr = (files) => pr(files, { exists: (name) => inventory.includes(name) });
  const bounded = (names) => out([...names].sort().join(' '), 'true', '[1,2,3]', '3');
  check('sdk: PR runs contracts and base path', sdkPr(['packages/sdk/ui/src/a.tsx']), bounded(contracts));
  check('sdk: app shell + menu + existing spec rule are unioned', sdkPr([
    'apps/platform-web/src/a.tsx', 'menus/mars/hw-time/src/a.ts', `${T}eqv.spec.ts`,
  ]), bounded([...contracts, ...hwTimeSpecs, 'eqv.spec.ts']));
  check('menu: audited menu-only PR uses bounded coverage', sdkPr(['menus/mars/hw-time/src/a.ts']),
    bounded([...contracts, ...hwTimeSpecs]));
  check('menu: unknown menu runs smoke', sdkPr(['menus/mars/unknown/src/a.ts']), bounded(contracts));
  check('menu: missing mapped spec leaves smoke and available mapped specs', pr(['menus/mars/hw-time/src/a.ts'], {
    exists: (name) => inventory.includes(name) && name !== 'configuration.spec.ts',
  }), bounded([...contracts, 'contract-saved-view.spec.ts', 'hw-time.spec.ts']));
  check('build manifest runs smoke', sdkPr(['pnpm-workspace.yaml']), bounded(contracts));
  check('missing smoke spec falls back to all', pr(['packages/sdk/ui/src/a.tsx']), ALLV);
  check('sdk: push still runs all with an available spec inventory', select({
    event: 'push', files: ['packages/sdk/ui/src/a.tsx'], exists,
  }), ALLV);
  const repo = resolve(fileURLToPath(import.meta.url), '../../..');
  const hwTimeCoverage = readFileSync(join(repo, SPEC_DIR, 'hw-time.spec.ts'), 'utf8');
  for (const title of [
    'HW Time 단계 패널: 맞춤으로 시작하고 첫 줄 패널 안이 넘치지 않는다',
    '1440×900 HW Time 원시 표의 행 영역이 패널 아래 끝에서 120px 안까지 닿는다',
  ]) {
    check(`menu: HW Time PR includes ${title}`,
      sdkPr(['menus/mars/hw-time/src/a.ts']).e2e.split(' ').includes('hw-time.spec.ts')
        && hwTimeCoverage.includes(`test('${title}'`), true);
  }

  for (const name of CONTRACT_SMOKE) {
    check(`smoke inventory: ${name} exists and is safe`, SAFE_NAME.test(name) && existsSync(join(repo, SPEC_DIR, name)), true);
  }
  for (const name of new Set(Object.values(MENU_SPECS).flat())) {
    check(`menu mapping: ${name} is safe`, SAFE_NAME.test(name), true);
  }

  // Docs only → none (same set as classify-changes: code=false).
  check('docs: md only', pr(['README.md', 'docs/a.md']), NONEV);
  check('docs: .agents only', pr(['.agents/conductor/PROFILE.md', '.agents/skills/x/run.sh']), NONEV);
  check('docs: md under packages', pr(['packages/sdk/kernel/README.md']), NONEV);
  check('docs: nested apps/x/.agents/y.ts runs smoke', sdkPr(['apps/x/.agents/y.ts']), bounded(contracts));
  // Spec-only changes.
  check('spec: one existing spec', pr([`${T}hw-time.spec.ts`]), sub('hw-time.spec.ts'));
  check('spec: several, sorted, deduplicated', pr([`${T}hw-time.spec.ts`, `${T}contract-board.spec.ts`, `${T}hw-time.spec.ts`]), sub('contract-board.spec.ts hw-time.spec.ts'));
  check('spec: spec + docs', pr([`${T}eqv.spec.ts`, 'apps/platform-e2e/AGENTS.md']), sub('eqv.spec.ts'));
  check('spec: deleted spec only → none', pr([`${T}gone.spec.ts`]), NONEV);
  check('spec: deleted spec + docs → none', pr([`${T}gone.spec.ts`, 'README.md']), NONEV);
  check('spec: deleted spec + existing spec → the existing one', pr([`${T}gone.spec.ts`, `${T}eqv.spec.ts`]), sub('eqv.spec.ts'));
  check('spec: deleted spec + code → smoke', sdkPr([`${T}gone.spec.ts`, 'packages/sdk/kernel/src/a.ts']), bounded(contracts));
  check('spec: base-path spec only → base-path-only', pr([`${T}base-path.spec.ts`]), out('base-path-only', 'true', '[1]', '1'));
  check('spec: base-path spec + another spec', pr([`${T}base-path.spec.ts`, `${T}hw-time.spec.ts`]), sub('hw-time.spec.ts', 'true'));
  check('spec: base-path spec + docs', pr([`${T}base-path.spec.ts`, 'a.md']), out('base-path-only', 'true', '[1]', '1'));
  check('spec: nested spec → all (only top-level specs can be named)', sdkPr([`${T}sub/x.spec.ts`]), ALLV);
  check('spec: nested unsafe spec name → all', sdkPr([`${T}edge/case+one.spec.ts`]), ALLV);
  check('spec: top-level .test.ts the config collects → all', sdkPr([`${T}case.test.ts`]), ALLV);
  check('spec: helper module in tests/ still uses smoke', sdkPr([`${T}support.ts`]), bounded(contracts));
  check('spec: non-spec file in tests/ uses smoke', sdkPr([`${T}fixture.json`]), bounded(contracts));
  // Names become regular-expression filters in Playwright: anything outside [A-Za-z0-9_.-] → all.
  check('name: new plain spec', pr([`${T}my-new.spec.ts`], { exists: () => true }), sub('my-new.spec.ts'));
  const unsafe = (name) => pr([`${T}${name}`], { exists: () => true });
  check('name: parentheses → all', select({ event: 'pull_request', files: [`${T}contract-(shell).spec.ts`], exists: () => true }), ALLV);
  check('name: space → all', unsafe('my spec.spec.ts'), ALLV);
  check('name: plus → all', unsafe('a+b.spec.ts'), ALLV);
  check('name: equals → all', unsafe('a=b.spec.ts'), ALLV);
  check('name: newline → all', unsafe('a\nb.spec.ts'), ALLV);
  check('name: newline + output injection → all', unsafe('a\ne2e=none.spec.ts'), ALLV);
  check('name: non-ASCII → all', unsafe('한글.spec.ts'), ALLV);
  check('name: leading dot → all', unsafe('.hidden.spec.ts'), ALLV);
  check('name: quoted git output → all', pr([`"${T}a\\nb.spec.ts"`]), ALLV);
  check('name: one safe + one unsafe → all', select({ event: 'pull_request', files: [`${T}hw-time.spec.ts`, `${T}a+b.spec.ts`], exists: () => true }), ALLV);
  // Shared E2E files and other paths default to smoke.
  for (const f of ['contract-helpers.ts', 'support.ts']) check(`e2e: ${f} → smoke`, sdkPr([`${T}${f}`]), bounded(contracts));
  for (const f of ['playwright.config.ts', 'playwright.base-path.config.ts', 'playwright.merge.config.ts', 'contract-reporter.ts', 'package.json', 'tsconfig.json']) check(`e2e: ${f} → smoke`, sdkPr([`apps/platform-e2e/${f}`]), bounded(contracts));
  check('e2e: helper + spec → smoke and the spec', sdkPr([`${T}support.ts`, `${T}hw-time.spec.ts`]), bounded([...contracts, 'hw-time.spec.ts']));
  for (const f of [
    'packages/sdk/kernel/src/a.ts', 'packages/host/mock-server/src/a.ts', 'packages/host/app-host/src/a.ts', 'packages/host/http-adapter/src/a.ts', 'packages/host/server-conformance/src/a.ts', 'packages/feature/bridge/src/a.ts', 'packages/feature/screens/src/ui/a.ts', 'apps/platform-web/src/a.ts', 'apps/platform-web/vite.config.ts',
    'packages/feature/screens/src/a.ts', 'platform/home/src/a.ts', 'platform/dashboard/package.json', 'tooling/x.mjs', 'patches/x.patch', 'ops/other/x.sh', 'apps/platform-api-x/src/a.ts', 'ops/platform-api-x/a.sh',
    'package.json', 'pnpm-lock.yaml', 'turbo.json', '.nvmrc', '.github/workflows/ci.yml', '.github/scripts/select-e2e.mjs',
    'packages/sdk/shell/src/style.css', 'site/index.html', 'docs/diagram.png', 'unknown/file.bin', '.gitignore',
  ]) check(`smoke: ${f}`, sdkPr([f]), bounded(contracts));
  check('smoke: docs + code', sdkPr(['a.md', 'tooling/x.mjs']), bounded(contracts));
  check('smoke: unmapped platform path + spec', sdkPr(['platform/home/src/a.ts', `${T}hw-time.spec.ts`]), bounded([...contracts, 'hw-time.spec.ts']));
  check('storybook: PR stories → none', sdkPr(['tooling/storybook/stories/Button.stories.tsx']), NONEV);
  check('storybook: PR stories + spec → the spec', sdkPr(['tooling/storybook/stories/Button.stories.tsx', `${T}hw-time.spec.ts`]), sub('hw-time.spec.ts'));
  check('storybook: push stories → all', push(['tooling/storybook/stories/Button.stories.tsx']), ALLV);
  // Server-only trees (#1680) → none, except the tsconfig base the graph extends.
  for (const f of ['apps/platform-api/src/a.ts', 'apps/platform-api/package.json', 'apps/platform-api/migrations/0001.sql', 'ops/platform-api/scripts/ci/gate.sh', 'ops/platform-api/package.json', 'ops/platform-api/biome.json']) check(`none: ${f}`, pr([f]), NONEV);
  check('server: server + docs → none', pr(['apps/platform-api/src/a.ts', 'README.md']), NONEV);
  check('server: server + spec → the spec', pr(['apps/platform-api/src/a.ts', `${T}hw-time.spec.ts`]), sub('hw-time.spec.ts'));
  check('server: server + code outside → smoke', sdkPr(['apps/platform-api/src/a.ts', 'packages/sdk/kernel/src/a.ts']), bounded(contracts));
  check('server: tsconfig.base.json alone → smoke', sdkPr(['ops/platform-api/tsconfig.base.json']), bounded(contracts));
  check('server: tsconfig.base.json + server file → smoke', sdkPr(['apps/platform-api/src/a.ts', 'ops/platform-api/tsconfig.base.json']), bounded(contracts));
  check('server: nested tsconfig.base.json is not the exception → none', pr(['ops/platform-api/sub/tsconfig.base.json']), NONEV);
  check('server: push runs all', push(['apps/platform-api/src/a.ts']), ALLV);
  // Real-server files never feed mock E2E; kit files run only on push, not PR (#2048).
  for (const f of ['tests-real/console.admin.real.spec.ts', 'tests-real/support.ts', 'playwright.real.config.ts', 'playwright.real-down.config.ts']) {
    check(`real: PR ${f} → none`, pr([`apps/platform-e2e/${f}`]), NONEV);
    check(`real: push ${f} → all`, push([`apps/platform-e2e/${f}`]), ALLV);
  }
  for (const f of ['tests-kit/kit.spec.ts', 'tests-kit/workflow.test.mjs', 'tests-kit/README.md', 'playwright.kit.config.ts']) {
    check(`kit: PR ${f} → none`, pr([`apps/platform-e2e/${f}`]), NONEV);
    check(`kit: push ${f} → all`, push([`apps/platform-e2e/${f}`]), ALLV);
  }
  check('server + real spec → none', pr(['apps/platform-api/src/a.ts', 'apps/platform-e2e/tests-real/console.admin.real.spec.ts']), NONEV);
  check('real + mock spec → mock spec', pr(['apps/platform-e2e/tests-real/support.ts', `${T}hw-time.spec.ts`]), sub('hw-time.spec.ts'));
  check('kit + product code → smoke', sdkPr(['apps/platform-e2e/tests-kit/kit.spec.ts', 'packages/sdk/kernel/src/a.ts']), bounded(contracts));
  // Events and undecidable inputs → all.
  check('all: computation failed (null)', pr(null), ALLV);
  check('all: empty diff', pr([]), ALLV);
  check('all: full=true wins over docs-only', pr(['README.md'], { fullInput: 'true' }), ALLV);
  check('all: full=true (boolean)', pr(['README.md'], { fullInput: true }), ALLV);
  check('docs: full=false does not widen', pr(['README.md'], { fullInput: 'false' }), NONEV);
  check('all: dispatch', select({ event: 'workflow_dispatch', files: [], exists, fullInput: 'false' }), ALLV);
  check('all: unknown event', select({ event: 'schedule', files: ['README.md'], exists }), ALLV);
  check('all: undefined event', select({ files: ['README.md'], exists }), ALLV);
  // Main push always runs everything, regardless of what changed.
  check('push: docs → all', push(['docs/a.md']), ALLV);
  check('push: spec → all', push([`${T}hw-time.spec.ts`]), ALLV);
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
    const base = commit('base', ['README.md', 'packages/sdk/kernel/src/a.ts', `${T}hw-time.spec.ts`, `${T}eqv.spec.ts`, ...contracts.map((name) => `${T}${name}`)]);
    const docs = commit('docs', ['docs/a.md']);
    const spec = commit('spec', [`${T}hw-time.spec.ts`]);
    const code = commit('code', ['packages/sdk/kernel/src/a.ts']);
    const del = commit('delete', [], [`${T}eqv.spec.ts`]);
    const r = (env) => run(env, dir).result;
    check('git pr: docs range → none', r({ EVENT: 'pull_request', BASE: base, HEAD: docs }), NONEV);
    check('git pr: spec range', r({ EVENT: 'pull_request', BASE: docs, HEAD: spec }), sub('hw-time.spec.ts'));
    check('git pr: code range → smoke', r({ EVENT: 'pull_request', BASE: spec, HEAD: code }), bounded(contracts));
    check('git pr: deleted spec range → none', r({ EVENT: 'pull_request', BASE: code, HEAD: del }), NONEV);
    check('git pr: unknown base → all', r({ EVENT: 'pull_request', BASE: 'deadbeef'.repeat(5), HEAD: code }), ALLV);
    check('git pr: missing BASE → all', r({ EVENT: 'pull_request', HEAD: code }), ALLV);
    check('git push: baseline..sha spans the red commit (docs + spec + code) → all', r({ EVENT: 'push', BASELINE: base, SHA: code }), ALLV);
    check('git push: docs + spec → all', r({ EVENT: 'push', BASELINE: base, SHA: spec }), ALLV);
    check('git push: empty baseline → all', r({ EVENT: 'push', BASELINE: '', SHA: code }), ALLV);
    check('git push: missing baseline → all', r({ EVENT: 'push', SHA: code }), ALLV);
    check('git push: unreachable baseline → all', r({ EVENT: 'push', BASELINE: 'abc123'.repeat(6), SHA: code }), ALLV);
    check('git push: baseline == sha (empty diff) → all', r({ EVENT: 'push', BASELINE: code, SHA: code }), ALLV);
    const server = commit('server', ['apps/platform-api/src/a.ts', 'ops/platform-api/scripts/x.sh']);
    check('git pr: server-only range → none', r({ EVENT: 'pull_request', BASE: del, HEAD: server }), NONEV);
    const tsbase = commit('tsbase', ['ops/platform-api/tsconfig.base.json']);
    check('git pr: tsconfig.base.json range → smoke', r({ EVENT: 'pull_request', BASE: server, HEAD: tsbase }), bounded(contracts));
    const odd = commit('odd', [`${T}a\nb.spec.ts`]);
    check('git pr: newline spec name (git quotes it) → all', r({ EVENT: 'pull_request', BASE: tsbase, HEAD: odd }), ALLV);
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
