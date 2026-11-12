import { describe, expect, it } from 'vitest';

import { validationOpinionInputSchema, validationOpinionResponseSchema, validationOpinionScaleSchema } from './validation-opinion.ts';

const H = (c: string) => c.repeat(64);
const body = { submissionId: 's-1', opinions: [{ itemKey: 'R-1', grade: 'high', mark: 'flag', note: 'ask the owner', evidence: [{ fileRef: 'a.log', line: 3, fileSha256: H('a') }] }] };

describe('validation opinion worker REST v0', () => {
  it('accepts a submission with and without optional fields', () => {
    expect(validationOpinionInputSchema.safeParse(body).success).toBe(true);
    expect(validationOpinionInputSchema.safeParse({ submissionId: 's', opinions: [{ itemKey: 'x', grade: 'g' }] }).success).toBe(true);
  });
  it.each([
    ['no opinions', { submissionId: 's', opinions: [] }],
    ['more than 500 opinions', { submissionId: 's', opinions: Array.from({ length: 501 }, (_, i) => ({ itemKey: `k${i}`, grade: 'g' })) }],
    ['no submissionId', { opinions: body.opinions }],
    ['a verdict field', { ...body, verdict: 'pass' }],
    ['an unknown item key', { submissionId: 's', opinions: [{ itemKey: 'x', grade: 'g', verdict: 'pass' }] }],
    ['a note over 1,000 characters', { submissionId: 's', opinions: [{ itemKey: 'x', grade: 'g', note: 'n'.repeat(1001) }] }],
    ['an excerpt on evidence', { submissionId: 's', opinions: [{ itemKey: 'x', grade: 'g', evidence: [{ fileRef: 'a', line: 1, fileSha256: H('a'), excerpt: 'log' }] }] }],
    ['more than 20 evidence entries', { submissionId: 's', opinions: [{ itemKey: 'x', grade: 'g', evidence: Array.from({ length: 21 }, () => ({ fileRef: 'a', line: 1, fileSha256: H('a') })) }] }],
  ])('refuses %s', (_label, input) => {
    expect(validationOpinionInputSchema.safeParse(input).success).toBe(false);
  });
  it('the response carries counts only', () => {
    expect(validationOpinionResponseSchema.safeParse({ requestId: '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10', attemptNo: 1, recorded: 2, duplicate: 0 }).success).toBe(true);
  });
  it('the scale declares at most 12 grades and 12 marks with lowercase keys', () => {
    expect(validationOpinionScaleSchema.safeParse({ grades: [{ key: 'high', label: 'High' }], marks: [] }).success).toBe(true);
    expect(validationOpinionScaleSchema.safeParse({ grades: [{ key: 'High', label: 'x' }], marks: [] }).success).toBe(false);
    expect(validationOpinionScaleSchema.safeParse({ grades: Array.from({ length: 13 }, (_, i) => ({ key: `g${i}`, label: '' })), marks: [] }).success).toBe(false);
  });
});
