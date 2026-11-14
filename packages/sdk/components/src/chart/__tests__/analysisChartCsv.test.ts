import { afterEach, expect, it, vi } from 'vitest';
import { downloadChartCsv } from '../analysisChartCsv';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('uses a safe filename and keeps its blob URL alive until the download settles (#2028 SHE-19)', () => {
  vi.useFakeTimers();
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:chart', revokeObjectURL });
  let name = '';
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download; });
  downloadChartCsv({ chartId: 'a/b', title: 'Chart', unit: 's', context: {} }, ['Value (s)'], [[-3.2]]);
  expect(name).toBe('a-b.csv');
  expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:chart');
});

it('keeps numeric chart projections numeric, including negative coordinates (#2028 SHE-19)', async () => {
  const { scatterData, boxPlotData, paretoData } = await import('../analysisChartKinds');
  const { topNData } = await import('../topNBar');
  const scatter = scatterData({ kind: 'scatter', points: [{ id: 'a', x: -3.2, y: 2 }], xLabel: 'X', yLabel: 'Y', xUnit: 's' }, 'en', 'ea');
  expect(scatter.csvValues[0].slice(-2)).toEqual([-3.2, 2]);
  const box = boxPlotData({ kind: 'boxPlot', whisker: 'minMax', groups: [{ id: 'a', label: 'A', stats: { min: -5, q1: -4, median: -3, q3: -2, max: -1 } }] }, 'en', 's');
  expect(box.csvValues[0].slice(1, 6)).toEqual([-5, -4, -3, -2, -1]);
  expect(box.csvHeaders[1]).toBe('Min (s)');
  expect(paretoData({ kind: 'pareto', items: [{ id: 'a', label: 'A', value: 2 }] }, 'en', 's').csvValues[0]).toEqual(['A', 2, 100]);
  expect(topNData({ kind: 'topNBar', items: [{ id: 'a', label: 'A', value: 2, colorToken: 'chart-series-1' }] }, 'en', 's').csvValues[0]).toEqual(['A', 2]);
});
