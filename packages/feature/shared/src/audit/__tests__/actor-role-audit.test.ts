import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS, auditEventTypeSchema } from '../../enums/audit-events.js';

describe('actor_role_changed audit detail', () => {
  const schema = AUDIT_EVENT_DETAIL_SCHEMAS.actor_role_changed;

  it('is a registered event type', () => {
    expect(auditEventTypeSchema.parse('actor_role_changed')).toBe('actor_role_changed');
  });

  it('accepts before/after role with and without a reason', () => {
    expect(schema.safeParse({ before_role: 'user', after_role: 'admin' }).success).toBe(true);
    expect(
      schema.safeParse({ before_role: 'admin', after_role: 'user', reason: 'handover' }).success,
    ).toBe(true);
  });

  it.each([
    ['unchanged role', { before_role: 'admin', after_role: 'admin' }],
    ['unknown role', { before_role: 'user', after_role: 'root' }],
    ['missing after_role', { before_role: 'user' }],
    ['empty reason', { before_role: 'user', after_role: 'admin', reason: '' }],
    ['extra key (email)', { before_role: 'user', after_role: 'admin', email: 'a@b.c' }],
  ])('rejects %s', (_label, detail) => {
    expect(schema.safeParse(detail).success).toBe(false);
  });
});
