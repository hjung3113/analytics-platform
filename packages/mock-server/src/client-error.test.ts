import { afterEach, describe, expect, it } from 'vitest';
import type { ClientErrorReport } from '@ap/contracts';
import { getRole, reportClientError, resetClientErrors, setRole, storedClientErrors } from './server';
import type { RoleId } from './world';

const report = (over: Partial<ClientErrorReport> = {}): ClientErrorReport => ({
  correlationId: 'client-1a2b-c3d4', menuId: 'equipment-master', spaceId: 'analytics', path: '/equipment', name: 'TypeError', ...over,
});

let previousRole: RoleId = getRole();
afterEach(() => { resetClientErrors(); setRole(previousRole); });

describe('client error reports (issue #101)', () => {
  it('stores a valid report with the server-stamped user and time, for any signed-in role', async () => {
    setRole('viewer');
    expect(await reportClientError(report())).toEqual({ accepted: true });
    expect(storedClientErrors()).toEqual([{ ...report(), userId: 'viewer', receivedAt: expect.any(Number) }]);
  });

  it('rejects the whole report on an unknown key, so a URL or Context value cannot ride along', async () => {
    const withUrl = { ...report(), url: '/equipment?lotIds=LOT-A1023' } as unknown as ClientErrorReport;
    expect(await reportClientError(withUrl)).toEqual({ accepted: false });
    expect(storedClientErrors()).toHaveLength(0);
  });

  it('rejects a free-text message field, so a value in an error message cannot be stored', async () => {
    const withMessage = { ...report(), message: 'lotIds=PRIVATE-LOT' } as unknown as ClientErrorReport;
    expect(await reportClientError(withMessage)).toEqual({ accepted: false });
  });

  it.each([
    ['correlation id without the client- prefix', { correlationId: 'corr-1' }],
    ['menu id with a query string', { menuId: 'equipment?x=1' }],
    ['path with whitespace', { path: '/a b' }],
    ['unknown space', { spaceId: 'nowhere' as never }],
    ['absolute URL as path', { path: 'https://example.test/private-id' }],
    ['protocol-relative path', { path: '//example.test/path' }],
    ['name that is not identifier-shaped', { name: 'lot A1023 failed' }],
    ['name over 80 chars', { name: 'x'.repeat(81) }],
  ])('rejects %s', async (_label, over) => {
    expect(await reportClientError(report(over))).toEqual({ accepted: false });
    expect(storedClientErrors()).toHaveLength(0);
  });

  it('keeps a bounded log: the oldest rows drop first', async () => {
    for (let i = 0; i < 205; i++) await reportClientError(report({ correlationId: `client-${i}` }));
    expect(storedClientErrors()).toHaveLength(200);
    expect(storedClientErrors()[0].correlationId).toBe('client-5');
  });
});
