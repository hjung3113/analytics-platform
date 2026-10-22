import { describe, expect, it } from 'vitest';
import { FO_API_PREFIX, realDevProxy } from './real-dev-proxy';

const origin = 'http://127.0.0.1:3011';

describe('real-dev proxy (ADR-0071)', () => {
  it('lists /api/fo/ before /api so the prefix is stripped before the generic rule', () => {
    expect(Object.keys(realDevProxy(origin))).toEqual(['/api/fo/', '/api', '/auth']);
  });

  it.each([
    ['/api/fo/notifications?unread=true', '/notifications?unread=true'],
    ['/api/fo/notifications/abc/read', '/notifications/abc/read'],
  ])('strips the prefix: %s → %s', (from, to) => {
    const rule = realDevProxy(origin)[`${FO_API_PREFIX}/`];
    expect(rule.target).toBe(origin);
    expect(rule.rewrite(from)).toBe(to);
  });

  it('sends the other prefixes to the same origin untouched', () => {
    const table = realDevProxy(origin);
    expect([table['/api'], table['/auth']]).toEqual([origin, origin]);
  });
});
