import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { checkSnapshots, parseMode } from './sdk-api-snapshot.mjs';

test('report prints additions, changes and removed entries to stdout and summary without baseline writes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ap-api-report-'));
  try {
    writeFileSync(join(directory, 'changed.api.txt'), 'before\n');
    writeFileSync(join(directory, 'stale.api.txt'), 'removed\n');
    const summaryPath = join(directory, 'summary');
    writeFileSync(summaryPath, 'earlier step\n');
    const snapshots = new Map([['changed.api.txt', 'after\n'], ['new.api.txt', 'added\n']]);
    let output = '';
    const options = { directory, report: true, summaryPath, write: text => { output += text; } };
    assert.equal(checkSnapshots(snapshots, options), 0);
    for (const line of ['-before', '+after', '+added', '-removed', '3 snapshot(s) differ']) assert.ok(output.includes(line), line);
    assert.ok(readFileSync(summaryPath, 'utf8').startsWith('earlier step\n'));
    assert.ok(readFileSync(summaryPath, 'utf8').includes(output));
    assert.equal(readFileSync(join(directory, 'changed.api.txt'), 'utf8'), 'before\n');
    assert.equal(checkSnapshots(snapshots, { ...options, report: false }), 1);
    assert.equal(checkSnapshots(new Map([['changed.api.txt', 'before\n'], ['stale.api.txt', 'removed\n']]), options), 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('report is an explicit exclusive mode', () => {
  assert.equal(parseMode(['--report']), 'report');
  assert.equal(parseMode([]), 'check');
  assert.throws(() => parseMode(['--report', '--update']), /usage/);
});
