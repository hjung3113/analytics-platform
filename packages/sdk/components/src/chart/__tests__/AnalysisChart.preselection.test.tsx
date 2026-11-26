import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ChartSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';
import { mount } from './test-support';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => {
  plot = props;
  return <div role="img" aria-label={props.ariaLabel} />;
} }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const stats = { min: 0, q1: 1, median: 2, q3: 3, max: 4 };
const bins = [{ start: 0, end: 1, count: 3 }, { start: 1, end: 2, count: 2 }];
const cases = [
  {
    kind: 'scatter', labels: ['Alpha', 'Beta'], widths: [0, 1.5],
    spec: (selectedId?: string | null): ChartSpec => ({
      kind: 'scatter', xUnit: 's', xLabel: 'X', yLabel: 'Y',
      points: [{ id: 'a', label: 'Alpha', x: 1, y: 1 }, { id: 'b', label: 'Beta', x: 2, y: 2 },
        { id: 'hidden', label: 'Unknown X', x: null, y: 3 }],
      ...(selectedId === undefined ? {} : { selectedId }),
    }),
  },
  {
    kind: 'boxPlot', labels: ['Alpha', 'Beta'], widths: [1.5, 3],
    spec: (selectedId?: string | null): ChartSpec => ({
      kind: 'boxPlot', whisker: 'minMax',
      groups: [{ id: 'a', label: 'Alpha', stats }, { id: 'b', label: 'Beta', stats },
        { id: 'hidden', label: 'Unknown stats', stats: null }],
      ...(selectedId === undefined ? {} : { selectedId }),
    }),
  },
  {
    kind: 'pareto', labels: ['Alpha', 'Beta'], widths: [0, 1.5],
    spec: (selectedId?: string | null): ChartSpec => ({
      kind: 'pareto', maxItems: 3,
      items: [{ id: 'a', label: 'Alpha', value: 10 }, { id: 'b', label: 'Beta', value: 8 },
        { id: 'hidden', label: 'Grouped item', value: 2 }, { id: 'd', label: 'Grouped item D', value: 1 }],
      ...(selectedId === undefined ? {} : { selectedId }),
    }),
  },
  {
    kind: 'histogram', labels: ['0–1', '1–2'], widths: [0, 1.5],
    spec: (selection?: string | null): ChartSpec => ({
      kind: 'histogram', xUnit: 's', xLabel: 'Duration', bins,
      ...(selection === undefined ? {} : { selectedBin: selection === null ? null : {
        ...({ a: { start: 0, end: 1 }, b: { start: 1, end: 2 } }[selection] ?? { start: 0, end: 2 }),
      } }),
    }),
  },
] as const;

function markWidth(index: number) {
  const [series] = plot.option.series as {
    data: { value: number[]; itemStyle: { borderWidth: number } }[];
    renderItem?: (params: { dataIndex: number }, api: {
      value: (dimension: number) => number;
      coord: (point: number[]) => number[];
      visual: () => string;
    }) => { style: { lineWidth?: number } };
  }[];
  if (!series.renderItem) return series.data[index].itemStyle.borderWidth;
  const { value } = series.data[index];
  return series.renderItem({ dataIndex: index }, {
    value: (dimension: number) => value[dimension],
    coord: ([x, y]: number[]) => [x, -y],
    visual: () => 'fill',
  }).style.lineWidth ?? 0;
}

const summary = () => screen.getByRole('region', { name: '선택 요약' });
const clickMark = (dataIndex: number) =>
  act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex }, {} as never));

it.each(cases)('$kind highlights the page selection on first render', async ({ spec, labels, widths }) => {
  mount(spec('a'));
  expect(summary()).toHaveTextContent(`${labels[0]} · 1개 선택`);
  await screen.findByRole('img');
  expect([markWidth(0), markWidth(1)]).toEqual([widths[1], widths[0]]);
});

it.each(cases)('$kind follows a changed selection', async ({ spec, labels, widths }) => {
  const view = mount(spec('a'));
  await screen.findByRole('img');
  view.update(spec('b'));
  expect(summary()).toHaveTextContent(`${labels[1]} · 1개 선택`);
  expect([markWidth(0), markWidth(1)]).toEqual([widths[0], widths[1]]);
});

it.each(cases)('$kind clears local selection when the prop changes to null', async ({ spec, widths }) => {
  const view = mount(spec('a'));
  await screen.findByRole('img');
  clickMark(1);
  view.update(spec(null));
  expect(summary()).toHaveTextContent('선택 없음');
  expect([markWidth(0), markWidth(1)]).toEqual([widths[0], widths[0]]);
});

it.each(cases)('$kind ignores a selection outside the plot silently', async ({ spec, widths }) => {
  const diagnostic = vi.spyOn(console, 'error');
  const view = mount(spec('a'));
  await screen.findByRole('img');
  clickMark(1);
  view.update(spec('hidden'));
  expect(summary()).toHaveTextContent('선택 없음');
  expect([markWidth(0), markWidth(1)]).toEqual([widths[0], widths[0]]);
  expect(diagnostic).not.toHaveBeenCalled();
});

it.each(cases)('$kind keeps a click override until Context changes', async ({ spec, labels, widths }) => {
  const view = mount(spec('a'));
  await screen.findByRole('img');
  clickMark(0);
  view.update(spec('a'));
  expect(summary()).toHaveTextContent('선택 없음');
  fireEvent.click(screen.getByRole('button', { name: 'context' }));
  expect(summary()).toHaveTextContent(`${labels[0]} · 1개 선택`);
  expect(markWidth(0)).toBe(widths[1]);
});

it.each(cases)('$kind keeps Reset local while the prop stays the same', async ({ spec, widths }) => {
  const view = mount(spec('a'));
  await screen.findByRole('img');
  expect(markWidth(0)).toBe(widths[1]);
  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  view.update(spec('a'));
  expect(summary()).toHaveTextContent('선택 없음');
  expect(markWidth(0)).toBe(widths[0]);
});

it('lets scatter Brush replace the page selection', async () => {
  const { spec } = cases[0];
  const view = mount(spec('a'));
  await screen.findByRole('img');
  expect(markWidth(0)).toBe(1.5);
  act(() => {
    plot.onEvents?.brushselected?.({ batch: [{ selected: [{ seriesIndex: 0, dataIndex: [1] }] }] }, {} as never);
    plot.onEvents?.brushEnd?.({}, {} as never);
  });
  view.update(spec('a'));
  expect(summary()).toHaveTextContent('Beta · 1개 선택');
  expect([markWidth(0), markWidth(1)]).toEqual([0, 1.5]);
});

it('keeps the existing non-selectable histogram when the prop is omitted', async () => {
  mount(cases[3].spec());
  await screen.findByRole('img');
  clickMark(0);
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(screen.getByRole('table')).toHaveTextContent('0 s1 s360%');
  expect(screen.queryByRole('region', { name: '선택 요약' })).toBeNull();
  expect(screen.queryByRole('button', { name: '초기화' })).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect([markWidth(0), markWidth(1)]).toEqual([0, 0]);
});

it('hides the page selection summary when Pareto becomes empty', () => {
  const spec = (value: number): ChartSpec => ({
    kind: 'pareto', items: [{ id: 'a', label: 'Alpha', value }], selectedId: 'a',
  });
  const view = mount(spec(1));
  expect(summary()).toHaveTextContent('Alpha · 1개 선택');

  view.update(spec(0));
  expect(screen.getByText('데이터 없음')).toBeVisible();
  expect(screen.queryByRole('region', { name: '선택 요약' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(screen.getByRole('table')).toHaveTextContent('Alpha');
  expect(screen.getByRole('checkbox', { name: '선택 Alpha' })).not.toBeChecked();
});

it('clears local histogram selection when the page changes a NaN bound to Infinity', async () => {
  const spec = (start: number): ChartSpec => ({
    kind: 'histogram', xUnit: 's', xLabel: 'Duration', bins, selectedBin: { start, end: 1 },
  });
  const view = mount(spec(NaN));
  await screen.findByRole('img');
  expect(summary()).toHaveTextContent('선택 없음');
  clickMark(0);
  expect(summary()).toHaveTextContent('0–1 · 1개 선택');

  view.update(spec(Infinity));
  expect(summary()).toHaveTextContent('선택 없음');
  expect(markWidth(0)).toBe(0);
});

it('supports histogram table selection, Reset and plot clicks when selectedBin starts as null', async () => {
  mount(cases[3].spec(null));
  await screen.findByRole('img');
  expect(summary()).toHaveTextContent('선택 없음');

  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const firstBin = screen.getByRole('checkbox', { name: '선택 0–1' });
  fireEvent.click(firstBin);
  expect(firstBin).toBeChecked();
  expect(summary()).toHaveTextContent('0–1 · 1개 선택');
  expect(markWidth(0)).toBe(1.5);

  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  expect(firstBin).not.toBeChecked();
  expect(summary()).toHaveTextContent('선택 없음');
  expect(markWidth(0)).toBe(0);

  clickMark(1);
  expect(screen.getByRole('checkbox', { name: '선택 1–2' })).toBeChecked();
  expect(summary()).toHaveTextContent('1–2 · 1개 선택');
  expect(markWidth(1)).toBe(1.5);
});

it('moves focus to the table toggle when a followed histogram empties under a focused selection summary', async () => {
  const spec = (data: typeof bins): ChartSpec => ({
    kind: 'histogram', xUnit: 's', xLabel: 'Duration', bins: data, selectedBin: { start: 0, end: 1 },
  });
  const view = mount(spec(bins));
  await screen.findByRole('img');
  const region = summary();
  const target = region.querySelector<HTMLElement>('button:not(:disabled), [tabindex]') ?? region;
  if (target === region) region.tabIndex = -1;
  act(() => { target.focus(); });
  expect(region.contains(document.activeElement)).toBe(true);

  view.update(spec([]));
  expect(screen.queryByRole('region', { name: '선택 요약' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '표로 보기' }));
});

it.each([
  ['refocused within the same task keeps it', true],
  ['a real departure clears it', false],
] as const)('a blur of the selection summary that is %s (#3072)', async (_label, refocus) => {
  const spec = (data: typeof bins): ChartSpec => ({
    kind: 'histogram', xUnit: 's', xLabel: 'Duration', bins: data, selectedBin: { start: 0, end: 1 },
  });
  const view = mount(spec(bins));
  await screen.findByRole('img');
  const region = summary();
  const target = region.querySelector<HTMLElement>('button:not(:disabled), [tabindex]') ?? region;
  if (target === region) region.tabIndex = -1;
  act(() => { target.focus(); });
  // A programmatic restore right after the blur, before the deferred release runs.
  act(() => { target.blur(); if (refocus) target.focus(); });
  await act(async () => { await Promise.resolve(); });
  if (!refocus) expect(document.activeElement).toBe(document.body);

  view.update(spec([]));
  const toggle = screen.getByRole('button', { name: '표로 보기' });
  if (refocus) expect(document.activeElement).toBe(toggle);
  else expect(document.activeElement).toBe(document.body);
});
