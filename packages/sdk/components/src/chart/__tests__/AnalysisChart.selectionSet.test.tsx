import { useEffect } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mount } from './test-support';
import type { ChartSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';

// #2812: selection lookups moved from array `includes` to `Set.has`. The option and the selection summary built from a
// fixed selection must equal the snapshot taken on the array code before the change.

const setOption = vi.fn();
vi.mock('../EChartImpl', () => ({ default: MockPlot }));
function MockPlot(props: EChartProps) {
  useEffect(() => { setOption(props.option); }, [props.option]);
  return <div role="img" aria-label={props.ariaLabel} />;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const labels = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
const SPECS: Record<string, ChartSpec> = {
  scatter: { kind: 'scatter', xLabel: 'X', yLabel: 'Y', xUnit: 's', points: labels.map((label, i) => ({ id: label, label, x: i, y: i * 2 })) },
  statusScatter: { kind: 'scatter', xLabel: 'X', yLabel: 'Y', xUnit: 's', points: labels.map((label, i) => i % 2 ? { id: label, label, x: i, y: i * 2 } : { id: label, label, x: i, y: i * 2, status: { tone: 'danger' as const, label: 'Over' } }) },
  pareto: { kind: 'pareto', items: labels.map((label, i) => ({ id: label, label, value: 50 - i * 7 })) },
  topNBar: { kind: 'topNBar', expanded: true, items: labels.map((label, i) => ({ id: label, label, value: 50 - i * 7, colorToken: 'chart-series-1' })) },
  heatmap: { kind: 'heatmap', xLabels: ['A', 'B', 'C'], yLabels: ['R1', 'R2'], cells: ['A', 'B', 'C'].flatMap((x, i) => ['R1', 'R2'].map((y, j) => ({ x, y, value: i * 2 + j }))) },
  donut: { kind: 'donut', slices: labels.map((label, i) => ({ id: label, label, value: 10 + i })) },
  boxPlot: { kind: 'boxPlot', whisker: 'minMax', groups: labels.map((label, i) => ({ id: label, label, stats: { min: i, q1: i + 1, median: i + 2, q3: i + 3, max: i + 4 } })) },
};

it.each(Object.keys(SPECS))('builds the same %s option and summary from a fixed selection', async kind => {
  mount(SPECS[kind]!);
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const boxes = screen.getAllByRole('checkbox');
  for (const index of [3, 0, 4, 1]) fireEvent.click(boxes[index]!);
  await waitFor(() => expect(boxes[1]).toHaveAttribute('data-state', 'checked'));
  const option = setOption.mock.calls.at(-1)![0];
  const summary = screen.getByRole('region', { name: /선택/ }).textContent;
  const checked = screen.getAllByRole('checkbox').map(box => box.getAttribute('data-state'));
  expect({ option, summary, checked }).toMatchSnapshot();
});
