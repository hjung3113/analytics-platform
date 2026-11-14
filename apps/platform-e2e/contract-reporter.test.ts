import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import ContractReporter from './contract-reporter.ts';

test('report area retains outer contract and nested describe titles (#2010)', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'contract-reporter-'));
  try {
    const reporter = new ContractReporter({ outputDir });
    reporter.onBegin();
    const example = {
      id: 'nested', title: 'check', parent: { title: 'consumer' },
      titlePath: () => ['', 'chromium', 'contract.spec.ts', '06 §19', 'consumer', 'check'],
      outcome: () => 'expected',
    } as unknown as TestCase;
    reporter.onTestEnd(example, { attachments: [], retry: 0, status: 'passed' } as unknown as TestResult);
    reporter.onEnd({ status: 'passed' } as FullResult);
    const report = JSON.parse(readFileSync(join(outputDir, 'results.json'), 'utf8'));
    assert.equal(report.rows[0].area, '06 §19 › consumer');
    assert.match(readFileSync(join(outputDir, 'README.md'), 'utf8'), /06 §19 › consumer/);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
