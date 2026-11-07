import { describe, expect, it } from 'vitest';
import type { SourceRow } from '@ap/contract-schemas';

import { normalizeEvidenceRef, normalizeEvidenceRefs } from '../domain/evidence-ref.js';
import { clampRowLimit, clampTimeBudgetMs, clampWindowSide, effectiveLimits, truncateRowText } from '../domain/limits.js';
import { isInSourceOrder, markTimeReversals } from '../domain/time-reversal.js';

const sha = 'AB'.repeat(32);
const row = (line: number, timestamp: string | null, fileOrder = 0): SourceRow => ({ fileRef: 'f', fileOrder, line, text: 't', truncated: false, timestamp, timeReversal: false, synthetic: true });

describe('EvidenceRef', () => {
  it('normalises case, trims the note and keeps only the four keys', () => {
    expect(normalizeEvidenceRef({ fileRef: 'f', line: 3, fileSha256: sha, note: '  hi ' })).toEqual({ ok: true, value: { fileRef: 'f', line: 3, fileSha256: sha.toLowerCase(), note: 'hi' } });
  });
  it.each([
    ['text key', { fileRef: 'f', line: 1, fileSha256: sha, text: 'body' }, 'unknown_key'],
    ['excerpt key', { fileRef: 'f', line: 1, fileSha256: sha, excerpt: 'body' }, 'unknown_key'],
    ['line 0', { fileRef: 'f', line: 0, fileSha256: sha }, 'line'],
    ['fractional line', { fileRef: 'f', line: 1.5, fileSha256: sha }, 'line'],
    ['blank fileRef', { fileRef: ' ', line: 1, fileSha256: sha }, 'file_ref'],
    ['short sha', { fileRef: 'f', line: 1, fileSha256: 'ab' }, 'file_sha256'],
    ['long note', { fileRef: 'f', line: 1, fileSha256: sha, note: 'x'.repeat(501) }, 'note'],
  ])('refuses %s', (_n, input, error) => {
    expect(normalizeEvidenceRef(input)).toEqual({ ok: false, error });
  });
  it('limits the list to 100 and refuses a duplicate position', () => {
    const one = { fileRef: 'f', line: 1, fileSha256: sha };
    expect(normalizeEvidenceRefs(Array.from({ length: 101 }, (_x, i) => ({ ...one, line: i + 1 })))).toMatchObject({ ok: false, error: 'too_many' });
    expect(normalizeEvidenceRefs([one, one])).toMatchObject({ ok: false, error: 'duplicate', index: 1 });
    expect(normalizeEvidenceRefs([one, { ...one, line: 2 }])).toMatchObject({ ok: true });
  });
});

describe('limits', () => {
  it('never lets a declared limit exceed the platform start values', () => {
    expect(effectiveLimits({ maxRows: 5000, maxRowChars: 99_999, maxWindow: 1000, timeBudgetMs: 60_000 })).toEqual({ maxRows: 200, maxRowChars: 8000, maxWindow: 100, timeBudgetMs: 10_000 });
    expect(effectiveLimits(undefined)).toEqual({ maxRows: 200, maxRowChars: 8000, maxWindow: 100, timeBudgetMs: 10_000 });
  });
  it('clamps row, window and budget asks', () => {
    expect(clampRowLimit(0)).toBe(1);
    expect(clampRowLimit(999)).toBe(200);
    expect(clampRowLimit(Number.NaN)).toBe(1);
    expect(clampWindowSide(-3)).toBe(0);
    expect(clampWindowSide(500)).toBe(100);
    expect(clampTimeBudgetMs(undefined)).toBe(10_000);
    expect(clampTimeBudgetMs(60_000)).toBe(10_000);
    expect(clampTimeBudgetMs(0)).toBe(1);
  });
  it('truncates at the limit, flags it, and does not split a surrogate pair', () => {
    expect(truncateRowText('abc', 8000)).toEqual({ text: 'abc', truncated: false });
    expect(truncateRowText('x'.repeat(8001), 8000)).toMatchObject({ truncated: true });
    expect(truncateRowText('x'.repeat(8001), 8000).text).toHaveLength(8000);
    const cut = truncateRowText(`${'x'.repeat(7999)}😀`, 8000);
    expect(cut.truncated).toBe(true);
    expect(cut.text).toBe('x'.repeat(7999));
  });
});

describe('time reversal', () => {
  it('marks a reversal and keeps the order', () => {
    const rows = [row(1, '2026-01-01T00:00:05'), row(2, '2026-01-01T00:00:01'), row(3, '2026-01-01T00:00:09')];
    const marked = markTimeReversals(rows);
    expect(marked.map((r) => r.line)).toEqual([1, 2, 3]);
    expect(marked.map((r) => r.timeReversal)).toEqual([false, true, false]);
  });
  it('does not mark incomparable or missing timestamps, nor the first row', () => {
    expect(markTimeReversals([row(1, null), row(2, 'garbage'), row(3, '2026-01-01T00:00:00')]).map((r) => r.timeReversal)).toEqual([false, false, false]);
  });
  it('compares against the previous page when given', () => {
    expect(markTimeReversals([row(5, '2026-01-01T00:00:00')], '2026-01-01T00:00:09')[0]?.timeReversal).toBe(true);
  });
  it('knows source order: file order then line, strictly increasing', () => {
    expect(isInSourceOrder([row(1, null, 0), row(2, null, 0), row(1, null, 1)])).toBe(true);
    expect(isInSourceOrder([row(2, null, 0), row(1, null, 0)])).toBe(false);
    expect(isInSourceOrder([row(1, null, 1), row(9, null, 0)])).toBe(false);
  });
});
