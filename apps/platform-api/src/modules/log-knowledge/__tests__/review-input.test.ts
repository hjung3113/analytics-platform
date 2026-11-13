import { describe, expect, it } from 'vitest';

import {
  itemVersionErrors,
  parseReviewInput,
  reviewerAuthorship,
  reviseBaseError,
  reviseTargetError,
  validateReviewInput,
} from '../domain/review-input.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const DIGEST = 'a'.repeat(64);
const fe = (errors: readonly { path: readonly string[]; code: string }[]) => errors.map((e) => `${e.path.join('.')}:${e.code}`);

describe('review input (#1198 b)', () => {
  it('accepts an approval with and without the optional fields', () => {
    expect(validateReviewInput('draftApprove', { id: ID, approvedDigest: DIGEST })).toEqual([]);
    const parsed = parseReviewInput('draftApprove', { id: ID, approvedDigest: DIGEST, expectedItemVersion: 3, rationale: '  ok  ' });
    expect(parsed.ok && parsed.value).toMatchObject({ expectedItemVersion: 3, rationale: 'ok' });
  });

  it.each([
    ['a missing digest', { id: ID }, ['approvedDigest:required']],
    ['an upper-case digest', { id: ID, approvedDigest: 'A'.repeat(64) }, ['approvedDigest:malformed']],
    ['a short digest', { id: ID, approvedDigest: 'abc' }, ['approvedDigest:malformed']],
    ['a zero item version', { id: ID, approvedDigest: DIGEST, expectedItemVersion: 0 }, ['expectedItemVersion:malformed']],
    ['a fractional item version', { id: ID, approvedDigest: DIGEST, expectedItemVersion: 1.5 }, ['expectedItemVersion:malformed']],
    ['a string item version', { id: ID, approvedDigest: DIGEST, expectedItemVersion: '2' }, ['expectedItemVersion:malformed']],
    ['an explicit null item version', { id: ID, approvedDigest: DIGEST, expectedItemVersion: null }, ['expectedItemVersion:malformed']],
    ['a rationale over 2000', { id: ID, approvedDigest: DIGEST, rationale: 'x'.repeat(2001) }, ['rationale:too_long']],
    ['a bad id', { id: 'nope', approvedDigest: DIGEST }, ['id:malformed']],
  ])('approve refuses %s', (_label, input, expected) => {
    expect(fe(validateReviewInput('draftApprove', input))).toEqual(expected);
  });

  it.each(['draftReject', 'draftRequestChanges'] as const)('%s requires a rationale', (op) => {
    expect(fe(validateReviewInput(op, { id: ID }))).toEqual(['rationale:required']);
    expect(fe(validateReviewInput(op, { id: ID, rationale: '   ' }))).toEqual(['rationale:required']);
    expect(validateReviewInput(op, { id: ID, rationale: 'why' })).toEqual([]);
  });

  it('expectedItemVersion: required for revise, refused for create', () => {
    expect(fe(itemVersionErrors('revise', undefined))).toEqual(['expectedItemVersion:required']);
    expect(itemVersionErrors('revise', 2)).toEqual([]);
    expect(fe(itemVersionErrors('create', 2))).toEqual(['expectedItemVersion:malformed']);
    expect(itemVersionErrors('create', undefined)).toEqual([]);
  });
});

describe('reviewerAuthorship', () => {
  it.each([
    [[], 'none'],
    [['session'], 'session'],
    [['token'], 'token'],
    [['session', 'token'], 'token'],
  ] as const)('%j → %s', (auths, expected) => {
    expect(reviewerAuthorship(new Set(auths))).toBe(expected);
  });
});

describe('reviseTargetError', () => {
  it('a missing target is target_missing (the draft FK is RESTRICT, so only a stub reaches it)', () => {
    expect(reviseTargetError(null, 1)).toEqual({ path: ['id'], code: 'target_missing' });
  });
  it('an archived target is archived, before the version', () => {
    expect(reviseTargetError({ publicationState: 'archived', rowVersion: 9 }, 1)).toEqual({ path: ['id'], code: 'archived' });
  });
  it('a moved target is stale on expectedItemVersion', () => {
    expect(reviseTargetError({ publicationState: 'published', rowVersion: 3 }, 2)).toEqual({ path: ['expectedItemVersion'], code: 'stale' });
  });
  it('a matching published target passes', () => {
    expect(reviseTargetError({ publicationState: 'published', rowVersion: 3 }, 3)).toBeNull();
  });
});

describe('reviseBaseError', () => {
  it('a newer latest revision than the draft base is base_stale', () => {
    expect(reviseBaseError({ latestRevisionNo: 4 }, 3)).toEqual({ path: ['id'], code: 'base_stale' });
  });
  it('the same revision passes', () => {
    expect(reviseBaseError({ latestRevisionNo: 3 }, 3)).toBeNull();
  });
});
