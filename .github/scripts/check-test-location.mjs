#!/usr/bin/env node
// New tests go in the `__tests__/` folder of the feature folder they test (ADR-0090, #3183). Fails when the change adds a test file outside
// one; a moved file is not an addition, so tests are moved when their files are touched, never all at once (#2206).
// Scope: product code under packages/, menus/, platform/ and apps/. Exceptions, each with its reason:
// - apps/platform-e2e: Playwright specs keep the runner's own layout.
// - packages/eqv/<package>/test/: the EQV packages came with a `test/` folder per package, which already keeps tests out of the source folders.
// PR CI runs it against the PR base (a main push would only turn main red after the merge). Node builtins only.
//
// Usage: node .github/scripts/check-test-location.mjs --base <commit> | --self-test
// Exit status: 0 = clean, 1 = at least one misplaced test, 2 = usage or git error.
import { spawnSync } from 'node:child_process';

const RULE = 'docs/adr/0090-repo-structure-by-branch.md';
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SCOPE = ['packages/', 'menus/', 'platform/', 'apps/'];
const EXEMPT = [/^apps\/platform-e2e\//, /^packages\/eqv\/[^/]+\/test\//];

/** The added test files that sit outside a `__tests__/` folder, each with the place it belongs. */
export function misplaced(added) {
  return added
    .filter(path => TEST_FILE.test(path) && SCOPE.some(root => path.startsWith(root)) && !EXEMPT.some(rule => rule.test(path)))
    .filter(path => !path.split('/').includes('__tests__'))
    .map(path => {
      const slash = path.lastIndexOf('/');
      return { path, target: `${path.slice(0, slash)}/__tests__/${path.slice(slash + 1)}` };
    });
}

/** Paths `git diff --name-status -M` lists as added (`A`); renames (`R…`) and copies keep their history and are not additions. */
export function addedPaths(nameStatus) {
  return nameStatus.split('\n').map(line => line.split('\t')).filter(([status, path]) => status === 'A' && path).map(([, path]) => path);
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr.trim()}`);
  return result.stdout;
}

function selfTest() {
  const cases = [
    [['menus/mars/hw-time/src/pages/analysis/heldPanels.test.ts'], ['menus/mars/hw-time/src/pages/analysis/__tests__/heldPanels.test.ts']],
    [['packages/sdk/kernel/src/saved-view/__tests__/panel-graph.test.ts'], []],
    [['platform/voc/src/a.test.tsx', 'apps/platform-web/src/b.test.mjs'], ['platform/voc/src/__tests__/a.test.tsx', 'apps/platform-web/src/__tests__/b.test.mjs']],
    [['apps/platform-e2e/tests/x.test.ts', 'packages/eqv/core/test/a.test.ts', 'packages/eqv/core/src/a.test.ts'], ['packages/eqv/core/src/__tests__/a.test.ts']],
    [['tooling/gen-menu/src/a.test.ts', '.github/scripts/a.test.mjs', 'packages/sdk/ui/src/a.ts', 'menus/x/src/testing.ts'], []],
  ];
  for (const [input, expected] of cases) {
    const actual = misplaced(input).map(item => item.target);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`misplaced(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
  const listed = addedPaths('A\tmenus/a.test.ts\nR100\tmenus/old.test.ts\tmenus/__tests__/old.test.ts\nM\tmenus/b.test.ts\nC90\tx\ty\n');
  if (JSON.stringify(listed) !== JSON.stringify(['menus/a.test.ts'])) throw new Error(`addedPaths gave ${JSON.stringify(listed)}`);
  console.log('check-test-location self-test passed');
}

function main(argv) {
  if (argv[0] === '--self-test') { selfTest(); return 0; }
  const base = argv[0] === '--base' ? argv[1] : undefined;
  if (!base) { console.error('usage: check-test-location.mjs --base <commit> | --self-test'); return 2; }
  let found;
  try {
    const from = git(['merge-base', base, 'HEAD']).trim();
    found = misplaced(addedPaths(git(['diff', '--name-status', '-M', from, 'HEAD'])));
  } catch (error) {
    console.error(String(error.message ?? error));
    return 2;
  }
  if (!found.length) { console.log('check-test-location: no new test outside __tests__/'); return 0; }
  console.error(`New tests go in the __tests__/ folder of the feature folder they test (${RULE}). Move:`);
  for (const { path, target } of found) console.error(`  ${path} -> ${target}`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
