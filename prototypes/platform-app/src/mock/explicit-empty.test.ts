import { describe, expect, it } from 'vitest';
import { emptyGlobal } from '../kernel/url';
import { serve } from './server';

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
