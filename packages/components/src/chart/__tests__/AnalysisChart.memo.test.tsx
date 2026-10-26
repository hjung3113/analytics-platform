import { useEffect } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mount } from './test-support';
import type { ChartSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';

const setOption = vi.fn();
vi.mock('../EChartImpl', () => ({ default: MockPlot }));
function MockPlot(props: EChartProps) {
  useEffect(() => { setOption(props.option, { notMerge: true }); }, [props.option]);
  return <div role="img" aria-label={props.ariaLabel} />;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each<ChartSpec>([
  { kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 1 }] },
  { kind: 'donut', slices: [{ id: 'a', label: 'A', value: 1 }] },
  { kind: 'scatter', points: [{ id: 'a', x: 1, y: 2 }], xLabel: 'X', yLabel: 'Y', xUnit: 's' },
  { kind: 'boxPlot', whisker: 'minMax', groups: [{ id: 'a', label: 'A', stats: { min: 1, q1: 2, median: 3, q3: 4, max: 5 } }] },
  { kind: 'pareto', items: [{ id: 'a', label: 'A', value: 1 }] },
])('preserves $kind option on unrelated renders and updates real inputs', async spec => {
  const view = mount(spec);
  await screen.findByRole('img');
  // The plot's DOM can commit before its passive effect runs (slow CI): wait for the first setOption itself.
  await waitFor(() => expect(setOption).toHaveBeenCalled());
  const calls = setOption.mock.calls.length;
  view.update(spec);
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(setOption).toHaveBeenCalledTimes(calls);
  view.update({ ...spec });
  expect(setOption).toHaveBeenCalledTimes(calls + 1);
});
