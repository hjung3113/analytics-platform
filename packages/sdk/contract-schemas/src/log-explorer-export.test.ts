import { describe, expect, it } from 'vitest';

import { EXPORT_BYTES_MAX, EXPORT_DAILY_MAX, EXPORT_ROWS_MAX, TOKEN_DAILY_BODY_BUDGET_BYTES, exportErrorSchema, exportRequestSchema } from './index.ts';

const sampleSet = { sourceOwner: 'owner-a', files: [{ fileRef: 'a.log', order: 1, sha256: 'a'.repeat(64) }] };
const ok = { sampleSet, query: { text: 'x' }, range: { rows: 100 }, format: 'csv' };

describe('log explorer export request (v0)', () => {
  it('holds the design §4.1 start values', () => {
    expect([EXPORT_ROWS_MAX, EXPORT_BYTES_MAX, TOKEN_DAILY_BODY_BUDGET_BYTES, EXPORT_DAILY_MAX]).toEqual([10_000, 5 * 1024 * 1024, 50 * 1024 * 1024, 20]);
  });

  it('accepts a sample set or an investigation id, in csv or jsonl', () => {
    expect(exportRequestSchema.safeParse(ok).success).toBe(true);
    expect(exportRequestSchema.safeParse({ ...ok, format: 'jsonl' }).success).toBe(true);
    const { sampleSet: _unused, ...withoutSet } = ok;
    expect(exportRequestSchema.safeParse({ ...withoutSet, investigationId: '00000000-0000-0000-0000-000000000001' }).success).toBe(true);
  });

  it.each([
    ['both sources', { ...ok, investigationId: '00000000-0000-0000-0000-000000000001' }],
    ['neither source', { query: {}, range: { rows: 1 }, format: 'csv' }],
    ['another format', { ...ok, format: 'xlsx' }],
    ['no rows', { ...ok, range: { rows: 0 } }],
    ['an extra key', { ...ok, extra: 1 }],
  ])('refuses %s', (_name, body) => {
    expect(exportRequestSchema.safeParse(body).success).toBe(false);
  });

  it('lets a range above the export limit through the schema: the server refuses it as range_too_large, not a validation error', () => {
    expect(exportRequestSchema.safeParse({ ...ok, range: { rows: EXPORT_ROWS_MAX + 1 } }).success).toBe(true);
  });

  it('the refusal body is a code and a short message', () => {
    expect(exportErrorSchema.safeParse({ code: 'explorer.range_too_large', message: 'too many rows' }).success).toBe(true);
    expect(exportErrorSchema.safeParse({ code: 'explorer.range_too_large', message: 'x', detail: 'LEAK' }).success).toBe(false);
  });
});
