import { describe, expect, it } from 'vitest';

import {
  validationClaimResponseSchema,
  validationFailInputSchema,
  validationHeartbeatInputSchema,
  validationResultInputSchema,
  validationResultResponseSchema,
} from './validation-queue.ts';

const H = (c: string) => c.repeat(64);
const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const result = {
  attemptNo: 1,
  inputManifestDigest: H('a'),
  results: [{ ruleId: 'R-1', result: 'FAIL', required: true, observed: 'x', evidence: [{ fileRef: 's3://a/b.log', line: 4, fileSha256: H('b'), excerpt: 'boom' }] }],
};

describe('validation queue worker REST v0', () => {
  it('accepts a result with rule results and evidence', () => {
    expect(validationResultInputSchema.safeParse(result).success).toBe(true);
  });
  it.each([
    ['a worker verdict', { ...result, verdict: 'pass' }],
    ['an AI opinion field', { ...result, aiOpinion: 'fine' }],
    ['an unknown rule result value', { ...result, results: [{ ruleId: 'R', result: 'OK', required: true }] }],
    ['more than 20 evidence entries', { ...result, results: [{ ruleId: 'R', result: 'PASS', required: true, evidence: Array.from({ length: 21 }, () => result.results[0]?.evidence?.[0]) }] }],
    ['an excerpt over 2,000 characters', { ...result, results: [{ ruleId: 'R', result: 'PASS', required: true, evidence: [{ fileRef: 'a', line: 1, fileSha256: H('b'), excerpt: 'x'.repeat(2001) }] }] }],
  ])('refuses %s', (_label, input) => {
    expect(validationResultInputSchema.safeParse(input).success).toBe(false);
  });
  it('heartbeat and fail bodies carry the attempt number', () => {
    expect(validationHeartbeatInputSchema.safeParse({ attemptNo: 2 }).success).toBe(true);
    expect(validationHeartbeatInputSchema.safeParse({}).success).toBe(false);
    expect(validationFailInputSchema.safeParse({ attemptNo: 1, reason: 'validator crashed' }).success).toBe(true);
  });
  it('the result response names the server-computed verdict', () => {
    expect(validationResultResponseSchema.safeParse({ requestId: ID, attemptNo: 1, state: 'succeeded', verdict: 'incomplete', resultDigest: H('c'), ruleCount: 3 }).success).toBe(true);
    expect(validationResultResponseSchema.safeParse({ requestId: ID, attemptNo: 1, state: 'succeeded', verdict: 'ok', resultDigest: H('c'), ruleCount: 3 }).success).toBe(false);
  });
  const claimOf = (subject: { roundId: string | null; suiteRunItemId: string | null }) => ({
    request: {
      id: ID, ...subject, priority: 1, immediate: false, engineProfileRef: null, requestDigest: H('d'), attemptNo: 1, maxAttempts: 3,
      sampleSet: { files: [{ fileRef: 's3://a/b.log', order: 1, sha256: H('b') }], sourceOwner: 'fab-team' },
      sampleManifestDigest: H('e'), specPin: null,
    },
    attempt: { id: ID, attemptNo: 1 },
    leaseExpiresAt: '2026-11-09T01:05:00.000Z',
  });
  it.each([
    ['a Round request', { roundId: ID, suiteRunItemId: null }],
    ['a suite run item request', { roundId: null, suiteRunItemId: ID }],
  ])('the claim response carries the samples the worker must use: %s', (_label, subject) => {
    expect(validationClaimResponseSchema.safeParse(claimOf(subject)).success).toBe(true);
  });
  it.each([
    ['both subjects', { roundId: ID, suiteRunItemId: ID }],
    ['no subject', { roundId: null, suiteRunItemId: null }],
  ])('the claim response refuses %s', (_label, subject) => {
    expect(validationClaimResponseSchema.safeParse(claimOf(subject)).success).toBe(false);
  });
});
