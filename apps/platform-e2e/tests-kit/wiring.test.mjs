import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { select } from '../../../.github/scripts/select-e2e.mjs';

const workflow = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('Start kit browser check runs once inside the Playwright shard job', () => {
  const job = workflow.split('  platform-contracts-e2e-shard:\n')[1].split('\n  platform-contracts-e2e:')[0];
  assert.match(job, /image: mcr.microsoft.com\/playwright:/);
  const step = job.split('- name: Start kit browser check\n')[1]?.split('\n      - ')[0];
  assert.ok(step, 'named browser step exists in the E2E job');
  assert.match(step, /matrix.shard == 1/);
  assert.match(step, /needs.changes.outputs.e2e_kit != 'false'/);
  assert.match(step, /pnpm sdk:pack --out/);
  assert.match(step, /AP_SDK_KIT_DIR_FILE=.*pnpm sdk:consumer-check/);
  assert.match(step, /export AP_SDK_KIT_DIR=/);
  assert.match(step, /playwright test --config playwright.kit.config.ts/);
  const staticJob = workflow.split('  platform-static:\n')[1].split('\n  platform-test:')[0];
  assert.doesNotMatch(staticJob, /playwright.kit.config.ts/);
  assert.match(workflow, /e2e_kit: \$\{\{ steps.e2e.outputs.e2e_kit \}\}/);
});

test('kit, app-host, mock-server and browser driver changes select the kit gate', () => {
  for (const file of [
    'tooling/sdk/fixtures/out-of-repo-assembly/kit/menus.ts',
    'packages/app-host/src/start.tsx',
    'packages/adapters/mock-server/src/index.ts',
  ]) {
    // The kit gate follows the conservative full-selection verdict, including every dependency above.
    assert.equal(select({ event: 'pull_request', files: [file], exists: () => true }).e2e, 'all', file);
  }
  for (const file of ['apps/platform-e2e/tests-kit/kit.spec.ts', 'apps/platform-e2e/playwright.kit.config.ts']) {
    // Kit-only files need no mock run on a PR, where the kit gate never runs (#1931, #2048 CI--12); a push selects all, so the kit gate runs.
    assert.equal(select({ event: 'pull_request', files: [file], exists: () => true }).e2e, 'none', file);
    assert.equal(select({ event: 'push', files: [file], exists: () => true }).e2e, 'all', file);
  }
  const run = spawnSync(process.execPath, ['.github/scripts/select-e2e.mjs'], {
    cwd: new URL('../../..', import.meta.url), encoding: 'utf8',
    env: { ...process.env, EVENT: 'workflow_dispatch', GITHUB_OUTPUT: '' },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^e2e_kit=true$/m);
});
