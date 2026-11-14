// CI E2E shard job (#2182): prints the `tests/<spec>:<line>` filters one shard runs, balanced by recorded time instead of by test count.
// Playwright's `--shard` cuts the sorted test list into equal-count slices; the slow specs (contract-board 7 s a test against ~2 s elsewhere)
// then pile up in two or three shards (3.2 to 7.6 min). Here every test gets its spec file's weight from apps/platform-e2e/shard-weights.json
// (seconds a test, measured from a merged CI report), and the tests go heaviest first to the lightest shard. Every shard lists the same
// tests and computes the same partition, so the shards together cover every test exactly once. Node builtins only.
//
//   node .github/scripts/e2e-shard.mjs <shard> <total>     one filter per line on stdout; exit 1 on any failure (the workflow then falls back to `--shard`)
//   node .github/scripts/e2e-shard.mjs --self-test

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Tests of a Playwright `--list --reporter=json` report, one entry per `file:line` (a loop that generates tests shares one line, so one filter covers them all). */
export function testsOf(report) {
  const byKey = new Map();
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const file = String(spec.file);
      const key = `${file}:${spec.line}`;
      const entry = byKey.get(key) ?? { file, key, count: 0 };
      entry.count += Math.max(1, (spec.tests ?? []).length);
      byKey.set(key, entry);
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return [...byKey.values()];
}

/** Partition `tests` into `total` shards (index 0..total-1). Pure and deterministic: the same list always gives the same split. */
export function partition(tests, total, weights) {
  const weightOf = (t) => (weights.files[t.file] ?? weights.default) * t.count;
  const order = [...tests].sort((a, b) => weightOf(b) - weightOf(a) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const load = Array.from({ length: total }, () => 0);
  const shards = Array.from({ length: total }, () => []);
  for (const t of order) {
    let at = 0;
    for (let i = 1; i < total; i++) if (load[i] < load[at]) at = i;
    shards[at].push(t.key);
    load[at] += weightOf(t);
  }
  return { shards, load };
}

function selfTest() {
  const assert = (ok, msg) => { if (!ok) { console.error(`self-test failed: ${msg}`); process.exit(1); } };
  const weights = { default: 3, files: { 'slow.spec.ts': 7, 'fast.spec.ts': 1 } };
  const spec = (file, line, tests = 1) => ({ file, line, tests: Array.from({ length: tests }, () => ({})) });
  const report = { suites: [{ specs: [], suites: [{ specs: [
    ...Array.from({ length: 40 }, (_, i) => spec('slow.spec.ts', 10 + i)),
    ...Array.from({ length: 80 }, (_, i) => spec('fast.spec.ts', 10 + i)),
    spec('new.spec.ts', 5, 3), spec('new.spec.ts', 5, 2),
  ] }] }] };
  const tests = testsOf(report);
  assert(tests.length === 121, `one entry per file:line, got ${tests.length}`);
  assert(tests.find((t) => t.key === 'new.spec.ts:5').count === 5, 'a shared line adds up its tests');
  for (const total of [1, 3, 8]) {
    const { shards, load } = partition(tests, total, weights);
    const all = shards.flat();
    assert(all.length === tests.length && new Set(all).size === tests.length, `every test exactly once at ${total} shards`);
    assert(JSON.stringify(partition(tests, total, weights).shards) === JSON.stringify(shards), 'deterministic');
    if (total > 1) assert(Math.max(...load) - Math.min(...load) <= 7 * 3, `balanced at ${total} shards: ${load.join(' ')}`);
  }
  assert(partition([], 4, weights).shards.every((s) => s.length === 0), 'empty list');
  console.log('e2e-shard self-test ok');
}

function main() {
  if (process.argv[2] === '--self-test') return selfTest();
  const shard = Number(process.argv[2]);
  const total = Number(process.argv[3]);
  if (!Number.isInteger(shard) || !Number.isInteger(total) || shard < 1 || shard > total) throw new Error('usage: e2e-shard.mjs <shard> <total>');
  const weights = JSON.parse(readFileSync('apps/platform-e2e/shard-weights.json', 'utf8'));
  const raw = execFileSync('pnpm', ['--filter', '@ap/platform-e2e', 'exec', 'playwright', 'test', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: '' } });
  const report = JSON.parse(raw.slice(raw.indexOf('{')));
  const tests = testsOf(report);
  if (tests.length === 0) throw new Error('playwright listed no tests');
  const { shards } = partition(tests, total, weights);
  process.stdout.write(shards[shard - 1].map((key) => `tests/${key}`).join('\n') + '\n');
}

try { main(); } catch (err) { console.error(`e2e-shard: ${err.message}`); process.exit(1); }
