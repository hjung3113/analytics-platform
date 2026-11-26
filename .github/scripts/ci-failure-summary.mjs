// Push-only diagnostics for a failed main batch. Capture only test identifiers from Vitest logs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const prNumbers = (subjects) => [...new Set([...subjects.matchAll(/\(#([1-9]\d*)\)\s*$/gm)].map((match) => match[1]))];

function vitestFailures(log) {
  const plain = log.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  return [...new Set(plain.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(?:(\S+):test:\s*)?FAIL\s+(\S+\.(?:test|spec)\.[\w]+(?=\s|$)(?:\s+>\s+.*?)?)(?:\s+\[[^\]]+\])?\s*$/.exec(line);
    if (!match) return [];
    const [, pkg, test] = match;
    // Keep the test title with the file, but discard Vitest timing/diagnostic lines.
    return [pkg ? `${pkg} · ${test.trim()}` : test.trim()];
  }))];
}

function playwrightFailures(report) {
  if (!Array.isArray(report.rows)) throw new Error('unexpected contract report format');
  return report.rows.filter((row) => row.outcome === 'unexpected')
    .map(({ file, area, check }) => [file, area, check].filter(Boolean).join(' › '));
}

function batchPrs({ baseline, sha }) {
  const fullSha = /^[0-9a-f]{40}$/;
  if (!fullSha.test(baseline) || !fullSha.test(sha)) return null;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', baseline, sha], { stdio: 'ignore' });
    const subjects = execFileSync('git', ['log', '--first-parent', '--reverse', '--format=%s', `${baseline}..${sha}`], { encoding: 'utf8' });
    return prNumbers(subjects);
  } catch {
    return null;
  }
}

function selfTest() {
  assert.deepEqual(prNumbers('fix(#98): change (#3100)\ninternal fix (#99) text\nfix again (#3101)\nretry (#3100)\n'), ['3100', '3101']);
  assert.equal(batchPrs({ baseline: '', sha: 'HEAD' }), null);
  assert.deepEqual(vitestFailures([
    '@ap/ui:test: \u001b[31m FAIL \u001b[0m src/grid.test.ts > Grid > preserves focus',
    ' FAIL  src/setup.test.ts [ src/setup.test.ts ]', ' FAIL  src/retry.test.ts',
    ' FAIL  src/retry.test.ts', ' FAIL  Timeout without an attributable test',
  ].join('\n')), ['@ap/ui · src/grid.test.ts > Grid > preserves focus', 'src/setup.test.ts', 'src/retry.test.ts']);
  assert.deepEqual(playwrightFailures({ rows: [
    { file: 'contract-shell.spec.ts', area: 'Shell', check: 'rejects URL', outcome: 'unexpected' },
    { file: 'other.spec.ts', check: 'passed on retry', outcome: 'flaky' },
    { check: 'passed', outcome: 'expected' },
  ] }), ['contract-shell.spec.ts › Shell › rejects URL']);
  console.log('ci-failure-summary self-test passed');
}

function main(reportDir) {
  const prs = batchPrs({ baseline: process.env.BASELINE, sha: process.env.GITHUB_SHA });
  const bullet = (line) => `- \`${line.replace(/[\x00-\x1f`]/g, ' ')}\``;
  const failures = new Set();
  if (existsSync(reportDir)) {
    for (const relative of readdirSync(reportDir, { recursive: true })) {
      if (!/(?:^|\/)(results|vitest-failures)\.json$/.test(relative)) continue;
      try {
        const report = JSON.parse(readFileSync(join(reportDir, relative), 'utf8'));
        const tests = relative.endsWith('vitest-failures.json') ? report : playwrightFailures(report);
        for (const id of tests) failures.add(id);
      } catch (error) {
        console.warn(`ci-failure-summary: could not read ${relative}: ${error.message}`);
      }
    }
  }
  const prList = prs ? prs.map((number) => `#${number}`).join(', ') || 'No squash PR numbers in this range.' : 'Unavailable because the last green main SHA could not be resolved.';
  const summary = [
    '## Main batch failure', '', `Batch PRs — ${prList}`, '',
    `Failed gates — ${process.env.FAILED_GATES || 'see job results'}`, '', '### Failing specs and tests', '',
    ...([...failures].sort().map(bullet)),
    ...(failures.size ? [] : ['No test identifiers were published. See the failed jobs for setup, infrastructure or other gate errors.']),
    '',
  ].join('\n');
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

const [mode, input, output] = process.argv.slice(2);
if (mode === '--self-test') selfTest();
else if (mode === '--vitest') writeFileSync(output, JSON.stringify(vitestFailures(readFileSync(input, 'utf8'))) + '\n');
else main(mode);
