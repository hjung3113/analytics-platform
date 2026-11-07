import { describe, expect, it } from 'vitest';
import {
  SCHEMA_FILES,
  SOURCE_READ_ROWS_MAX,
  SOURCE_READ_ROW_CHARS_MAX,
  SOURCE_READ_TIME_BUDGET_MS,
  SOURCE_READ_WINDOW_MAX,
  sourceDescribeResponseSchema,
  sourceParsedResponseSchema,
  sourceSearchRequestSchema,
  sourceSampleSetSchema,
  sourceSearchResponseSchema,
  sourceTopViewResponseSchema,
  sourceWindowRequestSchema,
  sourceWindowResponseSchema,
} from './index.ts';
import { toJsonSchema } from './export.ts';

const artifact = (schema: Parameters<typeof toJsonSchema>[0] | undefined) => toJsonSchema(schema as Parameters<typeof toJsonSchema>[0]);

const sha = 'a'.repeat(64);
const sampleSet = { sourceOwner: 'owner-1', files: [{ fileRef: 'f1', order: 1, sha256: sha }] };
const row = { fileRef: 'f1', fileOrder: 1, line: 1, text: 'x', truncated: false, timestamp: null, timeReversal: false, synthetic: true };

describe('SourceReadPort v0 schemas', () => {
  it('pins the start limits of design 3.1', () => {
    expect([SOURCE_READ_ROWS_MAX, SOURCE_READ_ROW_CHARS_MAX, SOURCE_READ_WINDOW_MAX, SOURCE_READ_TIME_BUDGET_MS]).toEqual([200, 8000, 100, 10_000]);
  });

  it('registers every schema as a generated file', () => {
    for (const name of ['sourceSearchRequest', 'sourceSearchResponse', 'sourceWindowResponse', 'sourceParsedResponse', 'sourcePeriodsResponse', 'sourceTopViewResponse', 'sourceDescribeResponse']) {
      expect(SCHEMA_FILES[name]).toBeDefined();
    }
  });

  it.each([
    ['limit above 200', { sampleSet, query: {}, cursor: null, limit: 201 }],
    ['limit 0', { sampleSet, query: {}, cursor: null, limit: 0 }],
    ['unknown key', { sampleSet, query: {}, cursor: null, limit: 1, userId: 'x' }],
    ['empty file list', { sampleSet: { ...sampleSet, files: [] }, query: {}, cursor: null, limit: 1 }],
    ['bad sha', { sampleSet: { ...sampleSet, files: [{ fileRef: 'f', order: 1, sha256: 'zz' }] }, query: {}, cursor: null, limit: 1 }],
  ])('refuses a search request: %s', (_name, input) => {
    expect(sourceSearchRequestSchema.safeParse(input).success).toBe(false);
  });

  it('accepts a valid search request', () => {
    expect(sourceSearchRequestSchema.safeParse({ sampleSet, query: { text: 'a' }, cursor: null, limit: 200 }).success).toBe(true);
  });

  it('refuses a window above 100 on either side', () => {
    const base = { sourceOwner: 'o', fileRef: 'f', line: 1, before: 0, after: 0 };
    expect(sourceWindowRequestSchema.safeParse(base).success).toBe(true);
    expect(sourceWindowRequestSchema.safeParse({ ...base, before: 101 }).success).toBe(false);
    expect(sourceWindowRequestSchema.safeParse({ ...base, after: 101 }).success).toBe(false);
  });

  it('keeps unsupported a stated state with a code reason, and refuses free text', () => {
    expect(sourceParsedResponseSchema.safeParse({ status: 'unsupported', reason: 'parser_not_connected' }).success).toBe(true);
    expect(sourceParsedResponseSchema.safeParse({ status: 'unsupported', reason: 'the parser said: <body>' }).success).toBe(false);
  });

  it('refuses rows or a row text over the limits, and rows on a non-ok state', () => {
    expect(sourceSearchResponseSchema.safeParse({ status: 'ok', rows: [row], nextCursor: null, partial: false }).success).toBe(true);
    expect(sourceSearchResponseSchema.safeParse({ status: 'ok', rows: [{ ...row, text: 'x'.repeat(8001) }], nextCursor: null, partial: false }).success).toBe(false);
    expect(sourceSearchResponseSchema.safeParse({ status: 'ok', rows: Array.from({ length: 201 }, () => row), nextCursor: null, partial: false }).success).toBe(false);
    expect(sourceSearchResponseSchema.safeParse({ status: 'permission_denied', rows: [row] }).success).toBe(false);
  });

  it('allows only http(s) Top View urls', () => {
    expect(sourceTopViewResponseSchema.safeParse({ status: 'ok', url: 'https://top.example/v?x=1', synthetic: true }).success).toBe(true);
    expect(sourceTopViewResponseSchema.safeParse({ status: 'ok', url: 'javascript:alert(1)', synthetic: false }).success).toBe(false);
  });

  it('describe reports limits within the platform start values', () => {
    const ok = { status: 'ok', available: true, capabilities: ['searchRecords'], limits: { maxRows: 200, maxRowChars: 8000, maxWindow: 100, timeBudgetMs: 10_000 }, synthetic: true };
    expect(sourceDescribeResponseSchema.safeParse(ok).success).toBe(true);
    expect(sourceDescribeResponseSchema.safeParse({ ...ok, limits: { ...ok.limits, maxRows: 201 } }).success).toBe(false);
  });

  const file = (fileRef: string, order: number) => ({ fileRef, order, sha256: sha });
  it.each([
    ['order 0', { sourceOwner: 'o', files: [file('a', 0)] }],
    ['order beyond n', { sourceOwner: 'o', files: [file('a', 2)] }],
    ['duplicate order', { sourceOwner: 'o', files: [file('a', 1), file('b', 1)] }],
    ['gap in orders', { sourceOwner: 'o', files: [file('a', 1), file('b', 3)] }],
    ['duplicate file ref', { sourceOwner: 'o', files: [file('a', 1), file('a', 2)] }],
    ['untrimmed file ref', { sourceOwner: 'o', files: [file(' a', 1)] }],
    ['untrimmed owner', { sourceOwner: 'o ', files: [file('a', 1)] }],
    ['control character in file ref', { sourceOwner: 'o', files: [file('a\u0007b', 1)] }],
    ['NUL in owner', { sourceOwner: 'o\u0000', files: [file('a', 1)] }],
    ['C1 control in file ref', { sourceOwner: 'o', files: [file('a\u0085', 1)] }],
    ['lone surrogate in file ref', { sourceOwner: 'o', files: [file('a\ud800', 1)] }],
    ['blank file ref', { sourceOwner: 'o', files: [file('  ', 1)] }],
    ['file ref over 1024 code points', { sourceOwner: 'o', files: [file('a'.repeat(1025), 1)] }],
  ])('refuses a sample set the lifecycle contract refuses: %s', (_name, input) => {
    expect(sourceSampleSetSchema.safeParse(input).success).toBe(false);
  });

  it('accepts a sample set in any file order as long as orders are 1..n once, and counts code points', () => {
    expect(sourceSampleSetSchema.safeParse({ sourceOwner: 'o', files: [file('b', 2), file('a', 1)] }).success).toBe(true);
    expect(sourceSampleSetSchema.safeParse({ sourceOwner: 'o', files: [file('😀'.repeat(1024), 1)] }).success).toBe(true);
  });

  it('refuses a window whose before + after + 1 is above the 200-row cap, and a response above 200 rows', () => {
    const base = { sourceOwner: 'o', fileRef: 'f', line: 1 };
    expect(sourceWindowRequestSchema.safeParse({ ...base, before: 100, after: 99 }).success).toBe(true);
    expect(sourceWindowRequestSchema.safeParse({ ...base, before: 100, after: 100 }).success).toBe(false);
    expect(sourceWindowResponseSchema.safeParse({ status: 'ok', rows: Array.from({ length: 200 }, () => row), truncated: false }).success).toBe(true);
    expect(sourceWindowResponseSchema.safeParse({ status: 'ok', rows: Array.from({ length: 201 }, () => row), truncated: false }).success).toBe(false);
    expect(JSON.stringify(artifact(SCHEMA_FILES.sourceWindowResponse))).toContain('"maxItems":200');
  });

  it('enforces the metadata the JSON artifacts declare: 20 context keys, distinct capabilities', () => {
    const context = (n: number) => Object.fromEntries(Array.from({ length: n }, (_u, i) => [`k${i}`, 'v']));
    const search = (n: number) => ({ sampleSet, query: { context: context(n) }, cursor: null, limit: 1 });
    expect(sourceSearchRequestSchema.safeParse(search(20)).success).toBe(true);
    expect(sourceSearchRequestSchema.safeParse(search(21)).success).toBe(false);
    expect(JSON.stringify(artifact(SCHEMA_FILES.sourceSearchRequest))).toContain('"maxProperties":20');
    const ok = { status: 'ok', available: true, capabilities: ['searchRecords', 'searchRecords'], limits: { maxRows: 200, maxRowChars: 8000, maxWindow: 100, timeBudgetMs: 10_000 }, synthetic: true };
    expect(sourceDescribeResponseSchema.safeParse(ok).success).toBe(false);
    expect(JSON.stringify(artifact(SCHEMA_FILES.sourceDescribeResponse))).toContain('"uniqueItems":true');
  });
});
