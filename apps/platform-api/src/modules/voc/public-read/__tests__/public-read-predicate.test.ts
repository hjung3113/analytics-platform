// Object face of the public-read rule: the verdict matrix, no database. The agreement with the SQL face
// is pinned on one fixture in public-read-predicate.integration.test.ts.
import { describe, expect, it } from 'vitest';

import { type PublicReadRule, isVocPubliclyVisible } from '../rule.js';

const ME = 'a0000000-0000-4000-8000-000000000001';
const OTHER = 'a0000000-0000-4000-8000-000000000002';
const A = 'b0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const P = 'b0000000-0000-4000-8000-0000000000f0';

const rule = (over: Partial<PublicReadRule>): PublicReadRule => ({
  actorId: ME,
  scope: { kind: 'scoped', managedSystemIds: [] },
  platformManagedSystemId: null,
  ...over,
});

describe('isVocPubliclyVisible', () => {
  it.each([
    ['own VOC, no scope, no platform', rule({}), { primary_managed_system_id: A, reporter_id: ME }, true],
    ['foreign VOC, no scope, no platform', rule({}), { primary_managed_system_id: A, reporter_id: OTHER }, false],
    ['foreign VOC in a scoped system', rule({ scope: { kind: 'scoped', managedSystemIds: [A] } }), { primary_managed_system_id: A, reporter_id: OTHER }, true],
    ['foreign VOC outside the scoped systems', rule({ scope: { kind: 'scoped', managedSystemIds: [A] } }), { primary_managed_system_id: B, reporter_id: OTHER }, false],
    ['foreign VOC, scope all', rule({ scope: { kind: 'all' } }), { primary_managed_system_id: B, reporter_id: OTHER }, true],
    ['foreign VOC in 「플랫폼」', rule({ platformManagedSystemId: P }), { primary_managed_system_id: P, reporter_id: OTHER }, true],
    ['foreign VOC in 「플랫폼」 when the arm is off', rule({ platformManagedSystemId: null }), { primary_managed_system_id: P, reporter_id: OTHER }, false],
    ['foreign VOC outside 「플랫폼」 with the arm on', rule({ platformManagedSystemId: P }), { primary_managed_system_id: A, reporter_id: OTHER }, false],
  ] as const)('%s → %s', (_name, r, voc, expected) => {
    expect(isVocPubliclyVisible(r, voc)).toBe(expected);
  });
});
