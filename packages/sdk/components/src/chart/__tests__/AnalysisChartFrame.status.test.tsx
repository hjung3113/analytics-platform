import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(await screen.findByRole('button', { name: '같은 데이터를 표로 보기' }));
  return screen.getByRole('table');
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

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
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'M1', 'M2', '상태', '사유'], expect.arrayContaining([['EQ1 · PM1', 3, 1, 'M1: 상한 초과\nM2: 상한 초과', 'M1: Recipe 미구분\nM2: Recipe 미구분']]));
    act(() => plot.onEvents?.click?.({ seriesId: 'a', dataIndex: 2 }, {} as never));
    expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('상한 초과');
  });
  it('keeps the default table and CSV unchanged', async () => {
    mount(); await screen.findByRole('img');
    const table = await showTable();
    expect(within(table).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['구간', 'M1', 'M2']);
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
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
  expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'M1', '상태', '사유'], [['EQ1 · PM1', 3, '', ''], ['EQ1 · PM2', 5, '', ''], ['EQ2 · PM1', '', '', '']]);
});
it('names the selected grouped point without needing activeCategory and leaves unmapped groups empty', async () => {
  mount({ rowGroups: { header: rowGroups.header, byCategory: new Map([['EQ1 · PM1', { group: 'EQ1', label: 'PM1' }]]) } });
  await screen.findByRole('img');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('설비: EQ1 · PM1');
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
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
  expect(vi.mocked(downloadChartCsv).mock.calls.at(-1)!.slice(1)).toEqual(laneCsv.slice(1));
});
