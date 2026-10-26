import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyGlobal, menuPermission } from '@ap/contracts';
import { DEFAULT_QUERY_LATENCY_MS, QUERY_LATENCY_JITTER_MS, getEntity, queryDelay, serve, setScenario } from './server';

const period = { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };

// #917: the demo's 450–650 ms read made every drill step feel slow. The default stays near a real server.
describe('default read latency', () => {
  afterEach(() => { vi.useRealTimers(); setScenario('normal'); });

  it('stays within the default plus jitter, and the slow scenario adds its fixed 2.2 s on top', () => {
    for (let i = 0; i < 50; i++) {
      const normal = queryDelay(undefined, 'normal');
      expect(normal).toBeGreaterThanOrEqual(DEFAULT_QUERY_LATENCY_MS);
      expect(normal).toBeLessThan(DEFAULT_QUERY_LATENCY_MS + QUERY_LATENCY_JITTER_MS);
    }
    expect(queryDelay(undefined, 'slow')).toBeGreaterThanOrEqual(DEFAULT_QUERY_LATENCY_MS + 2200);
    expect(queryDelay(0, 'normal')).toBeLessThan(QUERY_LATENCY_JITTER_MS);
  });

  it('answers a read and a destination lookup within 200 ms without an explicit latency', async () => {
    vi.useFakeTimers();
    let served = false;
    let looked = false;
    const read = serve({ permission: menuPermission('analytics:view'), global: { ...emptyGlobal, scopeId: 'MEM', ...period }, mergeTimeDomain: false, compute: () => 1 }).then(() => { served = true; });
    const entity = getEntity({ type: 'equipment', id: 'EQ-001', scopeId: 'MEM' }).then(() => { looked = true; });
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([read, entity]);
    expect([served, looked]).toEqual([true, true]);
  });
});
