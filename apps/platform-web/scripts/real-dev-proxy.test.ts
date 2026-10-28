import { describe, expect, it } from 'vitest';
import { FO_API_PREFIX, realDevProxy } from './real-dev-proxy';

const origin = 'http://127.0.0.1:3011';

describe('real-dev proxy (ADR-0071)', () => {
  it('lists /api/features/ before /api so the prefix is stripped before the generic rule', () => {
    expect(Object.keys(realDevProxy(origin))).toEqual(['/api/features/', '/api', '/auth']);
  });

  it.each([
    ['/api/features/notifications?unread=true', '/notifications?unread=true'],
    ['/api/features/notifications/abc/read', '/notifications/abc/read'],
  ])('strips the prefix: %s → %s', (from, to) => {
    const rule = realDevProxy(origin)[`${FO_API_PREFIX}/`];
    expect(rule.target).toBe(origin);
    expect(rule.rewrite(from)).toBe(to);
  });

  it.each(['/api/fo/notifications', '/api/featuresX/notifications', '/api/features', '/api/fonts/a.woff'])(
    'does not strip or alias %s (only the exact /api/features/ prefix is the feature edge)',
    path => {
      const [featureContext, ...rest] = Object.keys(realDevProxy(origin));
      expect(path.startsWith(featureContext)).toBe(false);
      expect(rest.some(context => path.startsWith(context))).toBe(path.startsWith('/api'));
    },
  );

  it('sends the other prefixes to the same origin untouched', () => {
    const table = realDevProxy(origin);
    expect([table['/api'], table['/auth']]).toEqual([origin, origin]);
  });
});
