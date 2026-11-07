import { describe, expect, it } from 'vitest';

import { logExplorerSourceReadDetailSchema } from '../log-explorer.js';

const ok = {
  endpoint: 'records',
  sourceOwner: 'synthetic-owner',
  sampleSetDigest: 'a'.repeat(64),
  fileCount: 2,
  filterKeys: ['text', 'context.job'],
  rowCount: 10,
  bytes: 1234,
  result: 'ok',
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

  it('refuses an unknown result code', () => {
    expect(logExplorerSourceReadDetailSchema.safeParse({ ...ok, result: 'Source said: LEAK' }).success).toBe(false);
  });
});
