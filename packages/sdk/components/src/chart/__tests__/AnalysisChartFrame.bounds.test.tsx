import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { exportRegistry } from './test-support';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { downloadChartCsv } from '../analysisChartCsv';
let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" />; } }));
vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
const series: ChartSeries[] = [{ id: 'a', name: 'Current', color: 'chart-blue', points: [['A', 3], ['B', 5], ['C', null]] }];
const bounds = new Map([['A', { lower: 1, upper: 4 }], ['B', { upper: 8 }]]);
function mount(extra: Partial<AnalysisChartFrameProps> = {}) {
  const frame = (props: Partial<AnalysisChartFrameProps>) => <AnalysisChartFrame chartId="bounds" title="Trend" series={series} xType="category" unit="s" exportActions={{ exportAllowed: true }} {...props} />;
  const exportAllowed = true;
  const base = exportRegistry(exportAllowed);
  const registry = createRegistry({ spaces: base.spaces, groups: base.groups, menus: base.menus.map(menu => ({ ...menu, features: { ...menu.features, compare: true } })) });
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  if (extra.compareSeries) window.history.replaceState(null, '', '/?v=1');
  const wrap = (props: Partial<AnalysisChartFrameProps>) => <I18nProvider>{extra.compareSeries ? <PlatformProvider adapter={adapter} registry={registry}>{frame(props)}</PlatformProvider> : frame(props)}</I18nProvider>;
  const view = render(wrap(extra));
  return { ...view, update: (next: Partial<AnalysisChartFrameProps>) => view.rerender(wrap({ ...extra, ...next })) };
}
async function table() {
  fireEvent.click(await screen.findByRole('button', { name: '표로 보기' }));
  return screen.getByRole('table');
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('Frame bounds and line status reading aids (#2333)', () => {
  it('adds bounds to table, selector, summary and CSV with an empty missing side', async () => {
    mount({ bounds }); await screen.findByRole('img');
    expect(screen.getByRole('combobox', { name: '차트 지점 선택' })).toHaveTextContent('하한: 1 · 상한: 4');
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('하한: 1 · 상한: 4');
    const t = await table();
    expect(within(t).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['구간', 'Current', '하한', '상한']);
    expect(within(t).getAllByRole('row')[2].textContent).toBe('B58');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'Current', '하한', '상한'], [['A', 3, 1, 4], ['B', 5, '', 8], ['C', '', '', 8]]);
    const legend = screen.getByRole('group', { name: '범례' });
    expect(legend.querySelectorAll('[data-chart-bound-legend]')).toHaveLength(3);
  });
  it('ignores horizontal bounds in option/table/export and warns only once across rerenders', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = mount({ bounds, orientation: 'horizontal' }); await screen.findByRole('img');
    view.update({ unit: 'ms' });
    expect(warn.mock.calls.filter(c => String(c[0]).includes('bounds'))).toHaveLength(1);
    expect(within(await table()).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['구간', 'Current']);
    expect(JSON.stringify(plot.option)).not.toContain('__bounds');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'Current'], [['A', 3], ['B', 5], ['C', '']]);
  });
  it('keeps the default table and CSV unchanged', async () => {
    mount(); await screen.findByRole('img');
    expect(screen.queryByRole('combobox', { name: '차트 지점 선택' })).toBeNull();
    expect(within(await table()).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['구간', 'Current']);
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'Current'], [['A', 3], ['B', 5], ['C', '']]);
  });
  it('projects line statuses into legend/table/summary/CSV and removes hidden and null statuses', async () => {
    const pointStatus = vi.fn(() => ({ tone: 'danger' as const, label: 'High', reason: 'Limit' }));
    const view = mount({ pointStatus }); await screen.findByRole('img');
    expect(pointStatus.mock.calls).toHaveLength(2);
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('■ High · Limit');
    expect(screen.getByRole('group', { name: '범례' })).toHaveTextContent('High');
    expect(await table()).toHaveTextContent('Current: ■ High · Limit');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['x', 'Current', '상태', '사유'], [['A', 3, 'Current: ■ High', 'Current: Limit'], ['B', 5, 'Current: ■ High', 'Current: Limit'], ['C', '', '', '']]);
    act(() => plot.onEvents?.click?.({ seriesId: 'a', dataIndex: 2 }, {} as never));
    expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('High');
    view.update({ visibleSeriesIds: [] });
    expect(screen.getByRole('group', { name: '범례' })).not.toHaveTextContent('High');
  });
  it('shows custom labels and omits bounds for a selected comparison point', async () => {
    const times = ['2026-11-16T09:00:00', '2026-11-16T10:00:00'];
    const current: ChartSeries[] = [{ ...series[0], points: [[times[0], 3], [times[1], 5]] }];
    mount({ xType: 'time', series: current, compareSeries: [{ ...current[0], id: 'p', name: 'Previous' }], bounds: new Map([[times[0], { upper: 8 }]]), boundLabels: { upper: 'High limit' } });
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    const picker = screen.getByRole('combobox', { name: '차트 지점 선택' });
    const options = within(picker).getAllByRole('option');
    expect(options[0]).toHaveTextContent('High limit: 8');
    expect(options.at(-1)).not.toHaveTextContent('High limit');
    fireEvent.change(picker, { target: { value: (options.at(-1) as HTMLOptionElement).value } });
    expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('High limit:');
    expect(within(await table()).getAllByRole('columnheader').filter(c => c.textContent === 'High limit')).toHaveLength(1);
  });
});

const hours = Array.from({ length: 15 }, (_, n) => `2026-11-16T${String(n).padStart(2, '0')}:00:00`);
async function compareAlternatingTimes() {
  const points = (parity: number): ChartSeries['points'] => hours.flatMap((x, n) => n % 2 === parity ? [[x, n]] : []);
  mount({ xType: 'time', stackMode: 'stack', reaggregation: 'sum', bounds: new Map([[hours[0], { upper: 20 }]]),
    series: [{ ...series[0], points: points(1) }], compareSeries: [{ ...series[0], id: 'p', points: points(0) }] });
  const options = () => (plot.option as { series: { name?: string; data: unknown[]; renderItem: (params: { dataIndex: number }, api: { coord: (point: number[]) => number[] }) => { shape: unknown } }[] }).series;
  await screen.findByRole('img');
  const before = options();
  fireEvent.click(screen.getByRole('button', { name: '비교' }));
  return { before, after: options() };
}

it('includes matching comparison values and falls back for mismatched sparse times', async () => {
  const [first, , last] = hours;
  const current: ChartSeries = { ...series[0], points: [[last, 3], [first, 2], [last, 99]] };
  const previous: ChartSeries = { ...current, id: 'p', points: [[first, 2], [last, 1]] };
  const view = mount({ xType: 'time', stackMode: 'percent', reaggregation: 'sum', series: [current], compareSeries: [previous],
    bounds: new Map([[first, { upper: 8 }]]) });
  const options = () => (plot.option as { series: { name?: string; data: [number, number][] }[] }).series;
  const values = () => options().slice(0, 2).map(s => s.data.map(([, y]) => y));
  await screen.findByRole('img');
  expect(values()[0]).toEqual([100, 100]);
  expect(options().some(s => s.name === '상한')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '비교' }));
  expect(values()).toEqual([[50, 75], [50, 25]]);
  view.update({ compareSeries: [{ ...previous, points: [[last, 1]] }] });
  expect(values()).toEqual([[2, 3], [1]]);
  expect(screen.getByText('관측 시각이 달라 계열을 따로 표시함')).toBeVisible();
});

it('keeps the plotted baseline within the current period when compare adds earlier and later times', async () => {
  const { before, after } = await compareAlternatingTimes();
  const ends = (options: typeof before) => options.find(s => s.name === '상한')!.renderItem({ dataIndex: 0 }, { coord: (p: number[]) => p }).shape;
  expect(ends(after)).toEqual(ends(before));
});

it('keeps interleaved compare lines and their symbols without allocating padding', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { before, after } = await compareAlternatingTimes();
  expect(after[0]).toMatchObject({ data: before[0].data, showSymbol: true, stack: undefined });
  expect(after[1]).toMatchObject({ showSymbol: true, stack: undefined, data: hours.filter((_, n) => n % 2 === 0).map((x, n) => [Date.parse(`${x}Z`), n * 2]) });
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/matching timestamps/i));
});

it('shows the time stack fallback in the chart notes only while timestamps differ in production', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  try {
    await compareAlternatingTimes();
    const notice = '관측 시각이 달라 계열을 따로 표시함';
    expect(screen.getByText(notice).closest('[data-chart-notes]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
  } finally {
    vi.unstubAllEnvs();
  }
});

it('renders no current-bounds line for a selected day with neither bound (#2426)', async () => {
  mount({ bounds: new Map([['A', { lower: 1 }], ['B', {}]]) });
  await screen.findByRole('img');
  const picker = screen.getByRole('combobox', { name: '차트 지점 선택' });
  const options = within(picker).getAllByRole('option');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('하한: 1');
  expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('상한:');
  fireEvent.change(picker, { target: { value: (options[1] as HTMLOptionElement).value } });
  expect(screen.getByRole('region', { name: '선택 요약' })).not.toHaveTextContent('현재 기간 기준');
});
