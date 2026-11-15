import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS, auditEventTypeSchema } from '../../enums/audit-events.js';

describe('platform_notice_* audit detail', () => {
  it.each(['platform_notice_created', 'platform_notice_updated', 'platform_notice_deleted'])(
    '%s is a registered event type',
    (type) => {
      expect(auditEventTypeSchema.parse(type)).toBe(type);
    },
  );

  it('accepts the revision shape of each event', () => {
    const d = AUDIT_EVENT_DETAIL_SCHEMAS;
    expect(d.platform_notice_created.safeParse({ revision_after: 1, correlation_id: 'c' }).success).toBe(true);
    expect(
      d.platform_notice_updated.safeParse({ revision_before: 1, revision_after: 2, correlation_id: 'c' })
        .success,
    ).toBe(true);
    expect(d.platform_notice_deleted.safeParse({ revision_before: 2, correlation_id: 'c' }).success).toBe(true);
  });

  it.each([
    ['created with revision_before', 'platform_notice_created', { revision_before: 1, revision_after: 1, correlation_id: 'c' }],
    ['created without revision_after', 'platform_notice_created', { correlation_id: 'c' }],
    ['updated without revision_before', 'platform_notice_updated', { revision_after: 2, correlation_id: 'c' }],
    ['deleted with revision_after', 'platform_notice_deleted', { revision_before: 1, revision_after: 2, correlation_id: 'c' }],
    ['missing correlation_id', 'platform_notice_deleted', { revision_before: 1 }],
    ['notice prose (title)', 'platform_notice_updated', { revision_before: 1, revision_after: 2, correlation_id: 'c', title: 'x' }],
  ] as const)('rejects %s', (_label, type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
