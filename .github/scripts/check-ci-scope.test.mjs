import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { workspaceDependencyErrors } from './check-platform-turbo-scope.mjs';
import { classify } from './classify-changes.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/ci.yml');

test('SDK self-test scope uses the push range and runs on unknown diffs or manual events', () => {
  const job = workflow.split('  sdk-upgrade-gate-selftest:\n')[1].split('\n  # The required check')[0];
  const scope = job.split('        run: |\n')[1].split('\n      - ')[0].replace(/^          /gm, '');
  assert.match(job, /BEFORE: \$\{\{ github.event.before \}\}/);
  assert.match(job, /SHA: \$\{\{ github.sha \}\}/);
  // The test runs the script under bash, so the step must too (a container job defaults to sh).
  assert.match(job, /- name: Scope\n        id: scope\n(?:        #[^\n]*\n)?        shell: bash\n/);
  const dir = mkdtempSync(join(tmpdir(), 'w2030-scope-'));
  try {
    // A fake diff process tests shell exit handling without repository mutations.
    writeFileSync(join(dir, 'git'), '#!/bin/sh\nif [ "$1" = config ]; then exit 0; fi\nprintf "%s\\n" "$DIFF_FILES"\nexit "$DIFF_STATUS"\n', { mode: 0o755 });
    for (const [event, files, status, before, expected] of [
      ['push', 'docs/README.md', '0', 'abc', 'false'],
      ['push', 'tooling/sdk/sdk-upgrade-gate.mjs', '0', 'abc', 'true'],
      ['push', 'apps/platform-e2e/tests-kit/kit.spec.ts', '0', 'abc', 'true'],
      ['push', 'apps/platform-e2e/playwright.kit.config.ts', '0', 'abc', 'true'],
      ['push', 'docs/README.md', '1', 'abc', 'true'],
      ['push', '', '0', '0000000000000000000000000000000000000000', 'true'],
      ['push', '', '0', '', 'true'],
      ['workflow_dispatch', 'docs/README.md', '0', 'abc', 'true'],
    ]) {
      const output = join(dir, 'output');
      writeFileSync(output, '');
      const run = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', scope], {
        encoding: 'utf8', cwd: dir,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output, GITHUB_WORKSPACE: dir, GITHUB_EVENT_NAME: event, BEFORE: before, SHA: 'def', DIFF_FILES: files, DIFF_STATUS: status },
      });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(readFileSync(output, 'utf8').trim(), `run=${expected}`, JSON.stringify({ event, files, status, before }));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CSS selector builds skip only a successful docs-only classification', () => {
  const css = read('.github/workflows/css-selectors.yml');
  assert.match(css, /timeout-minutes: 20/);
  assert.match(css, /id: classify[\s\S]*?continue-on-error: true[\s\S]*?run: node \.github\/scripts\/classify-changes.mjs/);
  for (const step of css.split('\n      - ').slice(1)) {
    if (/pnpm\/action-setup|actions\/setup-node|name: (Build |Collect |Check out base|Compare )/.test(step)) {
      assert.match(step, /if: \$\{\{ steps.classify.outputs.code != 'false' \}\}/);
    }
  }
  assert.equal(classify({ event: 'pull_request', files: ['docs/a.md', '.agents/x.sh'] }).code, 'false');
  assert.equal(classify({ event: 'pull_request', files: null }).code, 'true');
  assert.equal(classify({ event: 'pull_request', files: ['packages/eqv/assets/primitives/README.md'] }).code, 'true');
});

test('feature tasks hash the shared operations tsconfig', () => {
  for (const dir of ['packages/feature-shared', 'packages/feature-ui', 'apps/feature-screens']) {
    const config = JSON.parse(read(`${dir}/turbo.json`));
    for (const task of ['typecheck', 'build', 'test']) {
      assert.ok(config.tasks[task]?.inputs.includes('$TURBO_ROOT$/ops/platform-api/tsconfig.base.json'), `${dir}#${task}`);
      assert.ok(config.tasks[task].inputs.includes('$TURBO_DEFAULT$'), `${dir}#${task} keeps package inputs`);
    }
  }
});

test('workspace dependencies must enter task closures or have their source folder hashed', () => {
  const packages = [
    { name: '@ap/consumer', directory: 'platform/consumer', dependencies: { '@ap/source': 'workspace:*' } },
    { name: '@ap/source', directory: 'packages/source' },
  ];
  const leaf = { taskId: '@ap/consumer#test', package: '@ap/consumer', directory: 'platform/consumer', dependencies: ['@ap/consumer#transit'] };
  const transit = { taskId: '@ap/consumer#transit', package: '@ap/consumer', directory: 'platform/consumer', dependencies: [] };
  const plan = { tasks: [leaf, transit] };
  assert.match(workspaceDependencyErrors('test', plan, packages).join('\n'), /@ap\/consumer#test.*@ap\/source/);
  assert.deepEqual(workspaceDependencyErrors('test', { tasks: [leaf, { ...transit, dependencies: ['@ap/source#transit'] }, { taskId: '@ap/source#transit', package: '@ap/source' }] }, packages), []);
  // Effective inputs (Turbo dry-run `inputs`, relative to the task directory); tracked files come from the stub.
  const tracked = () => ['packages/source/src/a.ts', 'packages/source/src/b.ts', 'packages/source/package.json', 'packages/source/README.md'];
  const hashing = (files) => ({ tasks: [leaf, { ...transit, inputs: Object.fromEntries(files.map(f => [`../../packages/source/${f}`, 'h'])) }] });
  assert.deepEqual(workspaceDependencyErrors('test', hashing(['src/a.ts', 'src/b.ts', 'package.json']), packages, tracked), []);
  // An exclusion left one source file out of the hash: not covered.
  assert.ok(workspaceDependencyErrors('test', hashing(['src/a.ts', 'package.json']), packages, tracked).length > 0);
  // The manifest alone is not coverage.
  assert.ok(workspaceDependencyErrors('test', hashing(['package.json']), packages, tracked).length > 0);
});
