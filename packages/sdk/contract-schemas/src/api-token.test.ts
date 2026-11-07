import { describe, expect, it } from 'vitest';

import {
  apiTokenPageSchema,
  issuePersonalApiTokenInputSchema,
  issueServiceApiTokenInputSchema,
  toJsonSchema,
} from './index.ts';

const ACTOR = '4b0f1a52-7c1e-4f0a-9d5e-3a1b2c3d4e5f';
const item = {
  id: ACTOR,
  kind: 'personal',
  name: 'ci',
  prefix: 'abcdef01',
  scopes: [],
  expiresAt: null,
  lastUsedAt: null,
  lastUsedIp: null,
  revokedAt: null,
  createdAt: '2026-11-07T00:00:00.000Z',
  createdBy: ACTOR,
  actorId: ACTOR,
  unusedWarning: false,
};

describe('API token issue input (the route validation, ADR-0116)', () => {
  it.each([
    ['no expiry', { name: 'ci', scopes: [] }],
    ['null expiry', { name: 'ci', scopes: [], expiresAt: null }],
    ['Z instant', { name: 'ci', scopes: [], expiresAt: '2027-01-01T00:00:00Z' }],
    ['offset instant', { name: ' ci ', scopes: ['workspace.read'], expiresAt: '2027-01-01T09:00:00+09:00' }],
  ])('accepts %s', (_label, input) => {
    expect(issuePersonalApiTokenInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['blank name', { name: '   ', scopes: [] }],
    ['empty name', { name: '', scopes: [] }],
    ['non-instant expiry', { name: 'ci', scopes: [], expiresAt: 'tomorrow' }],
    ['wall-clock expiry (no offset)', { name: 'ci', scopes: [], expiresAt: '2027-01-01T00:00:00' }],
    ['unknown key', { name: 'ci', scopes: [], extra: 1 }],
  ])('rejects %s', (_label, input) => {
    expect(issuePersonalApiTokenInputSchema.safeParse(input).success).toBe(false);
  });

  it('service input needs a UUID actorId', () => {
    const base = { name: 'worker', scopes: [], expiresAt: null };
    expect(issueServiceApiTokenInputSchema.safeParse({ ...base, actorId: ACTOR }).success).toBe(true);
    expect(issueServiceApiTokenInputSchema.safeParse({ ...base, actorId: 'not-an-id' }).success).toBe(false);
    expect(issueServiceApiTokenInputSchema.safeParse({ ...base, expiresAt: 'tomorrow', actorId: 'not-an-id' }).success).toBe(false);
    // The route's rule: any 8-4-4-4-12 hex id (seeded ids carry no RFC version bits).
    expect(issueServiceApiTokenInputSchema.safeParse({ ...base, actorId: '00000000-0000-0000-0000-000000000001' }).success).toBe(true);
  });

  it('the generated JSON Schema carries the date-time, id and non-blank name rules', () => {
    const props = toJsonSchema(issueServiceApiTokenInputSchema).properties as Record<string, Record<string, unknown>>;
    expect(typeof props.actorId?.pattern).toBe('string');
    expect(new RegExp(props.actorId?.pattern as string).test('00000000-0000-0000-0000-000000000001')).toBe(true);
    expect(JSON.stringify(props.expiresAt)).toContain('date-time');
    const namePattern = new RegExp(props.name?.pattern as string);
    expect(namePattern.test('   ')).toBe(false);
    expect(namePattern.test(' ci ')).toBe(true);
  });
});

describe('API token list page', () => {
  it('accepts items with a cursor or null, rejects a missing nextCursor', () => {
    expect(apiTokenPageSchema.safeParse({ items: [item], nextCursor: null }).success).toBe(true);
    expect(apiTokenPageSchema.safeParse({ items: [], nextCursor: 'abc' }).success).toBe(true);
    expect(apiTokenPageSchema.safeParse({ items: [item] }).success).toBe(false);
  });
});
