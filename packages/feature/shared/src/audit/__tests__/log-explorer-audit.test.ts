import { describe, expect, it } from 'vitest';

import { logExplorerExportDetailSchema, logExplorerSourceReadDetailSchema } from '../log-explorer.js';

const ok = {
  endpoint: 'records',
  sourceOwner: 'synthetic-owner',
  sampleSetDigest: 'a'.repeat(64),
  fileCount: 2,
  filterKeys: ['text', 'context.job'],
  rowCount: 10,
  bytes: 1234,
  result: 'ok',
  viaToken: false,
};

describe('explorer.source.read audit detail', () => {
  it('accepts the body-free shape', () => {
    expect(logExplorerSourceReadDetailSchema.parse(ok)).toEqual(ok);
    expect(logExplorerSourceReadDetailSchema.parse({ ...ok, sampleSetDigest: null, endpoint: 'window' }).sampleSetDigest).toBeNull();
  });

  it.each([
    ['a row body', { text: 'LEAK' }],
    ['filter values', { filter: { text: 'LEAK' } }],
    ['a file reference', { fileRef: 'a.log' }],
  ])('refuses %s', (_name, extra) => {
    expect(logExplorerSourceReadDetailSchema.safeParse({ ...ok, ...extra }).success).toBe(false);
  });

  it('counts the Source owner in code points: 101 non-BMP characters pass', () => {
    expect(logExplorerSourceReadDetailSchema.safeParse({ ...ok, sourceOwner: '😀'.repeat(101) }).success).toBe(true);
  });

  it('refuses an unknown result code', () => {
    expect(logExplorerSourceReadDetailSchema.safeParse({ ...ok, result: 'Source said: LEAK' }).success).toBe(false);
  });
});

describe('explorer.export audit detail', () => {
  const exp = {
    sourceOwner: 'synthetic-owner',
    sampleSetDigest: 'a'.repeat(64),
    fileCount: 2,
    filterKeys: ['text'],
    format: 'csv',
    rowCount: 10,
    bytes: 1234,
    result: 'ok',
    viaToken: true,
  };

  it('accepts the body-free shape', () => {
    expect(logExplorerExportDetailSchema.parse(exp)).toEqual(exp);
  });

  it.each([
    ['a row body', { text: 'LEAK' }],
    ['filter values', { filter: { text: 'LEAK' } }],
    ['a file reference', { fileRef: 'a.log' }],
  ])('refuses %s', (_name, extra) => {
    expect(logExplorerExportDetailSchema.safeParse({ ...exp, ...extra }).success).toBe(false);
  });

  it('counts the Source owner in code points like the read audit: 101 non-BMP characters pass, 201 do not', () => {
    expect(logExplorerExportDetailSchema.safeParse({ ...exp, sourceOwner: '😀'.repeat(101) }).success).toBe(true);
    expect(logExplorerExportDetailSchema.safeParse({ ...exp, sourceOwner: '😀'.repeat(201) }).success).toBe(false);
  });

  it('accepts the body-free shape of a request that names no Source owner (malformed body, investigation id)', () => {
    const none = { ...exp, sourceOwner: null, sampleSetDigest: null, fileCount: 0, filterKeys: [], format: null, rowCount: 0, bytes: 0, result: 'invalid_request' };
    expect(logExplorerExportDetailSchema.parse(none)).toEqual(none);
  });

  it('refuses a free-text result and more rows than the export limit', () => {
    expect(logExplorerExportDetailSchema.safeParse({ ...exp, result: 'Source said: LEAK' }).success).toBe(false);
    expect(logExplorerExportDetailSchema.safeParse({ ...exp, rowCount: 10_001 }).success).toBe(false);
  });
});
