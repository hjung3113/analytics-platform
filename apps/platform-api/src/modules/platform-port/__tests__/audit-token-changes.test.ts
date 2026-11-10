import { describe, expect, it } from 'vitest';

import type { PlatformAuditRow } from '../../core/audit/index.js';
import { toAuditEvent } from '../audit-service.js';

const row = (over: Partial<PlatformAuditRow>): PlatformAuditRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  at: '2026-11-10T00:00:00.000Z',
  actor: 'admin-a',
  actorType: 'user',
  eventType: 'api_token.issue',
  subjectType: 'api_token',
  subjectId: '22222222-2222-4222-8222-222222222222',
  ...over,
});

describe('toAuditEvent changes (#1690)', () => {
  it('releases the scopes of an issued token as [null, "a, b"]', () => {
    expect(toAuditEvent(row({ scopes: ['voc.read', 'task.read'] })).changes).toEqual({
      scopes: [null, 'voc.read, task.read'],
    });
  });

  it('releases the scopes of a revoked token as ["a, b", null]', () => {
    expect(
      toAuditEvent(row({ eventType: 'api_token.revoke', scopes: ['voc.read', 'task.read'] })).changes,
    ).toEqual({ scopes: ['voc.read, task.read', null] });
  });

  it.each([
    ['a revoke row from before #1690', row({ eventType: 'api_token.revoke' })],
    ['an empty scope list', row({ scopes: [] })],
    ['another subject carrying scopes', row({ subjectType: 'voc', eventType: 'voc_created', scopes: ['x'] })],
    ['a non-issue/revoke token event', row({ eventType: 'api_token.auth_failed', scopes: ['x'] })],
  ])('has no changes key for %s', (_name, input) => {
    expect(Object.hasOwn(toAuditEvent(input), 'changes')).toBe(false);
  });
});
