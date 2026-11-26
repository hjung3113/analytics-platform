// Exercise workflow verdicts and ordering without services or builds; the inventory guard reads tracked paths.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, matchesGlob } from 'node:path';
import { parse } from 'yaml';
import { test } from 'node:test';
import { maxPrE2eShards, prMatrixLimits } from './select-e2e.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflow = readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8');
const aggregate = workflow.split('  platform-workspace:\n')[1].split('\n  # #666:')[0];
const verdict = aggregate.split('        run: |\n')[1].split('\n      - ')[0].trim().replace(/^          /gm, '');

test('required workspace verdict fails every failed, cancelled or accidental skipped feature gate', () => {
  assert.match(aggregate, /needs: \[changes, platform-static, platform-typecheck, platform-test, feature-integration, pr-guard\]/);
  let cases = 0;
  for (const CODE of ['true', '', 'false']) {
    for (const STATIC of ['success', 'failure', 'cancelled', 'skipped', '']) {
     for (const TYPECHECK of ['success', 'failure', 'cancelled', 'skipped', '']) {
      for (const TEST of ['success', 'failure', 'cancelled', 'skipped', '']) {
        for (const INTEGRATION of ['success', 'failure', 'cancelled', 'skipped', '']) {
          const run = spawnSync('bash', ['-e', '-c', verdict], {
            cwd: root, encoding: 'utf8', env: { ...process.env, CODE, STATIC, TYPECHECK, TEST, INTEGRATION, GUARD: 'success' },
          });
          const succeeds = STATIC === 'success' && TYPECHECK === 'success' && TEST === 'success' && (INTEGRATION === 'success' || (CODE === 'false' && INTEGRATION === 'skipped'));
          assert.equal(run.status === 0, succeeds, JSON.stringify({ CODE, STATIC, TYPECHECK, TEST, INTEGRATION }));
          cases++;
        }
      }
     }
    }
  }
  assert.equal(cases, 1875);
});

test('a failed changes job discards populated skip and matrix outputs at every consumer', () => {
  const partial = { code: 'false', server: 'false', sdk: 'false', full: 'false', e2e: 'none',
    e2e_base_path: 'false', e2e_kit: 'false', e2e_shards: '[1]', e2e_total: '1',
    e2e_parallel: '3', integration_parallel: '3' };
  const references = [...workflow.matchAll(/needs\.changes\.outputs\.(\w+)/g)]
    .filter(([, key]) => key !== 'baseline');
  assert.deepEqual(new Set(references.map(([, key]) => key)), new Set(Object.keys(partial)));
  for (const { 1: key, index } of references) {
    const prefix = workflow.slice(workflow.lastIndexOf('\n', index) + 1, index);
    assert.match(prefix, /needs\.changes\.result == 'success' && $/, `failed changes must ignore ${key}: ${partial[key]}`);
  }
  const parsed = parse(workflow);
  const jobs = workflowJobs(workflow);
  assert.equal(prSlots(jobs, partial, 'failure'), prSlots(jobs, {}));
  for (const id of ['feature-integration', 'platform-contracts-e2e-shard']) {
    assert.equal(prJobActive(jobs.get(id).condition, partial), false, id);
    assert.equal(prJobActive(jobs.get(id).condition, {}), true, id);
  }
  const workspace = parsed.jobs['platform-workspace'].steps.find(step => step.name === 'All workspace gates succeeded');
  const e2e = parsed.jobs['platform-contracts-e2e'].steps.find(step => step.name === 'Shard verdict');
  for (const step of [workspace, e2e]) {
    for (const expression of Object.values(step.env).filter(value => value.includes('needs.changes.outputs.'))) {
      assert.match(expression, new RegExp(`^\\$\\{\\{ ${guardedOutput.source} \\}\\}$`));
      assert.equal(guardedOutput.exec(expression)[2], '', 'a failed result sends an empty value to the verdict');
    }
  }
});

test('only a PR with server=false may skip integration on a code diff', () => {
  const job = workflow.split('  feature-integration:\n')[1].split('\n  backend-images:')[0];
  assert.match(job, /needs\.changes\.outputs\.server \|\| ''\) != 'false'/);
  assert.match(aggregate, /SERVER: \$\{\{ needs\.changes\.result == 'success' && needs\.changes\.outputs\.server \|\| '' \}\}/);
  for (const GITHUB_EVENT_NAME of ['pull_request', 'push', 'workflow_dispatch']) {
    for (const INTEGRATION of ['success', 'skipped', 'failure', 'cancelled', '']) {
      const run = spawnSync('bash', ['-e', '-c', verdict], {
        cwd: root, encoding: 'utf8', env: {
          ...process.env, GITHUB_EVENT_NAME, CODE: 'true', SERVER: 'false',
          STATIC: 'success', TYPECHECK: 'success', TEST: 'success', GUARD: 'success', INTEGRATION,
        },
      });
      assert.equal(run.status === 0, INTEGRATION === 'success' || (GITHUB_EVENT_NAME === 'pull_request' && INTEGRATION === 'skipped'),
        JSON.stringify({ GITHUB_EVENT_NAME, INTEGRATION }));
    }
  }
});

// #2643: the PR guard (size, round and scope caps) is required through the workspace verdict, on every event; a skipped or failed guard fails it.
test('required workspace verdict fails unless the PR guard succeeded', () => {
  const guardJob = workflow.split('  pr-guard:\n')[1].split('\n  # The required check')[0];
  assert.match(guardJob, /if: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(guardJob, /pull-requests: read\n\s+actions: read/);
  assert.match(guardJob, /run: node \.github\/scripts\/pr-guard\.mjs/);
  assert.match(workflow, /node \.github\/scripts\/pr-guard\.mjs --self-test/);
  for (const GUARD of ['success', 'failure', 'cancelled', 'skipped', '']) {
    const run = spawnSync('bash', ['-e', '-c', verdict], {
      cwd: root, encoding: 'utf8', env: { ...process.env, CODE: 'true', STATIC: 'success', TYPECHECK: 'success', TEST: 'success', INTEGRATION: 'success', GUARD },
    });
    assert.equal(run.status === 0, GUARD === 'success', `guard=${GUARD}`);
  }
});

test('mock-dist readers precede real production build; folded feature coverage stays required', () => {
  const staticJob = workflow.split('  platform-static:\n')[1].split('  platform-typecheck:\n')[0];
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
    // #2182: production-assembly checks run on main push and manual runs only, never on a PR.
    assert.match(step, /if: \$\{\{ env\.DOCS_ONLY != 'true' && github\.event_name != 'pull_request' \}\}/, name);
  }
  assert.match(staticJob, /fetch-depth: 0/);
  assert.match(staticJob, /FEATURE_LINT_BASE:.*pull_request.base.sha.*github.event.before/);
  assert.match(staticJob, /gate.sh static-extra/);
  assert.match(workflow, /pnpm exec turbo run test \$SHARD_FILTER/);
  assert.match(workflow, /if:.*needs\.changes\.outputs\.code \|\| ''\) != 'false'/);
  assert.match(workflow, /image: mirror.gcr.io\/pgvector\/pgvector:pg16/);
  assert.match(workflow, /bash ops\/platform-api\/scripts\/ci\/gate.sh integration --shard=\$\{\{ matrix.shard \}\}\/3/);
  assert.match(workflow, /Backend integration \(\$\{\{ matrix.shard \}\}\/3\)[\s\S]*?matrix:\n\s+shard: \[1, 2, 3\]/);
  assert.equal(existsSync(new URL('../workflows/feedbackops.yml', import.meta.url)), false);
});

// #1680: `Platform test` is split into shards. The last shard is "everything else", written only as exclusions, so it
// must exclude exactly what the other shards include plus @ap/platform-api (the integration job runs that suite).
function checkTestShards(yaml) {
  const job = parse(yaml).jobs['platform-test'];
  const shards = job.strategy.matrix.include.map(({ shard, filter, workers }) => ({
    shard, filters: filter.trim().split(/\s+/).map(f => {
      assert.match(f, /^--filter=!?((?:@[\w.-]+\/)?[\w.-]+|\.\/[\w./-]+(?:\/\*)?)$/);
      return f.slice('--filter='.length);
    }), workers: Number(workers),
  }));
  assert.deepEqual(shards.map(s => s.shard), [1, 2, 3, 4]);
  const included = shards.slice(0, -1).flatMap(s => s.filters);
  assert.ok(included.every(f => !f.startsWith('!')), 'only the last shard may exclude');
  const excluded = shards.at(-1).filters;
  assert.ok(excluded.every(f => f.startsWith('!')), 'the last shard is exclusions only');
  assert.deepEqual(excluded.map(f => f.slice(1)).sort(), ['@ap/platform-api', ...included].sort());
  const { packages: paths } = parse(readFileSync(new URL('../../pnpm-workspace.yaml', import.meta.url), 'utf8'));
  const manifests = execFileSync('git', ['ls-files', '-z', '*/package.json'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(file => file && paths.some(pattern => matchesGlob(dirname(file), pattern)));
  assert.ok(manifests.length > 0, 'workspace package inventory must be nonempty');
  for (const file of manifests) {
    const { name } = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    const matches = (filter) => filter.startsWith('./') ? matchesGlob(dirname(file), filter.slice(2)) : name === filter;
    const memberships = shards.filter(({ filters }) => filters[0].startsWith('!')
      ? !filters.some(filter => matches(filter.slice(1)))
      : filters.some(matches)).map(({ shard }) => shard);
    assert.equal(memberships.length, name === '@ap/platform-api' ? 0 : 1, `${name} matches shards ${memberships.join(', ')}`);
  }
  // One package alone may use every vCPU; shards running two packages at once keep 2 workers each (4 vCPUs).
  for (const s of shards) assert.ok(s.workers * (s.filters.length === 1 && !s.filters[0].includes('*') ? 1 : 2) <= 4, `shard ${s.shard} workers`);
  assert.match(job.steps.find(step => step.uses?.startsWith('actions/cache/restore@')).with.key, /^turbo-\$\{\{ runner\.os \}\}-node\$\{\{ hashFiles\('\.nvmrc'\) \}\}-test-\$\{\{ matrix\.shard \}\}-/);
}

test('Platform test shards cover every package once', () => {
  checkTestShards(workflow);
  // Keep the exclusion list mirrored but add a directory whose package is already selected by name.
  const overlap = workflow.replaceAll('./packages/sdk/*', './packages/sdk/* --filter=./packages/feature/screens')
    .replace('--filter=!./packages/sdk/* --filter=./packages/feature/screens',
      '--filter=!./packages/sdk/* --filter=!./packages/feature/screens');
  assert.throws(() => checkTestShards(overlap), /@ap\/feature-screens.*shards 1, 2/);
});

// Model just the workflow forms used here. Reject unsupported expressions or matrix forms.
const guardedOutput = /needs\.changes\.result == 'success' && needs\.changes\.outputs\.(\w+) \|\| '([^']*)'/;
const comparableOutput = new RegExp(`\\(${guardedOutput.source}\\)`, 'g');
const resultGuard = (key, fallback, outputs) => outputs[key] || fallback;

function workflowJobs(yaml) {
  const { jobs } = parse(yaml);
  assert.ok(jobs && typeof jobs === 'object' && !Array.isArray(jobs) && Object.keys(jobs).length > 0, 'missing jobs mapping');
  return new Map(Object.entries(jobs).map(([id, job]) => {
    const needs = typeof job.needs === 'string' ? [job.needs] : job.needs ?? [];
    assert.ok(Array.isArray(needs) && needs.every(need => Object.hasOwn(jobs, need)), `unsupported needs for ${id}`);
    let size = 1;
    if (Object.hasOwn(job, 'strategy')) {
      const matrix = job.strategy?.matrix;
      assert.ok(matrix && typeof matrix === 'object' && !Array.isArray(matrix), `missing or unsupported matrix for ${id}`);
      if (Object.hasOwn(matrix, 'include')) {
        assert.equal(Object.keys(matrix).length, 1, `unsupported matrix include for ${id}`);
        assert.ok(Array.isArray(matrix.include) && matrix.include.every(row => row && typeof row === 'object' && !Array.isArray(row)),
          `unsupported matrix row for ${id}`);
        size = matrix.include.length;
      } else {
        const axes = Object.entries(matrix);
        assert.ok(axes.length && !Object.hasOwn(matrix, 'exclude'), `missing or unsupported matrix axes for ${id}`);
        for (const [key, value] of axes) {
          if (Array.isArray(value)) {
            assert.ok(value.length > 0, `empty matrix axis ${id}.${key}`);
            size *= value.length;
          } else {
            const dynamic = new RegExp(`^\\$\\{\\{ fromJSON\\(${guardedOutput.source}\\) \\}\\}$`).exec(value);
            assert.ok(dynamic && dynamic[1] === 'e2e_shards', `unsupported matrix axis ${id}.${key}`);
            const fallback = JSON.parse(dynamic[2]);
            assert.ok(Array.isArray(fallback) && fallback.length > 0, `invalid matrix fallback for ${id}.${key}`);
            size *= Math.max(fallback.length, maxPrE2eShards);
          }
        }
      }
      assert.ok(Number.isSafeInteger(size) && size > 0, `invalid matrix size for ${id}`);
    }
    return [id, { needs, condition: job.if, size, limit: job.strategy?.['max-parallel'] }];
  }));
}

function prJobActive(condition, outputs) {
  if (condition === undefined) return true;
  assert.match(condition, /^\$\{\{ .+ \}\}$/);
  return condition.slice(4, -3).trim().replace(comparableOutput, (expression, key, fallback) => {
    assert.equal(fallback, '', `unsupported comparison fallback: ${expression}`);
    return `changes.${key}`;
  }).split(' && ').map((term) => {
    if (term === '!cancelled()' || term === 'failure()') return true;
    if (/^needs\.[\w-]+\.result == 'success'$/.test(term)) return true;
    const match = /^(github\.event_name|changes\.(\w+)) (==|!=) '([^']+)'$/.exec(term);
    assert.ok(match, `unsupported job condition term: ${term}`);
    const value = match[2] ? resultGuard(match[2], '', outputs) : 'pull_request';
    return (value === match[4]) === (match[3] === '==');
  }).every(Boolean);
}

function prSlots(jobs, partialOutputs, changesResult = 'success') {
  const outputs = changesResult === 'success' ? partialOutputs : {};
  const weight = ({ size, limit }) => {
    if (limit === undefined) return size;
    if (Number.isSafeInteger(limit) && limit > 0) return Math.min(size, limit);
    const match = new RegExp(`^\\$\\{\\{ github\\.event_name != 'pull_request' && \\d+ \\|\\| fromJSON\\(${guardedOutput.source}\\) \\}\\}$`).exec(limit);
    assert.ok(match && ['e2e_parallel', 'integration_parallel'].includes(match[1]), `unsupported matrix max-parallel: ${limit}`);
    const count = Number(resultGuard(match[1], match[2], outputs));
    assert.ok(Number.isSafeInteger(count) && count > 0, `invalid matrix max-parallel: ${count}`);
    return Math.min(size, count);
  };
  const ancestors = (id) => new Set(jobs.get(id).needs.flatMap((need) => [need, ...ancestors(need)]));
  const candidates = [...jobs].map(([id, job]) => ({
    id, after: ancestors(id), weight: weight(job), active: prJobActive(job.condition, outputs),
  })).filter(job => job.active);
  const peak = ([first, ...rest]) => {
    if (!first) return 0;
    const independent = rest.filter((job) => !first.after.has(job.id) && !job.after.has(first.id));
    return Math.max(peak(rest), first.weight + peak(independent));
  };
  return peak(candidates);
}

function assertPrBudget(jobs, limit, outputs, changesResult) {
  const slots = prSlots(jobs, outputs, changesResult);
  assert.ok(slots <= limit, `PR can use ${slots} runner slots (budget ${limit}) with ${JSON.stringify(outputs)}`);
}

test('PR job graph stays within the CI runner slot budget', () => {
  const budget = JSON.parse(readFileSync(new URL('../ci-budget.json', import.meta.url), 'utf8'));
  const jobs = workflowJobs(workflow);
  const scenarios = [
    ...['true', ''].flatMap((code) => ['true', 'false', ''].flatMap((server) =>
      ['all', 'none', 'base-path-only', 'contract-shell.spec.ts', ''].map((e2e) => ({
        code, server, e2e, ...prMatrixLimits(),
      })))),
    { code: 'false', server: 'false', e2e: 'none' },
    { code: '', server: '', e2e: '' }, // The entire changes job failed and only YAML fallbacks are available.
  ];
  for (const outputs of scenarios) assertPrBudget(jobs, budget.maxParallelPrJobs, outputs);
  // A PR that needs both suites runs every bounded E2E and integration shard in one wave (it ran 39 min in waves at nine, #3100).
  const both = { code: 'true', server: 'true', e2e: 'contract-shell.spec.ts', e2e_shards: '[1,2,3]', ...prMatrixLimits() };
  assert.equal(Number(both.e2e_parallel), 3);
  assert.equal(Number(both.integration_parallel), 3);
  assert.equal(prSlots(jobs, both), budget.maxParallelPrJobs);
  assert.equal(prSlots(workflowJobs('jobs:\n  setup:\n    runs-on: ubuntu-latest\n  a:\n    needs: setup\n  b:\n    needs: setup\n'), {}), 2);
});

test('push and dispatch publish full parallelism for both matrices', () => {
  const script = fileURLToPath(new URL('./select-e2e.mjs', import.meta.url));
  for (const event of ['push', 'workflow_dispatch']) {
    const output = execFileSync(process.execPath, [script], {
      env: { EVENT: event, FULL_INPUT: 'false' }, encoding: 'utf8',
    });
    assert.match(output, /^e2e_parallel=8$/m, event);
    assert.match(output, /^integration_parallel=3$/m, event);
  }
});

// Push and dispatch run every shard together: main CI time is merge speed for batched merges, so the PR budget must not throttle them.
function nonPrShortfalls(jobs) {
  return [...jobs].filter(([, job]) => typeof job.limit === 'string').flatMap(([id, job]) => {
    const match = /^\$\{\{ github\.event_name != 'pull_request' && (\d+) \|\| /.exec(job.limit);
    assert.ok(match, `${id}: max-parallel must give push and dispatch a fixed limit: ${job.limit}`);
    return Number(match[1]) < job.size ? [`${id}: ${match[1]} < ${job.size}`] : [];
  });
}

test('push and dispatch run every matrix shard at once and are never cancelled', () => {
  const jobs = workflowJobs(workflow);
  assert.ok([...jobs.values()].filter((job) => typeof job.limit === 'string').length >= 2, 'both suite matrices declare a limit');
  assert.deepEqual(nonPrShortfalls(jobs), []);
  const throttled = workflow.replace("github.event_name != 'pull_request' && 8 ||", "github.event_name != 'pull_request' && 2 ||");
  assert.notEqual(throttled, workflow);
  assert.notDeepEqual(nonPrShortfalls(workflowJobs(throttled)), []);
  const throttledIntegration = workflow.replace("github.event_name != 'pull_request' && 3 ||", "github.event_name != 'pull_request' && 1 ||");
  assert.notEqual(throttledIntegration, workflow);
  assert.notDeepEqual(nonPrShortfalls(workflowJobs(throttledIntegration)), []);
  // Only a superseded PR run is cancelled; a manual run has its own group.
  assert.match(workflow, /^  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
  assert.match(workflow, /^  group: .*github\.event_name == 'workflow_dispatch' && 'dispatch-'/m);
});

test('quoted strategy keys still count all ten slots in the busiest staged wave', () => {
  const yaml = `jobs:
  setup:
    runs-on: ubuntu-latest
  matrix:
    needs: [setup]
    'strategy':
      max-parallel: 8
      matrix:
        shard: [1, 2, 3, 4, 5, 6, 7, 8, 9]
  parallel:
    needs: setup
  finish:
    needs: [matrix, parallel]
`;
  assertPrBudget(workflowJobs(yaml), 9, {});
  assert.equal(prSlots(workflowJobs(yaml), {}), 9);
  const wider = yaml.replace('max-parallel: 8', 'max-parallel: 9');
  assert.throws(() => assertPrBudget(workflowJobs(wider), 9, {}), /PR can use 10 runner slots/);
  assert.throws(() => workflowJobs(yaml.replace('[1, 2, 3, 4, 5, 6, 7, 8, 9]', '\${{ fromJSON(vars.SHARDS) }}')), /unsupported matrix axis/);
  assert.throws(() => prSlots(workflowJobs(yaml.replace('  parallel:', '  parallel:\n    if: \${{ inputs.optional }}')), {}),
    /unsupported job condition/);
});

// #1951: the Node version lives in .nvmrc only, so a Node upgrade is one edit and no job runs a stale version.
test('every setup-node step reads .nvmrc', () => {
  for (const name of ['ci.yml', 'pages.yml', 'css-selectors.yml']) {
    const text = readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /node-version:\s/, `${name} hardcodes node-version`);
    assert.doesNotMatch(text, /node\d+\.\d+\.\d+/, `${name} hardcodes a Node version in a cache key`);
    const setups = text.match(/uses: actions\/setup-node@/g)?.length ?? 0;
    const files = text.match(/node-version-file: \.nvmrc/g)?.length ?? 0;
    assert.equal(files, setups, `${name}: every setup-node step needs node-version-file: .nvmrc`);
  }
});

// #1951: typecheck is its own job beside Platform static, and the required aggregate fails when it does.
test('typecheck runs in its own job, not in Platform static', () => {
  const staticJob = workflow.split('  platform-static:\n')[1].split('  platform-typecheck:\n')[0];
  const typecheckJob = workflow.split('  platform-typecheck:\n')[1].split('\n  platform-test:\n')[0];
  assert.doesNotMatch(staticJob, /pnpm typecheck/);
  assert.match(typecheckJob, /needs: changes\n/);
  assert.match(typecheckJob, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(typecheckJob, /- run: pnpm typecheck --concurrency=4/);
  assert.match(typecheckJob, /-typecheck-\$\{\{ github\.sha \}\}/);
  assert.match(aggregate, /"typecheck=\$TYPECHECK"/);
});

test('SDK drift reports on PR/main; strict comparison only on full manual release gate', () => {
  const step = workflow.slice(workflow.indexOf('- name: SDK public API snapshots')).split('\n      # #430:')[0];
  assert.match(step, /github.event_name == 'workflow_dispatch' && inputs.full == true/);
  assert.match(step, /pnpm sdk:api --report/);
  assert.match(step, /\n\s+pnpm sdk:api\n/);
  assert.match(step, /pnpm sdk:api --self-test/);
  assert.match(step, /pnpm sdk:test/);
  assert.match(workflow, /node tooling\/sdk\/sdk-changelog.mjs --check/);
  assert.doesNotMatch(step, /pnpm build|--update/);
});

// New focused Node tests must enter static-extra even though these packages have no test script.
test('static-extra lists every tracked ops and real-server Node test exactly once', () => {
  const gate = readFileSync(new URL('../../ops/platform-api/scripts/ci/gate.sh', import.meta.url), 'utf8');
  const stage = gate.split('stage_static_extra() {')[1].split('\n}')[0];
  const listed = [...stage.matchAll(/step node (?:--test )?("[^"\n]+"|[^\s]+)/g)]
    .map(([, path]) => path.replaceAll('"', '').replace('$FEATURE_OPS', 'ops/platform-api')).sort();
  const tracked = execFileSync('git', ['ls-files', '--', ':(glob)ops/platform-api/**/*.test.mjs', ':(glob)apps/platform-e2e/tests-real/*.test.ts'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort();
  assert.ok(tracked.length > 0, 'tracked test discovery must be nonempty');
  assert.deepEqual(listed, tracked);
});
