import { describe, expect, it } from 'vitest';
import { getRole, serve, setRole, setScenario } from './server';
import { emptyGlobal } from '@ap/contracts';

const period = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };

describe('menu permission re-validation', () => {
  it('forbids a viewer from an analytics endpoint even with a valid ICH scope', async () => {
    // viewer holds an ICH (PHOTO) grant, so the rejection is the menu permission, not Scope.
    const res = await serve({
      role: 'viewer',
      permission: 'analytics:view',
      global: { ...emptyGlobal, scopeId: 'ICH', ...period },
      latency: 0,
      compute: () => { throw new Error('must not run'); },
    });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toContain('analytics:view');
  });

  it('serves an engineer with analytics:view on ICH', async () => {
    const res = await serve({
      role: 'engineer',
      permission: 'analytics:view',
      global: { ...emptyGlobal, scopeId: 'ICH', ...period },
      latency: 0,
      mergeTimeDomain: false,
      compute: () => 1,
    });
    expect(res.outcome).toBe('ok');
    expect(res.data).toBe(1);
  });

  it('evaluates an in-flight request with the permission of the role it was sent as', async () => {
    const before = getRole();
    setRole('engineer');
    try {
      // viewer lacks analytics:view. The request was sent as engineer, and the pinned role —
      // not the live one — decides, like a session cookie on the request.
      const pending = serve({ permission: 'analytics:view', global: { ...emptyGlobal, scopeId: 'ICH' }, latency: 60, mergeTimeDomain: false, compute: () => 1 });
      setRole('viewer');
      const res = await pending;
      expect(res.outcome).toBe('ok');
    } finally {
      setRole(before);
    }
  });

  it('rejects a missing permission before the error scenario', async () => {
    setScenario('error');
    try {
      const res = await serve({
        role: 'viewer',
        permission: 'analytics:view',
        global: { ...emptyGlobal, scopeId: 'ICH', ...period },
        latency: 0,
        compute: () => { throw new Error('must not run'); },
      });
      expect(res.outcome).toBe('forbidden');
      expect(res.message).toContain('analytics:view');
    } finally {
      setScenario('normal');
    }
  });
});
