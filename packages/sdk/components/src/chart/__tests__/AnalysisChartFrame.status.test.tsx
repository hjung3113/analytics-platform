import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { downloadChartCsv } from '../analysisChartCsv';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" />; } }));
vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
const series: ChartSeries[] = [
  { id: 'a', name: 'M1', color: 'chart-blue', points: [['EQ1 · PM1', 3], ['EQ1 · PM2', 5], ['EQ2 · PM1', null]] },
  { id: 'b', name: 'M2', color: 'chart-teal', points: [['EQ1 · PM1', 1], ['EQ1 · PM2', 2], ['EQ2 · PM1', 4]] },
];
const rowGroups = { header: '설비', byCategory: new Map([
  ['EQ1 · PM1', { group: 'EQ1', label: 'PM1' }], ['EQ1 · PM2', { group: 'EQ1', label: 'PM2' }], ['EQ2 · PM1', { group: 'EQ2', label: 'PM1' }],
]) };
const status = { tone: 'warning' as const, label: '상한 초과', reason: 'Recipe 미구분' };
function mount(extra: Partial<AnalysisChartFrameProps> = {}) {
  const frame = (props: Partial<AnalysisChartFrameProps>) => <I18nProvider><AnalysisChartFrame chartId="status" title="Rows" series={series} xType="category" orientation="horizontal" unit="s" pointActivation={{ on: 'click', onActivate: () => {} }} exportActions={{ exportAllowed: true }} {...props} /></I18nProvider>;
  const view = render(frame(extra));
  return { ...view, update: (next: Partial<AnalysisChartFrameProps>) => view.rerender(frame({ ...extra, ...next })) };
}
async function showTable() {
  fireEvent.click(await screen.findByRole('button', { name: '표로 보기' }));
  return screen.getByRole('table');
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

const plottedSeries = () => (plot.option as { series: { id: string; stack?: string; areaStyle?: unknown; data: unknown[] }[] }).series;

describe('Frame stack and area options (#2737)', () => {
  it.each(['bar', 'line'] as const)('stacks additive %s series only when opted in', async kind => {
    const view = mount({ series: series.map(s => ({ ...s, kind })), orientation: 'vertical', reaggregation: 'sum' });
    await screen.findByRole('img');
    expect(plottedSeries().slice(0, 2).map(s => s.stack)).toEqual([undefined, undefined]);
    view.update({ stacked: true });
    expect(plottedSeries()[0].stack).toBe(kind === 'bar' ? 'total' : undefined);
    view.update({ stackMode: 'stack' });
    const [a, b] = plottedSeries();
    expect(a.stack).toBeTruthy();
    expect(b.stack).toBe(a.stack);
    view.update({ stacked: true, stackMode: 'none' });
    expect(plottedSeries().slice(0, 2).map(s => s.stack)).toEqual([undefined, undefined]);
  });

  it('keeps horizontal lane, total and min/max output when switching to explicit stack mode', async () => {
    const view = mount({ stacked: true, startAlign: true, valueLabels: 'both', minMax: true, reaggregation: 'sum' });
    await screen.findByRole('img');
    const marks = () => plottedSeries().map(({ id, stack, data }) => ({ id, stack, data }));
    const legacy = marks();
    view.update({ stacked: false, stackMode: 'stack' });
    expect(marks()).toEqual(legacy);
  });

  it.each(['ratioOfSums', undefined] as const)('keeps a stack request with reaggregation=%s grouped and diagnoses it', async reaggregation => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount({ stackMode: 'stack', reaggregation });
    await screen.findByRole('img');
    expect(plottedSeries()[0].stack).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/stackMode.*reaggregation/));
  });

  it('exposes all three stack modes', () => {
    expectTypeOf<AnalysisChartFrameProps['stackMode']>().toEqualTypeOf<'none' | 'stack' | 'percent' | undefined>();
  });

  it('projects the visible measured total independently for each category', async () => {
    mount({ stackMode: 'percent', reaggregation: 'sum' });
    await screen.findByRole('img');
    const [a, b] = plottedSeries();
    expect(a.data[0]).toBe(75);
    expect(b.data[0]).toBe(25);
    expect(Number(a.data[1]) + Number(b.data[1])).toBeCloseTo(100);
    fireEvent.click(screen.getByRole('checkbox', { name: 'M2 (%)' }));
    expect(plottedSeries()[0].data.slice(0, 2)).toEqual([100, 100]);
  });

  it('leaves unknown values and zero totals without shares', async () => {
    const fixture = series.map(s => ({ ...s, points: [...s.points, ['Zero', 0]] as ChartSeries['points'] }));
    mount({ stackMode: 'percent', reaggregation: 'sum', series: fixture });
    await screen.findByRole('img');
    expect(plottedSeries().slice(0, 2).map(s => s.data.slice(-2))).toEqual([[null, null], [100, null]]);
  });

  it('shows a notice and warns when a negative value requires a raw stack', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount({ stackMode: 'percent', reaggregation: 'sum', series: [{ ...series[0], points: [['EQ1 · PM1', -3]] }, series[1]] });
    await screen.findByRole('img');
    expect(plottedSeries()[0]).toMatchObject({ stack: 'total', data: [-3] });
    expect(plot.option?.xAxis).toMatchObject({ min: undefined, name: 's' });
    expect(screen.getByText('음수 값이 있어 원래 값으로 쌓아 표시함').closest('[data-chart-notes]')).toBeVisible();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/percent.*negative/i));
  });

  it('keeps the signed axis when a percent fallback requests startAlign', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount({ stackMode: 'percent', reaggregation: 'sum', startAlign: true,
      series: [{ ...series[0], points: [['EQ1 · PM1', -3]] }, series[1]] });
    await screen.findByRole('img');
    expect(plot.option?.xAxis).toMatchObject({ min: undefined, name: 's' });
    expect(plottedSeries().some(s => s.id.startsWith('__spacer'))).toBe(false);
  });

  it('updates the same fallback status as a negative series is shown and hidden by keyboard', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const user = userEvent.setup();
    const view = mount({ stackMode: 'percent', reaggregation: 'sum', visibleSeriesIds: ['a'],
      series: [series[0], { ...series[1], points: [['EQ1 · PM1', -3]] }],
      onVisibleSeriesChange: visibleSeriesIds => view.update({ visibleSeriesIds }) });
    await screen.findByRole('img');
    const liveStatus = () => view.container.querySelector('[aria-live="polite"][aria-atomic="true"]');
    const announcement = liveStatus();
    expect(announcement).toBeInTheDocument();
    expect(announcement).toBeEmptyDOMElement();
    screen.getByRole('checkbox', { name: 'M2 (%)' }).focus();
    await user.keyboard(' ');
    expect(liveStatus()).toBe(announcement);
    expect(announcement).toHaveTextContent('음수 값이 있어 원래 값으로 쌓아 표시함');
    await user.keyboard(' ');
    expect(liveStatus()).toBe(announcement);
    expect(announcement).toBeEmptyDOMElement();
  });

  it('shares numeric values across the plot, tooltip, segment label, table and CSV', async () => {
    mount({ stackMode: 'percent', reaggregation: 'sum', valueLabels: 'both', startAlign: true,
      markLines: [{ y: 3, label: 'Raw limit' }], valueFormat: v => `RAW ${v}` });
    const table = await showTable();
    const option = plot.option as {
      xAxis: unknown;
      tooltip: { valueFormatter: (v: number) => string };
      series: { id: string; label: { formatter: (p: { value: number }) => string }; markLine?: unknown }[];
    };
    expect(option.xAxis).toMatchObject({ min: 0, max: 100, name: '%' });
    expect(option.tooltip.valueFormatter(75)).toBe('75 %');
    expect(option.series[0].label.formatter({ value: 75 })).toBe('75%');
    expect(option.series.map(s => s.id)).not.toContain('__total');
    expect(option.series.some(s => s.id.startsWith('__spacer') || s.markLine)).toBe(false);
    expect(within(table).getByRole('columnheader', { name: 'M1 (%)' })).toBeVisible();
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('EQ1 · PM17525');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.objectContaining({ unit: '%' }), ['x', 'M1 (%)', 'M2 (%)'],
      expect.arrayContaining([['EQ1 · PM1', 75, 25], ['EQ2 · PM1', '', 100]]));
  });

  it('passes raw values to point activation in percent mode', async () => {
    const activate = vi.fn();
    mount({ stackMode: 'percent', reaggregation: 'sum', pointActivation: { on: 'dblclick', onActivate: activate } });
    await screen.findByRole('img');
    act(() => plot.onEvents?.dblclick?.({ seriesId: 'a', dataIndex: 0, value: 75 }, {} as never));
    expect(activate).toHaveBeenCalledWith({ x: 'EQ1 · PM1', seriesId: 'a', value: 3 });
  });

  it('preserves default single-line fill and allows explicit fill choices', async () => {
    const view = mount({ orientation: 'vertical', series: [series[0]] });
    await screen.findByRole('img');
    expect(plottedSeries()[0].areaStyle).toEqual({ opacity: 0.09 });
    view.update({ areaFill: false });
    expect(plottedSeries()[0].areaStyle).toBeUndefined();
    view.update({ areaFill: true, series: [series[0], { ...series[1], kind: 'bar' }] });
    expect(plottedSeries().slice(0, 2).map(s => s.areaStyle)).toEqual([{ opacity: 0.09 }, undefined]);
  });

  it('uses the first value at repeated times for the stack, status, activation, table and CSV', async () => {
    const [early, late] = ['2026-09-01T00:00:00', '2026-09-01T02:00:00'];
    const [start, end] = [Date.UTC(2026, 8, 1), Date.UTC(2026, 8, 1, 2)];
    const activate = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount({ xType: 'time', orientation: 'vertical', stackMode: 'stack', reaggregation: 'sum',
      series: [{ ...series[0], points: [[early, 2], [late, 3], [late, 9]] }, { ...series[1], points: [[late, 5], [early, null]] }],
      pointStatus: point => point.seriesId === 'b' || point.value === 3 ? status : undefined,
      pointActivation: { on: 'dblclick', onActivate: activate } });
    await screen.findByRole('img');
    expect(plottedSeries().slice(0, 2).map(s => s.data)).toEqual([[[start, 2], [end, 3]], [[start, null], [end, 5]]]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/duplicate timestamp/i));
    expect(plottedSeries().find(s => s.id === '__line-status-b')?.data).toEqual([expect.objectContaining({ value: [end, 8] })]);
    act(() => plot.onEvents?.dblclick?.({ seriesId: 'b', dataIndex: 1 }, {} as never));
    expect(activate).toHaveBeenCalledWith({ x: late, seriesId: 'b', value: 5 });
    const table = await showTable();
    expect(table).toHaveTextContent('M1: ◆ 상한 초과');
    expect(within(table).getByRole('columnheader', { name: 'M1 (원래 값)' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(vi.mocked(downloadChartCsv).mock.lastCall?.slice(1)).toEqual([['x', 'M1 (원래 값)', 'M2 (원래 값)', '상태', '사유'], expect.arrayContaining([[late, 3, 5, 'M1: ◆ 상한 초과\nM2: ◆ 상한 초과', 'M1: Recipe 미구분\nM2: Recipe 미구분']])]);
  });
});

describe('opt-in Frame reading aids (#2326)', () => {
  it('uses group and short row labels in selector/table/summary/CSV but keeps callback identities', async () => {
    const activate = vi.fn();
    mount({ rowGroups, activeCategory: 'EQ1 · PM1', pointActivation: { on: 'click', onActivate: activate } });
    await screen.findByRole('img');
    const picker = screen.getByRole('combobox', { name: '차트 지점 선택' });
    expect(within(picker).getAllByRole('option')[0]).toHaveTextContent('설비: EQ1 · PM1');
    fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
    expect(activate).toHaveBeenCalledWith({ x: 'EQ1 · PM1', seriesId: 'a', value: 3 });
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('설비: EQ1 · PM1');
    const table = await showTable();
    expect(within(table).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['설비', '구간', 'M1', 'M2']);
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('EQ1PM131');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['설비', 'x', 'M1', 'M2'], [['EQ1', 'PM1', 3, 1], ['EQ1', 'PM2', 5, 2], ['EQ2', 'PM1', '', 4]]);
  });
  it('adds one deduplicated visible status legend and a status column, summary, and separate CSV label/reason columns', async () => {
    mount({ pointStatus: () => status });
    await screen.findByRole('img');
    const legend = screen.getByRole('group', { name: '범례' });
    expect(within(legend).getAllByText('상한 초과')).toHaveLength(1);
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('◆ 상한 초과 · Recipe 미구분');
    const table = await showTable();
    expect(within(table).getAllByRole('columnheader').at(-1)).toHaveTextContent('상태');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('M1: ◆ 상한 초과 · Recipe 미구분');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'M1', 'M2', '상태', '사유'], expect.arrayContaining([['EQ1 · PM1', 3, 1, 'M1: 상한 초과\nM2: 상한 초과', 'M1: Recipe 미구분\nM2: Recipe 미구분']]));
    act(() => plot.onEvents?.click?.({ seriesId: 'a', dataIndex: 2 }, {} as never));
    expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('상한 초과');
  });
  it('keeps the default table and CSV unchanged', async () => {
    mount(); await screen.findByRole('img');
    const table = await showTable();
    expect(within(table).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['구간', 'M1', 'M2']);
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'M1', 'M2'], [['EQ1 · PM1', 3, 1], ['EQ1 · PM2', 5, 2], ['EQ2 · PM1', '', 4]]);
  });
  it('ignores rowGroups on vertical charts and warns once across rerenders', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = mount({ orientation: 'vertical', rowGroups }); await screen.findByRole('img');
    view.update({ activeCategory: undefined, unit: 'ms' });
    expect(warn.mock.calls.filter(call => String(call[0]).includes('rowGroups'))).toHaveLength(1);
    expect(within(await showTable()).queryByRole('columnheader', { name: '설비' })).toBeNull();
  });
});

it('removes hidden series from the status legend, table, summary and CSV', async () => {
  const view = mount({ pointStatus: point => point.seriesId === 'b' ? status : undefined });
  await screen.findByRole('img');
  expect(screen.getByText('상한 초과')).toBeTruthy();
  view.update({ visibleSeriesIds: ['a'] });
  expect(screen.queryByText('상한 초과')).toBeNull();
  expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('Recipe 미구분');
  const table = await showTable();
  expect(table).not.toHaveTextContent('Recipe 미구분');
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
  expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'M1', '상태', '사유'], [['EQ1 · PM1', 3, '', ''], ['EQ1 · PM2', 5, '', ''], ['EQ2 · PM1', '', '', '']]);
});
it('names the selected grouped point without needing activeCategory and leaves unmapped groups empty', async () => {
  mount({ rowGroups: { header: rowGroups.header, byCategory: new Map([['EQ1 · PM1', { group: 'EQ1', label: 'PM1' }]]) } });
  await screen.findByRole('img');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('설비: EQ1 · PM1');
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
  expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['설비', 'x', 'M1', 'M2'], [['EQ1', 'PM1', 3, 1], ['', 'EQ1 · PM2', 5, 2], ['', 'EQ2 · PM1', '', 4]]);
});

it('deduplicates status legend entries by tone and label, independently of per-piece reason', async () => {
  mount({ pointStatus: point => ({ tone: point.seriesId === 'a' ? 'danger' : 'warning', label: '한도 초과', reason: point.x }) });
  await screen.findByRole('img');
  const legend = screen.getByRole('group', { name: '범례' });
  expect(within(legend).getAllByText('한도 초과')).toHaveLength(2);
  expect(legend).toHaveTextContent('■');
  expect(legend).toHaveTextContent('◆');
});


it.each([false, true])('keeps startAlign spacers out of status legends, tables and CSV, minMax=%s', async minMax => {
  const pointStatus = vi.fn((_point: { seriesId: string }) => status);
  const view = mount({ stacked: true, startAlign: true, rowGroups, pointStatus, minMax });
  await screen.findByRole('img');
  const plotted = plot.option as { series: { id: string; data: unknown[]; itemStyle?: { color: string } }[] };
  expect(plotted.series.find(s => s.id === '__rowGroups')).toBeDefined();
  const spacer = plotted.series.find(s => s.id === '__spacer-1')!;
  expect(spacer.itemStyle?.color).toBe('transparent');
  expect(spacer.data.every(value => typeof value === 'number')).toBe(true);
  expect(pointStatus.mock.calls.every(([point]) => ['a', 'b'].includes(point.seriesId))).toBe(true);
  const legend = screen.getByRole('group', { name: '범례' });
  expect(within(legend).getAllByText('상한 초과')).toHaveLength(1);
  expect(legend).not.toHaveTextContent('__spacer');
  const table = await showTable();
  expect(within(table).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['설비', '구간', 'M1', 'M2', '상태']);
  const laneRows = within(table).getAllByRole('row').map(row => row.textContent);
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
  const laneCsv = vi.mocked(downloadChartCsv).mock.calls.at(-1)!;
  expect(laneCsv[1]).toEqual(['설비', 'x', 'M1', 'M2', '상태', '사유']);
  expect(laneCsv[2]).toEqual([
    ['EQ1', 'PM1', 3, 1, 'M1: 상한 초과\nM2: 상한 초과', 'M1: Recipe 미구분\nM2: Recipe 미구분'],
    ['EQ1', 'PM2', 5, 2, 'M1: 상한 초과\nM2: 상한 초과', 'M1: Recipe 미구분\nM2: Recipe 미구분'],
    ['EQ2', 'PM1', '', 4, 'M2: 상한 초과', 'M2: Recipe 미구분'],
  ]);
  view.update({ startAlign: false });
  expect(within(screen.getByRole('table')).getAllByRole('row').map(row => row.textContent)).toEqual(laneRows);
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
  expect(vi.mocked(downloadChartCsv).mock.calls.at(-1)!.slice(1)).toEqual(laneCsv.slice(1));
});

it('uses the empty category label in table and CSV based on displayed series only', async () => {
  const emptyCategoryLabel = 'Held out';
  const view = mount({ emptyCategoryLabel });
  const table = await showTable();
  const cells = () => within(within(table).getAllByRole('row').at(-1)!).getAllByRole('cell').map(cell => cell.textContent);
  const exportRow = () => {
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    return vi.mocked(downloadChartCsv).mock.calls.at(-1)?.[2].at(-1);
  };
  expect(cells()).toEqual(['EQ2 · PM1', '—', '4']);
  expect(exportRow()).toEqual(['EQ2 · PM1', '', 4]);

  view.update({ series: [series[0], { ...series[1], points: series[1].points.slice(0, -1) }] });
  expect(cells()).toEqual(['EQ2 · PM1', emptyCategoryLabel, emptyCategoryLabel]);
  expect(exportRow()).toEqual(['EQ2 · PM1', emptyCategoryLabel, emptyCategoryLabel]);
  expect(within(screen.getByRole('group', { name: '범례' })).queryByText(emptyCategoryLabel)).toBeNull();
  expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent(emptyCategoryLabel);

  view.update({ visibleSeriesIds: ['a'] });
  expect(cells()).toEqual(['EQ2 · PM1', emptyCategoryLabel]);
  expect(exportRow()).toEqual(['EQ2 · PM1', emptyCategoryLabel]);

  view.update({ visibleSeriesIds: ['a'], orientation: 'vertical' });
  expect(cells()).toEqual(['EQ2 · PM1', '—']);
  expect(exportRow()).toEqual(['EQ2 · PM1', '']);
});
