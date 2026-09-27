import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Per-contract pass/fail report with evidence screenshots (#44). Each test is one contract check;
 * its `describe` title is the contract area. Screenshots attached as `evidence:*` — and Playwright's automatic
 * failure screenshot — are copied next to the report so the folder can be read without Playwright.
 * Every attempt is kept: a failure followed by a passing retry is reported as flaky, never as a clean pass.
 */
type Attempt = { retry: number; status: TestResult['status']; error: string | null; evidence: string[] };
type Row = { area: string; check: string; outcome: ReturnType<TestCase['outcome']>; attempts: Attempt[] };

const MARK: Record<Row['outcome'], string> = {
  expected: '✅ 통과',
  flaky: '⚠️ 불안정(재시도 후 통과)',
  unexpected: '❌ 실패',
  skipped: '⏭ 건너뜀',
};

export default class ContractReporter implements Reporter {
  private readonly outputDir: string;
  private readonly tests = new Map<string, { test: TestCase; attempts: Attempt[] }>();

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = resolve(options.outputDir ?? './contract-report');
  }

  onBegin() {
    rmSync(this.outputDir, { recursive: true, force: true });
    mkdirSync(join(this.outputDir, 'evidence'), { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const evidence: string[] = [];
    result.attachments
      .filter(a => (a.name.startsWith('evidence:') || a.name === 'screenshot') && (a.path || a.body))
      .forEach((a, i) => {
        const label = a.name === 'screenshot' ? 'failure' : a.name.slice('evidence:'.length);
        const file = `${test.id}-r${result.retry}-${i}-${slug(label)}.png`;
        const target = join(this.outputDir, 'evidence', file);
        if (a.path) copyFileSync(a.path, target); else writeFileSync(target, a.body!);
        evidence.push(`evidence/${file}`);
      });
    const entry = this.tests.get(test.id) ?? { test, attempts: [] };
    entry.attempts.push({ retry: result.retry, status: result.status, error: result.error?.message?.replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0] ?? null, evidence });
    this.tests.set(test.id, entry);
  }

  onEnd(result: FullResult) {
    const rows: Row[] = [...this.tests.values()].map(({ test, attempts }) => ({
      area: test.parent.title, check: test.title, outcome: test.outcome(), attempts,
    }));
    const count = (o: Row['outcome']) => rows.filter(r => r.outcome === o).length;
    const lines = [
      '# 플랫폼 계약 검사 결과',
      '',
      `전체 ${rows.length}건 — 통과 ${count('expected')} · 불안정 ${count('flaky')} · 실패 ${count('unexpected')} · 건너뜀 ${count('skipped')}. 실행 결과 \`${result.status}\`, ${new Date().toISOString()}`,
      '',
      '| 영역 | 검사 | 결과 | 증거 |',
      '| --- | --- | --- | --- |',
      ...rows.map(r => {
        const multi = r.attempts.length > 1;
        const errors = r.attempts.filter(a => a.error).map(a => `<br><sub>${multi ? `시도 ${a.retry + 1}: ` : ''}${escape(a.error!)}</sub>`).join('');
        const shots = r.attempts.flatMap(a => a.evidence.map(e => ({ e, retry: a.retry })))
          .map(({ e, retry }, i) => `[${multi ? `시도${retry + 1}-` : ''}${i + 1}](${e})`).join(' ');
        return `| ${r.area} | ${r.check}${errors} | ${MARK[r.outcome]} | ${shots} |`;
      }),
      '',
    ];
    writeFileSync(join(this.outputDir, 'README.md'), lines.join('\n'));
    writeFileSync(join(this.outputDir, 'results.json'), JSON.stringify({ status: result.status, rows }, null, 2));
  }

  printsToStdio() { return false; }
}

function slug(text: string) {
  return text.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'shot';
}

function escape(text: string) {
  return text.replace(/\|/g, '\\|').replace(/</g, '&lt;');
}
