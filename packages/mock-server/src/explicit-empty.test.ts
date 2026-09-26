import { describe, expect, it } from 'vitest';
import { getRole, serve, setRole } from './server';
import { emptyGlobal } from '@ap/contracts';

const period = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };

describe('explicit empty sets', () => {
  it('returns empty for selection [] and roomNames [] without calling compute or isEmpty', async () => {
    for (const patch of [{ selection: [] as string[] }, { roomNames: [] as string[] }]) {
      const res = await serve({
        role: 'engineer',
        global: { ...emptyGlobal, scopeId: 'ICH', ...period, ...patch },
        latency: 0,
        isEmpty: () => false,
        compute: () => { throw new Error('must not run'); },
      });
      expect(res.outcome).toBe('empty');
      expect(res.data).toBeNull();
      expect(res.assessments).toEqual([]);
      expect(res.trust).toBeNull();
      expect(res.correlationId).toMatch(/^corr-/);
    }
  });

  it('does not treat an absent set as empty, and forbidden still wins', async () => {
    const ok = await serve({
      role: 'engineer',
      global: { ...emptyGlobal, scopeId: 'ICH', ...period },
      latency: 0,
      mergeTimeDomain: false,
      compute: () => 1,
    });
    expect(ok.outcome).toBe('ok');
    expect(ok.data).toBe(1);
    const denied = await serve({
      role: 'engineer',
      global: { ...emptyGlobal, scopeId: 'XIA', ...period, selection: [] },
      latency: 0,
      compute: () => { throw new Error('must not run'); },
    });
    expect(denied.outcome).toBe('forbidden');
  });
});

describe('request identity', () => {
  it('evaluates an in-flight request with the role it was sent as', async () => {
    const before = getRole();
    setRole('engineer');
    try {
      // CVD-201 is granted to engineer, not to viewer.
      const pending = serve({ global: { ...emptyGlobal, scopeId: 'ICH', ...period, roomNames: ['CVD-201'] }, latency: 30, mergeTimeDomain: false, compute: () => 1 });
      setRole('viewer');
      const res = await pending;
      expect(res.outcome).toBe('ok');
    } finally {
      setRole(before);
    }
  });
});
