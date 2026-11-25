import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { readColorToken } from '@ap/ui/theme';
import { AnalysisChart, type ChartSpec } from '../AnalysisChart';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({
  default: (props: EChartProps) => {
    plot = props;
    return <div role="img" aria-label={props.ariaLabel} />;
  },
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const items = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1), label: `Item ${i + 1}`, value: i + 1, colorToken: 'chart-series-1' as const,
}));
const series: ChartSeries = { id: 'a', name: 'A', kind: 'bar', color: 'chart-series-1', points: items.map(item => [item.label, item.value]) };
type Datum = { name?: string; value: number; itemStyle: { color: string } };
const option = () => plot.option as {
  xAxis?: { data?: string[]; axisLabel?: { formatter: (key: string) => string } };
  yAxis?: { data?: string[]; axisLabel?: { formatter: (key: string) => string } };
  series: { data: (number | Datum)[] }[];
  tooltip: { formatter: (params: unknown) => string };
};
const values = (index = 0) => option().series[index].data.map(d => typeof d === 'object' ? d.value : d);
const openTable = () => fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
const mountKind = (spec: ChartSpec) => render(<I18nProvider><AnalysisChart chartId="topn" title="Top N" unit="ea" spec={spec} /></I18nProvider>);
const mountFrame = (props: Partial<AnalysisChartFrameProps>) => render(<I18nProvider>
  <AnalysisChartFrame chartId="bars" title="Bars" unit="ea" xType="category" series={[series]} {...props} />
</I18nProvider>);
const kindSpec = (kind: 'donut' | 'pareto' | 'topNBar') => {
  if (kind === 'donut') return { kind, slices: items };
  if (kind === 'pareto') return { kind, items };
  return { kind, items, defaultExpanded: true };
};

it.each(['topNBar', 'donut', 'pareto'] as const)('keeps five %s categories and renders the sum of the seven remaining categories last', async kind => {
  mountKind({ ...kindSpec(kind), categoryTopN: { count: 5 } });
  await screen.findByRole('img');
  expect(values()).toEqual([12, 11, 10, 9, 8, 28]);
  expect(option().series[0].data.at(-1)).toMatchObject({ itemStyle: { color: readColorToken('chart-remainder') } });
  expect(option().tooltip.formatter({ dataIndex: 5 })).toContain('기타 (7개 범주 묶음)');
});

it.each(['vertical', 'horizontal'] as const)('keeps five categories and appends Other to the %s Frame axis', async orientation => {
  mountFrame({ orientation, categoryTopN: { count: 5 } });
  await screen.findByRole('img');
  expect(values()).toEqual([12, 11, 10, 9, 8, 28]);
  const axis = (orientation === 'horizontal' ? option().yAxis : option().xAxis)!;
  expect(axis.data).toHaveLength(6);
  expect(axis.axisLabel?.formatter(axis.data!.at(-1)!)).toBe('기타');
  expect(option().series[0].data.at(-1)).toMatchObject({ itemStyle: { color: readColorToken('chart-remainder') } });
  expect(option().tooltip.formatter([{ seriesId: 'a', seriesIndex: 0, dataIndex: 5 }])).toContain('기타 (7개 범주 묶음)');
});

it('takes the smallest values first when the direction is bottom', async () => {
  mountKind({ ...kindSpec('topNBar'), categoryTopN: { count: 2, direction: 'bottom' } });
  await screen.findByRole('img');
  expect(values()).toEqual([1, 2, 75]);
});

it('takes the first categories in input order and omits the remainder with other disabled', async () => {
  mountKind({ ...kindSpec('pareto'), categoryTopN: { count: 2, sortBy: 'original', other: false } });
  await screen.findByRole('img');
  expect(values()).toEqual([1, 2]);
  expect(values(1)).toEqual([1 / 78 * 100, 3 / 78 * 100]);
});

it('ranks a stack by the sum across series and groups each series independently', async () => {
  const second: ChartSeries = { ...series, id: 'b', name: 'B', color: 'chart-series-2', points: [['Item 1', 20], ['Item 2', 5], ['Item 3', null]] };
  mountFrame({ orientation: 'horizontal', series: [series, second], stackMode: 'stack', reaggregation: 'sum', categoryTopN: { count: 1 } });
  await screen.findByRole('img');
  expect(values()).toEqual([1, 77]);
  expect(values(1)).toEqual([20, 5]);
  for (const s of option().series.slice(0, 2)) expect(s.data.at(-1)).toMatchObject({ itemStyle: { color: readColorToken('chart-remainder') } });
});

it.each(['topNBar', 'donut', 'pareto'] as const)('exposes the %s group name without offering a selection or drill', async kind => {
  const drill = vi.fn();
  const selection = vi.fn();
  const categoryTopN = { count: 5 };
  if (kind === 'donut') mountKind({ kind, slices: items, categoryTopN, onSliceClick: drill, onSelectedChange: selection });
  else mountKind({ kind, items, categoryTopN, onItemClick: drill, ...(kind === 'topNBar' ? { defaultExpanded: true } : {}) });
  await screen.findByRole('img');
  const event = { componentType: 'series', seriesIndex: 0, dataIndex: 5 };
  act(() => {
    plot.onEvents?.click?.(event, {} as never);
    plot.onEvents?.dblclick?.(event, {} as never);
  });
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('선택 없음');
  expect(drill).not.toHaveBeenCalled();
  expect(selection).not.toHaveBeenCalled();
  openTable();
  const grouped = screen.getByRole('cell', { name: '기타 (7개 범주 묶음)' }).closest('tr')!;
  expect(within(grouped).queryByRole('checkbox')).toBeNull();
  expect(within(grouped).queryByRole('button')).toBeNull();
});

it('does not send a synthetic Frame category to point selection or activation', async () => {
  const onActivate = vi.fn();
  const onActiveCategoryChange = vi.fn();
  mountFrame({ orientation: 'horizontal', categoryTopN: { count: 5 }, onActiveCategoryChange, pointActivation: { on: 'dblclick', onActivate } });
  await screen.findByRole('img');
  const event = { componentType: 'series', seriesId: 'a', seriesIndex: 0, dataIndex: 5 };
  act(() => {
    plot.onEvents?.click?.(event, {} as never);
    plot.onEvents?.dblclick?.(event, {} as never);
    plot.onEvents?.brushEnd?.({ areas: [{ coordRange: [5, 5] }] }, { dispatchAction: vi.fn() } as never);
  });
  expect(onActiveCategoryChange).not.toHaveBeenCalled();
  expect(onActivate).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('기타');
  openTable();
  expect(screen.getByRole('cell', { name: '기타 (7개 범주 묶음)' })).toBeVisible();
  act(() => plot.onEvents?.dblclick?.({ ...event, dataIndex: 0 }, {} as never));
  expect(onActivate).toHaveBeenCalledWith({ x: 'Item 12', seriesId: 'a', value: 12 });
});

it('uses the visible donut total for shares when omitted categories have no slice', async () => {
  mountKind({ ...kindSpec('donut'), categoryTopN: { count: 2, other: false } });
  await screen.findByRole('img');
  expect(values()).toEqual([12, 11]);
  expect(option().tooltip.formatter({ dataIndex: 0 })).toContain('52.2%');
});
