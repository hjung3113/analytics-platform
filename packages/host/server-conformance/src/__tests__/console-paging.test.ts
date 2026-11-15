import { describe, expect, it } from 'vitest';
import type { ApiResponse, PlatformAdapter } from '@ap/contracts';
import type { ServerConformanceHarness } from '../types';
import { planConsoleChecks } from '../plan/ports/console';

type Query = { page?: number; pageSize?: number; sort?: { field: string; desc: boolean }; [key: string]: unknown };
const ok = (items: { id: string }[], total = 2): ApiResponse<{ items: { id: string }[]; total: number }> => ({ outcome: 'ok', data: { items, total }, assessments: [], trust: null, correlationId: 'synthetic' });
const error = (): ApiResponse<never> => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'synthetic' });
function checks(method: 'auditTrail' | 'accessDirectory', send: (q: Query) => Promise<unknown>) {
  const adapter = { [method]: send } as unknown as PlatformAdapter;
  return planConsoleChecks({ adapter, ports: { usage: { menuId: 'synthetic-menu' } } } as ServerConformanceHarness)
    .filter(check => check.id.startsWith(`port · ${method} paging`));
}
async function answer(q: Query) {
  if (q.page === 0 || q.pageSize === 101 || 'unknown' in q || q.sort?.field === 'unknown') return error();
  if ((q.page ?? 1) > 2) return ok([]);
  return ok([{ id: `synthetic-${q.page ?? 1}` }]);
}
describe.each(['auditTrail', 'accessDirectory'] as const)('%s paging conformance (FEA-13)', method => {
  it('derives paging and invalid-request checks and accepts a conforming server', async () => {
    const planned = checks(method, answer);
    expect(planned.length).toBeGreaterThanOrEqual(3);
    for (const check of planned) expect(await check.run()).toBeNull();
  });
  it.each(['rewritten', 'total', 'duplicate', 'invalid'] as const)('detects %s responses', async broken => {
    const planned = checks(method, async q => {
      if (broken === 'invalid') return ok([]);
      if (broken === 'rewritten' && q.page === 10_000) return ok([{ id: 'synthetic-1' }]);
      if (broken === 'total' && q.page === 10_000) return ok([], 0);
      if (broken === 'duplicate' && q.page === 2) return ok([{ id: 'synthetic-1' }]);
      return answer(q);
    });
    expect(planned.length).toBeGreaterThanOrEqual(3);
    expect((await Promise.all(planned.map(check => check.run()))).some(result => typeof result === 'string')).toBe(true);
  });
  it('reports absent paging data as a visible skip', async () => {
    const planned = checks(method, async q => q.page === 0 || q.pageSize === 101 || 'unknown' in q || q.sort?.field === 'unknown' ? error() : { ...error(), outcome: 'empty' });
    expect(planned.length).toBeGreaterThanOrEqual(3);
    expect((await Promise.all(planned.map(check => check.run()))).filter(result => result && typeof result === 'object')).toHaveLength(2);
  });
});
