// Exercise the actual workflow verdict shell and build ordering without Git, services or builds.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflow = readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8');
const aggregate = workflow.split('  platform-workspace:\n')[1].split('\n  # #666:')[0];
const verdict = aggregate.split('        run: |\n')[1].trim().replace(/^          /gm, '');

test('required workspace verdict fails every failed, cancelled or accidental skipped feature gate', () => {
  assert.match(aggregate, /needs: \[changes, platform-static, platform-test, feature-integration\]/);
  let cases = 0;
  for (const CODE of ['true', '', 'false']) {
    for (const STATIC of ['success', 'failure', 'cancelled', 'skipped', '']) {
      for (const TEST of ['success', 'failure', 'cancelled', 'skipped', '']) {
        for (const INTEGRATION of ['success', 'failure', 'cancelled', 'skipped', '']) {
          const run = spawnSync('bash', ['-e', '-c', verdict], {
            cwd: root, encoding: 'utf8', env: { ...process.env, CODE, STATIC, TEST, INTEGRATION },
          });
          const succeeds = STATIC === 'success' && TEST === 'success' && (INTEGRATION === 'success' || (CODE === 'false' && INTEGRATION === 'skipped'));
          assert.equal(run.status === 0, succeeds, JSON.stringify({ CODE, STATIC, TEST, INTEGRATION }));
          cases++;
        }
      }
    }
  }
  assert.equal(cases, 375);
});

test('mock-dist readers precede real production build; folded feature coverage stays required', () => {
  const staticJob = workflow.split('  platform-static:\n')[1].split('  platform-test:\n')[0];
  const mock = staticJob.indexOf('- run: pnpm build');
  const lazy = staticJob.indexOf('pnpm check:lazy-chunks');
  const sdk = staticJob.indexOf('pnpm sdk:api');
  const negative = staticJob.indexOf('--force-mock-build');
  const real = staticJob.indexOf('run: pnpm --filter @ap/platform-web build:real-prod');
  assert.ok(mock >= 0 && mock < lazy && lazy < sdk && sdk < negative && negative < real);
  assert.match(staticJob, /fetch-depth: 0/);
  assert.match(staticJob, /FEATURE_LINT_BASE:.*pull_request.base.sha.*github.event.before/);
  assert.match(staticJob, /gate.sh static-extra/);
  assert.match(workflow, /run: pnpm test/);
  assert.match(workflow, /if:.*needs.changes.outputs.code != 'false'/);
  assert.match(workflow, /image: mirror.gcr.io\/pgvector\/pgvector:pg16/);
  assert.match(workflow, /run: bash ops\/platform-api\/scripts\/ci\/gate.sh integration/);
  assert.equal(existsSync(new URL('../workflows/feedbackops.yml', import.meta.url)), false);
});
