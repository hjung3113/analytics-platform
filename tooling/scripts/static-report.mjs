#!/usr/bin/env node
// #2181: a report, never a gate. Counts what knip finds unused (files, exports, types, dependencies) across the workspace and what
// madge finds circular inside the SDK (packages/sdk), once with type-only imports and once without (the runtime cycles).
// CI runs it on main pushes and manual runs only (the `static-report` job); a PR never waits on it. The counts feed the
// decision in #2181 whether knip or the cycle count becomes a check step; until then a rising number is a signal, not a failure.
// Separate from tooling/scripts/quality-report.mjs (#3219), which lists source patterns for review rounds.
//
//   node tooling/scripts/static-report.mjs [--out <dir>]   writes knip.json, cycles.json, cycles-runtime.json and summary.md to <dir>
//                                                         (default: a temp dir), prints the summary, appends it to $GITHUB_STEP_SUMMARY
//   node tooling/scripts/static-report.mjs --self-test
// Exit status: 0 = report written (whatever the counts), 1 = a tool could not run or its output was not JSON, 2 = usage.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
// Pinned here, not in package.json: the report runs through `pnpm dlx`, so the tools stay out of the install every job does.
const KNIP = 'knip@6.45.1';
const MADGE = 'madge@8.0.0';
// Configs knip loads refuse to evaluate without these. Stubs only: knip reads the configs, nothing connects or builds.
// apps/platform-e2e/playwright.real.config.ts validates a throwaway database target (tests-real/database-safety.ts);
// apps/platform-web/vite.config.ts needs an assembly module unless the production-graph check mode is on (scripts/assembly-choice.ts).
export const KNIP_ENV = Object.freeze({
  DATABASE_URL: 'postgres://platform_app:stub@localhost:5439/platform_static_report',
  DATABASE_URL_MIGRATE: 'postgres://platform_migrate:stub@localhost:5439/platform_static_report',
  WORKSPACE_ID: '00000000-0000-0000-0000-000000000001',
  AP_PROD_GRAPH_CHECK: '1',
});
const MADGE_ARGS = ['--circular', '--json', '--no-spinner', '--extensions', 'ts,tsx', '--exclude', '(__tests__|\\.test\\.|/dist/|node_modules)', 'packages/sdk'];
// madge reads its options through `rc`, which takes `madge_<path>` variables: skip `import type` edges for the runtime count.
const RUNTIME_ONLY = { madge_detectiveOptions__ts__skipTypeImports: 'true', madge_detectiveOptions__tsx__skipTypeImports: 'true' };

export const KNIP_TYPES = ['files', 'exports', 'types', 'dependencies', 'devDependencies', 'unlisted', 'binaries', 'unresolved', 'duplicates', 'enumMembers'];

/** Counts per knip issue type, from `knip --reporter json` output. */
export function knipCounts(report) {
  const counts = Object.fromEntries(KNIP_TYPES.map((type) => [type, 0]));
  for (const issue of report.issues) for (const type of KNIP_TYPES) counts[type] += issue[type]?.length ?? 0;
  return counts;
}

/** Cycle count per SDK package, from `madge --circular --json` output (paths relative to packages/sdk). */
export function cyclesByPackage(cycles) {
  const byPackage = {};
  for (const cycle of cycles) {
    const name = cycle[0].split('/')[0];
    byPackage[name] = (byPackage[name] ?? 0) + 1;
  }
  return byPackage;
}

export function summary({ sha, knip, cycles, runtimeCycles }) {
  const perPackage = (list) => Object.entries(cyclesByPackage(list)).sort(([a], [b]) => a.localeCompare(b)).map(([name, n]) => `${name} ${n}`).join(', ') || '—';
  return [
    `## Static report${sha ? ` (${sha.slice(0, 9)})` : ''}`,
    '',
    `knip (${KNIP}, unused or undeclared across the workspace):`,
    '',
    '| type | count |',
    '| --- | --- |',
    ...KNIP_TYPES.map((type) => `| ${type} | ${knip[type]} |`),
    '',
    `madge (${MADGE}, circular imports in packages/sdk): ${cycles.length} cycles (${perPackage(cycles)}); without type-only imports ${runtimeCycles.length} (${perPackage(runtimeCycles)}).`,
    '',
  ].join('\n');
}

/** Runs a pinned tool through pnpm dlx and parses its JSON stdout. Both tools exit 1 when they find something, so the exit status is not the verdict. */
function runJson(args, env) {
  const run = spawnSync('pnpm', ['-s', 'dlx', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 256 * 1024 * 1024 });
  try {
    return JSON.parse(run.stdout);
  } catch {
    process.stderr.write(run.stderr);
    throw new Error(`${args[0]} printed no JSON (exit ${run.status})`);
  }
}

function main(args) {
  const outIndex = args.indexOf('--out');
  if (args.length !== (outIndex === -1 ? 0 : 2) || (outIndex !== -1 && !args[outIndex + 1])) {
    console.error('usage: static-report.mjs [--out <dir>] | --self-test');
    return 2;
  }
  const out = outIndex === -1 ? mkdtempSync(join(tmpdir(), 'static-report-')) : args[outIndex + 1];
  mkdirSync(out, { recursive: true });
  try {
    const knipReport = runJson([KNIP, '--no-progress', '--reporter', 'json'], KNIP_ENV);
    const cycles = runJson([MADGE, ...MADGE_ARGS], {});
    const runtimeCycles = runJson([MADGE, ...MADGE_ARGS], RUNTIME_ONLY);
    writeFileSync(join(out, 'knip.json'), JSON.stringify(knipReport));
    writeFileSync(join(out, 'cycles.json'), JSON.stringify(cycles, null, 1));
    writeFileSync(join(out, 'cycles-runtime.json'), JSON.stringify(runtimeCycles, null, 1));
    const text = summary({ sha: process.env.GITHUB_SHA, knip: knipCounts(knipReport), cycles, runtimeCycles });
    writeFileSync(join(out, 'summary.md'), text);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
    console.log(text);
    console.log(`static-report: files in ${out}`);
    return 0;
  } catch (error) {
    console.error(`static-report: ${error.message}`);
    return 1;
  }
}

function selfTest() {
  let bad = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) { bad++; console.error(`FAIL ${name}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); }
  };
  const knip = knipCounts({ issues: [
    { file: 'a.ts', files: [{ name: 'a.ts' }], exports: [{ name: 'x' }, { name: 'y' }], types: [] },
    { file: 'package.json', dependencies: [{ name: 'dep' }], owners: [{ name: '@o' }] },
  ] });
  check('knip: counts each type across files, missing lists are zero', [knip.files, knip.exports, knip.types, knip.dependencies, knip.unlisted], [1, 2, 0, 1, 0]);
  check('knip: non-issue keys (owners) are not counted', 'owners' in knip, false);
  check('madge: groups cycles by first-path package', cyclesByPackage([['kernel/src/a.ts', 'kernel/src/b.ts'], ['ui/src/c.tsx', 'kernel/src/d.ts'], ['kernel/x.ts', 'kernel/y.ts']]), { kernel: 2, ui: 1 });
  const text = summary({ sha: '0123456789abcdef', knip, cycles: [['ui/a.ts', 'ui/b.ts']], runtimeCycles: [] });
  check('summary: short SHA in the heading', text.split('\n')[0], '## Static report (012345678)');
  check('summary: cycle line with per-package counts and an empty runtime list', text.includes('1 cycles (ui 1); without type-only imports 0 (—)'), true);
  check('env stubs: database targets pass the throwaway-database shape (localhost:5439, platform_<name>)', [KNIP_ENV.DATABASE_URL, KNIP_ENV.DATABASE_URL_MIGRATE].every((url) => /^postgres:\/\/platform_(app|migrate):stub@localhost:5439\/platform_[a-z_]+$/.test(url)), true);
  if (bad) { console.error(`static-report self-test: ${bad} failing`); return 1; }
  console.log('static-report self-test passed');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  process.exit(args.length === 1 && args[0] === '--self-test' ? selfTest() : main(args));
}
