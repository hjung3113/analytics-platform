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
  // #1678: the real build is followed by the same start-up check and by the edge image build with `nginx -t`.
  const realLazy = staticJob.indexOf('check-lazy-chunks.mjs apps/platform-web/dist');
  const edge = staticJob.indexOf('platform-release-web:ci nginx -t');
  assert.ok(real < realLazy && realLazy < edge);
  assert.match(staticJob, /docker build -f apps\/platform-web\/Dockerfile -t platform-release-web:ci \./);
  assert.match(staticJob, /docker run --rm --memory 256m platform-release-web:ci nginx -t/);
  for (const name of ['Real build keeps heavy engines out of the start-up closure', 'Edge image builds and nginx -t passes']) {
    const step = staticJob.slice(staticJob.indexOf(`- name: ${name}`)).split('\n      - ')[0];
    assert.match(step, /if: \$\{\{ env\.DOCS_ONLY != 'true' \}\}/, name);
  }
  assert.match(staticJob, /fetch-depth: 0/);
  assert.match(staticJob, /FEATURE_LINT_BASE:.*pull_request.base.sha.*github.event.before/);
  assert.match(staticJob, /gate.sh static-extra/);
  assert.match(workflow, /pnpm exec turbo run test \$SHARD_FILTER/);
  assert.match(workflow, /if:.*needs.changes.outputs.code != 'false'/);
  assert.match(workflow, /image: mirror.gcr.io\/pgvector\/pgvector:pg16/);
  assert.match(workflow, /run: bash ops\/platform-api\/scripts\/ci\/gate.sh integration/);
  assert.equal(existsSync(new URL('../workflows/feedbackops.yml', import.meta.url)), false);
});

// #1680: `Platform test` is split into shards. The last shard is "everything else", written only as exclusions, so it
// must exclude exactly what the other shards include plus @ap/platform-api (the integration job runs that suite).
test('Platform test shards cover every package once', () => {
  const job = workflow.split('  platform-test:\n')[1].split('\n  feature-integration:')[0];
  const shards = [...job.matchAll(/- \{ shard: (\d+), label: [^,]+, filter: "([^"]+)", workers: '(\d+)' \}/g)]
    .map(([, shard, filter, workers]) => ({ shard: Number(shard), filters: filter.split(' ').map(f => f.replace(/^--filter=/, '')), workers: Number(workers) }));
  assert.deepEqual(shards.map(s => s.shard), [1, 2, 3]);
  const included = shards.slice(0, -1).flatMap(s => s.filters);
  assert.ok(included.every(f => !f.startsWith('!')), 'only the last shard may exclude');
  const excluded = shards.at(-1).filters;
  assert.ok(excluded.every(f => f.startsWith('!')), 'the last shard is exclusions only');
  assert.deepEqual(excluded.map(f => f.slice(1)).sort(), ['@ap/platform-api', ...included].sort());
  // One package alone may use every vCPU; shards running two packages at once keep 2 workers each (4 vCPUs).
  for (const s of shards) assert.ok(s.workers * (s.filters.length === 1 && !s.filters[0].includes('*') ? 1 : 2) <= 4, `shard ${s.shard} workers`);
  assert.match(job, /key: turbo-\$\{\{ runner\.os \}\}-node26\.7\.0-test-\$\{\{ matrix\.shard \}\}-/);
});
