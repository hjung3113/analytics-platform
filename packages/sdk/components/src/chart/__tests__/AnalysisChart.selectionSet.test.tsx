import { useEffect } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mount } from './test-support';
import type { ChartSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';
import { readColorToken } from '@ap/ui/theme';

// #2812 moved selection lookups from array `includes` to `Set.has`; #3017 replaced the 1,343-line snapshot of that run with
// the contract values it held: which marks a fixed selection outlines and how (chart.md §16 선택 마크, #2736), single- vs
// multi-select per kind, the selection summary and table checkboxes, and the scatter/heatmap brush band and value-axis grid.

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

type Mark = { name?: string; value: unknown; itemStyle: { color?: string; borderColor?: string; borderWidth?: number; shadowColor?: string } };
type Series = { id?: string; type: string; data?: Mark[] };
type Option = { series: Series[]; brush?: { brushStyle: Record<string, unknown> }; xAxis: AxisOption; yAxis: AxisOption };
type AxisOption = { name?: string; splitLine?: { lineStyle: { color: string } } };

/** Select rows 3, 0, 4, 1 in the keyboard table (row 2 stays out), then read what the chart, summary and table show. */
async function selectFixed(kind: string) {
  mount(SPECS[kind]!);
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const boxes = screen.getAllByRole('checkbox');
  for (const index of [3, 0, 4, 1]) fireEvent.click(boxes[index]!);
  await waitFor(() => expect(boxes[1]).toHaveAttribute('data-state', 'checked'));
  const option = setOption.mock.calls.at(-1)![0] as Option;
  const summary = screen.getByRole('region', { name: /선택/ }).textContent;
  const checked = screen.getAllByRole('checkbox').map(box => (box.getAttribute('data-state') === 'checked' ? 'x' : '.')).join('');
  return { option, summary, checked, marks: option.series[0]!.data! };
}

const outline = readColorToken('chart-selection-outline');
const ring = (marks: Mark[]) => marks.map(m => m.itemStyle.borderWidth);
const RING = 1.5;

it.each([
  ['scatter', '4개 선택 · Alpha, Beta, Delta 외 1개'],
  ['pareto', '4개 선택 · Alpha, Beta, Delta 외 1개'],
  ['topNBar', 'Alpha, Beta, Delta, Epsilon · 4개 선택'],
])('%s: every chosen mark keeps its fill and gets the 1.5px selection ring; the others get none', async (kind, summary) => {
  const run = await selectFixed(kind);
  expect(run.checked).toBe('xx.xx');
  expect(run.summary).toBe(summary);
  expect(ring(run.marks)).toEqual([RING, RING, 0, RING, RING]);
  expect(new Set(run.marks.map(m => m.itemStyle.borderColor))).toEqual(new Set([outline]));
  expect(new Set(run.marks.map(m => m.itemStyle.color))).toEqual(new Set([readColorToken('chart-series-1')]));
});

it('heatmap: chosen cells get the selection ring, the others a neutral edge of 0; cells keep their scale colour', async () => {
  const run = await selectFixed('heatmap');
  expect(run.checked).toBe('xx.xx.');
  expect(run.summary).toBe('4칸 선택 · R1–R2 · A–C');
  expect(ring(run.marks)).toEqual([RING, RING, 0, RING, RING, 0]);
  expect(run.marks.map(m => m.itemStyle.borderColor)).toEqual([outline, outline, readColorToken('border-control'), outline, outline, readColorToken('border-control')]);
  expect(run.marks[2]!.itemStyle.color).toBe(run.marks[3]!.itemStyle.color);
});

it.each(['scatter', 'heatmap'])('%s: the rectangle brush band is the selection outline over a 10%% fill of it', async kind => {
  const { option } = await selectFixed(kind);
  const [r, g, b] = outline.match(/\d+/g)!;
  expect(option.brush?.brushStyle).toEqual({ borderColor: outline, borderWidth: 1, color: `rgba(${r},${g},${b},0.1)` });
});

it('scatter: both value axes carry the grid and the unit in their name', async () => {
  const { option } = await selectFixed('scatter');
  expect([option.xAxis.name, option.yAxis.name]).toEqual(['X (s)', 'Y (ea)']);
  expect([option.xAxis.splitLine?.lineStyle.color, option.yAxis.splitLine?.lineStyle.color]).toEqual([readColorToken('chart-grid'), readColorToken('chart-grid')]);
});

it('statusScatter: a status point keeps its 2px status ring; when chosen, the selection shows as a glow in the outline colour', async () => {
  const run = await selectFixed('statusScatter');
  expect(run.checked).toBe('xx.xx');
  expect(run.summary).toBe('4개 선택 · Alpha · ■ Over, Beta, Delta 외 1개');
  const danger = readColorToken('chart-status-critical');
  // Rows 0, 2 and 4 carry the danger status; row 2 is the one left out of the selection.
  expect(run.marks.map(m => [m.itemStyle.borderColor, m.itemStyle.borderWidth, m.itemStyle.shadowColor ?? null])).toEqual([
    [danger, 2, outline], [outline, RING, null], [danger, 2, null], [outline, RING, null], [danger, 2, outline],
  ]);
  const layer = (id: string) => run.option.series.find(s => s.id === id)!.data!.map(m => [m.value, m.itemStyle.borderWidth]);
  expect(layer('__scatterStatusBacking-0')).toEqual([[[0, 0], 6], [[2, 4], 6], [[4, 8], 6]]);
  expect(layer('__scatterStatusOutline-0')).toEqual([[[0, 0], 2], [[2, 4], 2], [[4, 8], 2]]);
});

it('donut: one slice at a time — the last chosen slice gets the ring', async () => {
  const run = await selectFixed('donut');
  expect(run.checked).toBe('.x...');
  expect(run.summary).toBe('Beta · 1개 선택');
  expect(run.marks.map(m => [m.name, m.itemStyle.borderWidth])).toEqual([['Alpha', 0], ['Beta', RING], ['Gamma', 0], ['Delta', 0], ['Epsilon', 0]]);
  expect(new Set(run.marks.map(m => m.itemStyle.borderColor))).toEqual(new Set([outline]));
});

it('boxPlot: one group at a time — the chosen box thickens its own series edge to 3px instead of a ring', async () => {
  const run = await selectFixed('boxPlot');
  expect(run.checked).toBe('.x...');
  expect(run.summary).toBe('Beta · 1개 선택');
  expect(ring(run.marks)).toEqual([RING, 3, RING, RING, RING]);
  for (const mark of run.marks) expect(mark.itemStyle.borderColor).toBe(mark.itemStyle.color);
});
