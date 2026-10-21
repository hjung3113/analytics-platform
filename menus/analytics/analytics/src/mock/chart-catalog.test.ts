import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter, EQUIPMENT, getRole, setRole } from '@ap/mock-server';
import { emptyGlobal, type MenuMeta } from '@ap/contracts';
import { chartCatalogEndpoint, CHART_KINDS, type CatalogData } from '../endpoints';
import { chartCatalogMock } from './chart-catalog';

const menu: MenuMeta = {
  id: 'chart-catalog', group: 'analytics', label: { ko: '차트 카탈로그', en: 'Chart catalog' },
  description: { ko: '', en: '' }, path: '/analytics/chart-catalog', pageType: 'analysis',
  permission: 'analytics:view', requiresScope: true,
  context: { time: 'apply', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' },
  features: { export: true, savedView: false, compare: true, annotate: true }, pageKeys: ['kind'],
};
const adapter = createMockAdapter({ endpoints: [chartCatalogMock], registry: { menus: [menu] } });
const context = { scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
const role = getRole();
beforeEach(() => setRole('engineer'));
afterEach(() => setRole(role));

describe('chart catalog projected endpoint', () => {
  it.each(['null period', 'empty Scope', 'zero duration'] as const)('returns empty data for %s', reason => {
    const data = chartCatalogMock.handle({
      context: { ...emptyGlobal, ...context, ...(reason === 'null period' ? { from: null, to: null } : reason === 'zero duration' ? { to: context.from } : {}) },
      equipment: reason === 'empty Scope' ? [] : EQUIPMENT.slice(0, 6),
      params: { kind: 'line' }, actor: 'engineer',
    });
    expect(chartCatalogMock.isEmpty?.(data)).toBe(true);
    expect(data.current).toEqual([]); expect(data.previous).toEqual([]);
    expect(data.previousFrom).toBeNull(); expect(data.previousTo).toBeNull();
    for (const kind of ['donut', 'scatter', 'boxPlot', 'pareto'] as const) expect(data[kind]).toEqual([]);
    expect(data.heatmap).toEqual({ xLabels: [], yLabels: [], cells: [] });
  });
  it.each(CHART_KINDS)('%s uses current buckets and aligned previous source timestamps', async kind => {
    const response = await adapter.menuQuery({ endpoint: chartCatalogEndpoint.id, params: { kind }, context });
    expect(response.outcome).toBe('ok');
    const data = response.data as CatalogData;
    expect(data.current).toHaveLength(8);
    expect(data.previous).toHaveLength(8);
    expect(data.current[0].at).toBe(context.from);
    expect(data.previous[0].sourceAt).toBe('2026-09-24T09:00:00');
    for (const [i, bucket] of data.current.entries()) {
      expect(bucket.at >= context.from && bucket.at < context.to).toBe(true);
      expect(data.previous[i].at).toBe(bucket.at);
      expect(data.previous[i].sourceAt >= '2026-09-24T09:00:00' && data.previous[i].sourceAt < context.from).toBe(true);
    }
    expect(data.heatmap.cells.some(cell => cell.value === null)).toBe(true);
    expect(data.heatmap.cells.length).toBeLessThan(data.heatmap.xLabels.length * data.heatmap.yLabels.length);
    expect(data.scatter.some(point => point.x === null)).toBe(true);
    expect(data.pareto.length).toBeGreaterThan(4);
    expect(data.pareto.some(item => item.label === '기타')).toBe(false);
    expect((await adapter.menuQuery({ endpoint: chartCatalogEndpoint.id, params: { kind }, context })).data).toEqual(data);
  });
  it('rejects an unknown kind', async () => {
    const response = await adapter.menuQuery({ endpoint: chartCatalogEndpoint.id, params: { kind: 'unknown' }, context });
    expect(response.outcome).toBe('error');
  });
});
