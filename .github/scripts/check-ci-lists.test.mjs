// #2181: CI runs several lists kept by hand — the test files gate.sh and ci.yml name one by one, the scripts whose
// `--self-test` CI calls, and the `$TURBO_ROOT$`/relative inputs in each turbo.json. Each test below builds the expected
// set from the tracked files and compares, so a new file nobody listed, or a listed file that moved, fails here instead
// of silently not running (a node test outside vitest had failed unnoticed since #3085).
// E2E spec lists in select-e2e.mjs are checked by its own --self-test; CODE_READS_MD by classify-changes --self-test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { matchesGlob, posix } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, 'utf8');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const isGlob = (path) => /[*?{[]/.test(path);
const matches = (path, pattern) => path === pattern || matchesGlob(path, pattern);

// The CI entry points: the workflow, the gate stages it calls, and the root package scripts those two invoke by name.
const featureOps = /^FEATURE_OPS=(\S+)$/m.exec(read('ops/platform-api/paths.sh'))[1];
// Whole-line comments are dropped: a commented-out or cited command runs nothing.
const uncommented = (text) => text.replace(/^\s*#.*$/gm, '');
const direct = [read('.github/workflows/ci.yml'), read('ops/platform-api/scripts/ci/gate.sh').replaceAll('$FEATURE_OPS', featureOps)].map(uncommented).join('\n');
const scripts = JSON.parse(read('package.json')).scripts;
const invoked = Object.keys(scripts).filter((name) => new RegExp(`\\bpnpm (?:run )?${name.replace(/[.:]/g, '\\$&')}(?![\\w:-])`).test(direct));
const runnerText = [direct, ...invoked.map((name) => scripts[name])].join('\n');

/** The test-file paths the runners name, `"$X/…"` quoting and globs kept as written. */
const namedTests = [...new Set([...runnerText.matchAll(/(?:^|[\s"'])((?:\.github|apps|ops|tooling|packages|menus|platform)\/[\w./*{},-]*\.test\.[cm]?[jt]s)\b/g)].map((m) => m[1]))];

/** Directories whose package.json runs vitest: vitest collects their test files, so no runner lists them. */
const vitestDirs = tracked.filter((f) => f.endsWith('/package.json'))
  .filter((f) => /\bvitest\b/.test(JSON.parse(read(f)).scripts?.test ?? ''))
  .map((f) => posix.dirname(f));
const inVitestPackage = (file) => vitestDirs.some((dir) => file.startsWith(`${dir}/`));

test('every tracked node test outside a vitest package is run by a CI step', () => {
  const nodeTests = tracked.filter((f) => /\.test\.[cm]?[jt]s$/.test(f) && !f.includes('/fixtures/') && !inVitestPackage(f));
  const unrun = nodeTests.filter((file) => !namedTests.some((pattern) => matches(file, pattern)));
  assert.deepEqual(unrun, [], 'add each file to gate.sh static-extra or a ci.yml `node --test` line');
});

test('every test file a CI step names still exists', () => {
  const missing = namedTests.filter((pattern) => !tracked.some((file) => matches(file, pattern)));
  assert.deepEqual(missing, [], 'a listed test moved or was deleted: update the runner line');
});

test('every script with a --self-test mode is self-tested by CI', () => {
  const selfTesting = tracked.filter((f) => /^(?:\.github\/scripts|tooling|ops\/platform-api\/(?:scripts|conductor))\//.test(f) && /\.(?:[cm]?js|sh)$/.test(f))
    .filter((f) => !f.includes('/fixtures/') && /['"]--self-test['"]|--self-test\)/.test(read(f)));
  const viaScript = (file) => invoked.some((name) => scripts[name].split(/\s+/).includes(file)
    && new RegExp(`\\bpnpm (?:run )?${name.replace(/[.:]/g, '\\$&')} --self-test\\b`).test(direct));
  const unrun = selfTesting.filter((file) => !new RegExp(`${file.replace(/[.]/g, '\\.')} --self-test\\b`).test(direct) && !viaScript(file));
  assert.deepEqual(unrun, [], 'call `<script> --self-test` from ci.yml');
});

test('every turbo input outside the defaults matches a tracked file', () => {
  const stale = [];
  for (const config of tracked.filter((f) => /(?:^|\/)turbo\.json$/.test(f))) {
    const dir = posix.dirname(config);
    for (const [task, { inputs = [] }] of Object.entries(JSON.parse(read(config)).tasks ?? {})) {
      for (const input of inputs) {
        if (input.startsWith('!') || input === '$TURBO_DEFAULT$' || input === '$TURBO_EXTENDS$') continue;
        const pattern = input.startsWith('$TURBO_ROOT$/') ? input.slice('$TURBO_ROOT$/'.length) : posix.normalize(posix.join(dir, input));
        const hit = isGlob(pattern) ? tracked.some((file) => matchesGlob(file, pattern)) : tracked.includes(pattern);
        if (!hit) stale.push(`${config} ${task}: ${input}`);
      }
    }
  }
  assert.deepEqual(stale, [], 'an input that matches nothing hashes nothing: point it at the current path or remove it');
});
