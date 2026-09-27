import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Per-contract pass/fail report with evidence screenshots (#44). Each test is one contract check;
 * its `describe` title is the contract area. Screenshots attached as `evidence:*` are copied next to
 * the report so the folder can be uploaded as a CI artifact and read without Playwright.
 */
type Row = { area: string; check: string; status: string; error: string | null; evidence: string[] };

export default class ContractReporter implements Reporter {
  private readonly outputDir: string;
  private readonly rows = new Map<string, Row>();

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = resolve(options.outputDir ?? './contract-report');
  }

  onBegin() {
    rmSync(this.outputDir, { recursive: true, force: true });
    mkdirSync(join(this.outputDir, 'evidence'), { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const evidence: string[] = [];
    result.attachments.filter(a => a.name.startsWith('evidence:') && (a.path || a.body)).forEach((a, i) => {
      const file = `${test.id}-${i}-${slug(a.name.slice('evidence:'.length))}.png`;
      const target = join(this.outputDir, 'evidence', file);
      if (a.path) copyFileSync(a.path, target); else writeFileSync(target, a.body!);
      evidence.push(`evidence/${file}`);
    });
    // Retries overwrite: the last attempt is the verdict.
    this.rows.set(test.id, {
      area: test.parent.title,
      check: test.title,
      status: result.status,
      error: result.error?.message?.split('\n')[0] ?? null,
      evidence,
    });
  }

  onEnd(result: FullResult) {
    const rows = [...this.rows.values()];
    const passed = rows.filter(r => r.status === 'passed').length;
    const mark = (s: string) => (s === 'passed' ? '✅ 통과' : s === 'skipped' ? '⏭ 건너뜀' : '❌ 실패');
    const lines = [
      '# 플랫폼 계약 검사 결과',
      '',
      `전체 ${rows.length}건 중 통과 ${passed}건 — 실행 결과 \`${result.status}\`, ${new Date().toISOString()}`,
      '',
      '| 영역 | 검사 | 결과 | 증거 |',
      '| --- | --- | --- | --- |',
      ...rows.map(r => `| ${r.area} | ${r.check}${r.error ? `<br><sub>${escape(r.error)}</sub>` : ''} | ${mark(r.status)} | ${r.evidence.map((e, i) => `[${i + 1}](${e})`).join(' ')} |`),
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
