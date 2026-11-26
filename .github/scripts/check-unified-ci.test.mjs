// Exercise workflow verdicts and ordering without services or builds; the inventory guard reads tracked paths.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

test('only a PR with server=false may skip integration on a code diff', () => {
  const job = workflow.split('  feature-integration:\n')[1].split('\n  backend-images:')[0];
  assert.match(job, /needs\.changes\.outputs\.server != 'false'/);
  assert.match(aggregate, /SERVER: \$\{\{ needs\.changes\.outputs\.server \}\}/);
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
  assert.match(workflow, /if:.*needs.changes.outputs.code != 'false'/);
  assert.match(workflow, /image: mirror.gcr.io\/pgvector\/pgvector:pg16/);
  assert.match(workflow, /bash ops\/platform-api\/scripts\/ci\/gate.sh integration --shard=\$\{\{ matrix.shard \}\}\/3/);
  assert.match(workflow, /Backend integration \(\$\{\{ matrix.shard \}\}\/3\)[\s\S]*?matrix:\n\s+shard: \[1, 2, 3\]/);
  assert.equal(existsSync(new URL('../workflows/feedbackops.yml', import.meta.url)), false);
});

// #1680: `Platform test` is split into shards. The last shard is "everything else", written only as exclusions, so it
// must exclude exactly what the other shards include plus @ap/platform-api (the integration job runs that suite).
test('Platform test shards cover every package once', () => {
  const job = workflow.split('  platform-test:\n')[1].split('\n  feature-integration:')[0];
  const shards = [...job.matchAll(/- \{ shard: (\d+), label: [^,]+, filter: "([^"]+)", workers: '(\d+)' \}/g)]
    .map(([, shard, filter, workers]) => ({ shard: Number(shard), filters: filter.split(' ').map(f => f.replace(/^--filter=/, '')), workers: Number(workers) }));
  assert.deepEqual(shards.map(s => s.shard), [1, 2, 3, 4]);
  const included = shards.slice(0, -1).flatMap(s => s.filters);
  assert.ok(included.every(f => !f.startsWith('!')), 'only the last shard may exclude');
  const excluded = shards.at(-1).filters;
  assert.ok(excluded.every(f => f.startsWith('!')), 'the last shard is exclusions only');
  assert.deepEqual(excluded.map(f => f.slice(1)).sort(), ['@ap/platform-api', ...included].sort());
  // One package alone may use every vCPU; shards running two packages at once keep 2 workers each (4 vCPUs).
  for (const s of shards) assert.ok(s.workers * (s.filters.length === 1 && !s.filters[0].includes('*') ? 1 : 2) <= 4, `shard ${s.shard} workers`);
  assert.match(job, /key: turbo-\$\{\{ runner\.os \}\}-node\$\{\{ hashFiles\('\.nvmrc'\) \}\}-test-\$\{\{ matrix\.shard \}\}-/);
});

// Parse the job-level and matrix forms this workflow uses. Reject a form the budget check
// cannot evaluate instead of silently overlooking a job or charging it for just one runner.
function workflowJobs(yaml) {
  const source = yaml.split(/^jobs:\s*$/m)[1];
  assert.ok(source, 'missing jobs mapping');
  const fields = (body, indent) => new Map([...body.matchAll(new RegExp(`^ {${indent}}([\\w-]+): *(.*)$`, 'gm'))]
    .map(([, key, value]) => [key, value]));
  const blocks = source.split(/^  ([\w-]+):\s*$/m);
  assert.ok(blocks.length > 1 && !blocks[0].trim(), 'missing job blocks');
  assert.equal((blocks.length - 1) / 2, fields(source, 2).size, 'unsupported or duplicate job mapping');
  const jobs = new Map();
  for (let index = 1; index < blocks.length; index += 2) {
    const [id, body] = blocks.slice(index, index + 2);
    const job = fields(body, 4);
    const need = job.get('needs');
    const needs = need ? need.replace(/^\[|\]$/g, '').split(/,\s*/) : [];
    const matrix = body.split(/^      matrix:\s*$/m)[1]?.split(/^ {0,7}\S/m)[0];
    let size = 1;
    if (job.has('strategy')) {
      assert.ok(matrix, `missing or unsupported matrix for ${id}`);
      const axes = fields(matrix, 8);
      if (axes.has('include')) {
        assert.equal(axes.size, 1, `unsupported matrix include for ${id}`);
        size = [...matrix.matchAll(/^ {10}- \{/gm)].length;
        assert.equal(size, [...matrix.matchAll(/^ {10}-\s/gm)].length, `unsupported matrix row for ${id}`);
      } else {
        assert.ok(axes.size, `missing matrix axes for ${id}`);
        for (const value of axes.values()) {
          const dynamic = /^\$\{\{ fromJSON\(needs\.changes\.outputs\.e2e_shards \|\| '(\[.*\])'\) \}\}$/.exec(value);
          if (dynamic) size *= Math.max(JSON.parse(dynamic[1]).length, maxPrE2eShards);
          else size *= JSON.parse(value).length;
        }
      }
      assert.ok(Number.isSafeInteger(size) && size > 0, `invalid matrix size for ${id}`);
    }
    jobs.set(id, { needs, condition: job.get('if'), size, limit: fields(body, 6).get('max-parallel') });
  }
  return jobs;
}

function prSlots(jobs, outputs) {
  const active = (condition) => {
    if (!condition) return true;
    return condition.slice(4, -3).trim().split(' && ').every((term) => {
      if (term === '!cancelled()' || term === 'failure()') return true;
      if (/^needs\.[\w-]+\.result == 'success'$/.test(term)) return true;
      const match = /^(github\.event_name|needs\.changes\.outputs\.([\w_]+)) (==|!=) '([^']+)'$/.exec(term);
      assert.ok(match, `unsupported job condition term: ${term}`);
      if (match[2] && !Object.hasOwn(outputs, match[2])) return true;
      const value = match[2] ? outputs[match[2]] : 'pull_request';
      return (value === match[4]) === (match[3] === '==');
    });
  };
  const weight = ({ size, limit }) => {
    if (!limit) return size;
    if (/^\d+$/.test(limit)) return Math.min(size, Number(limit));
    const match = /^\$\{\{ github\.event_name != 'pull_request' && \d+ \|\| fromJSON\(needs\.changes\.outputs\.(\w+) \|\| '(\d+)'\) \}\}$/.exec(limit);
    assert.ok(match, `unsupported matrix max-parallel: ${limit}`);
    return Math.min(size, Number(outputs[match[1]] || match[2]));
  };
  const ancestors = (id) => new Set(jobs.get(id).needs.flatMap((need) => [need, ...ancestors(need)]));
  const candidates = [...jobs].filter(([, job]) => active(job.condition))
    .map(([id, job]) => ({ id, after: ancestors(id), weight: weight(job) }));
  const peak = ([first, ...rest]) => {
    if (!first) return 0;
    const independent = rest.filter((job) => !first.after.has(job.id) && !job.after.has(first.id));
    return Math.max(peak(rest), first.weight + peak(independent));
  };
  return peak(candidates);
}

test('PR job graph stays within the CI runner slot budget', () => {
  const budget = JSON.parse(readFileSync(new URL('../ci-budget.json', import.meta.url), 'utf8'));
  const jobs = workflowJobs(workflow);
  const scenarios = [
    ...['true', ''].flatMap((code) => ['true', 'false', ''].flatMap((server) =>
      ['all', 'none', 'base-path-only', 'contract-shell.spec.ts', ''].map((e2e) => ({
        code, server, e2e, ...prMatrixLimits({ server, e2e }),
      })))),
    { code: 'false', server: 'false', e2e: 'none' },
    { code: '', server: '', e2e: '' }, // The entire changes job failed and only YAML fallbacks are available.
  ];
  for (const outputs of scenarios) {
    const slots = prSlots(jobs, outputs);
    assert.ok(slots <= budget.maxParallelPrJobs, `PR can use ${slots} runner slots (budget ${budget.maxParallelPrJobs}) with ${JSON.stringify(outputs)}`);
  }
  assert.equal(prSlots(workflowJobs('jobs:\n  setup:\n    runs-on: ubuntu-latest\n  a:\n    needs: setup\n  b:\n    needs: setup\n'), {}), 2);
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
