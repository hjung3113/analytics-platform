import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useI18n, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChart, type ChartSpec } from './AnalysisChart';
import { readColorToken } from '@ap/ui/theme';
import type { EChartProps } from './EChart';

let plot: EChartProps;
vi.mock('./EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
function ChangeContext() {
  const { setGlobal } = usePlatform();
  const { setLang } = useI18n();
  return <><button onClick={() => setLang('en')}>english</button><button onClick={() => setGlobal({ scopeId: 'FDRY' })}>context</button></>;
}
function mount(spec: ChartSpec, canExport = false, hasRoute = true) {
  window.history.replaceState(null, '', hasRoute ? '/?v=1&scopeId=MEM' : '/missing?v=1&scopeId=MEM');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: 'G', en: 'G' }, icon: House, space: 'analytics' }], menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: canExport, compare: true, annotate: true, savedView: false }, pageKeys: [] }] });
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const wrap = (next: ChartSpec) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ChangeContext /><AnalysisChart chartId="test" title="Chart" unit="ea" spec={next} /></PlatformProvider></I18nProvider>;
  const view = render(wrap(spec));
  return { ...view, update: (next: ChartSpec) => view.rerender(wrap(next)) };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AnalysisChart scatter', () => {
  it('keeps null points in the accessible table but omits them from grouped plots', async () => {
    mount({ kind: 'scatter', xLabel: 'Time', yLabel: 'Count', xUnit: 's', points: [
      { id: 'a', x: 1, y: 2, group: 'A', label: 'First' },
      { id: 'unknown', x: null, y: 3, group: 'A' },
      { id: 'b', x: 4, y: 5, group: 'B' },
    ] });
    await screen.findByRole('img');
    const option = plot.option as { series: { symbol: string; data: { value: number[] }[] }[] };
    expect(option.series.map(s => s.symbol)).toEqual(['circle', 'rect']);
    expect(option.series.map(s => s.data.map(d => d.value))).toEqual([[[1, 2]], [[4, 5]]]);
    expect(screen.getByText(/1개 미확인/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('table')).toHaveTextContent('Time (s)');
    expect(screen.getByRole('table')).toHaveTextContent('미확인');
    expect(screen.queryByRole('button', { name: '상세' })).toBeNull();
  });
});

describe('AnalysisChart box plot', () => {
  it('renders caller whiskers, median and outliers with matching table data', async () => {
    mount({ kind: 'boxPlot', whisker: 'tukey', groups: [{ id: 'a', label: 'Group A', stats: { min: 1, q1: 2, median: 3, q3: 4, max: 5, outliers: [9], n: 12 } }] });
    await screen.findByRole('img');
    const series = (plot.option as { series: { type: string; itemStyle?: { borderColor: string }; data: { value: number[] }[] }[] }).series;
    expect(series[0].data[0].value).toEqual([1, 2, 3, 4, 5]);
    expect(series[1].data[0].value).toEqual([0, 9]);
    expect(series[0].itemStyle?.borderColor).toBe(readColorToken('chart-series-1-stroke'));
    expect(screen.getByText(/수염: 1.5×IQR/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(screen.getByRole('table')).toHaveTextContent('9 ea');
    expect(screen.getByRole('table')).toHaveTextContent('12');
  });
});

describe('AnalysisChart Pareto', () => {
  it('caps including Other, counts original items and accumulates displayed buckets', async () => {
    mount({ kind: 'pareto', items: [40, 30, 15, 10, 5].map((value, i) => ({ id: String(i), label: `P${i}`, value })), maxItems: 3, cumulativeTarget: 0.9 });
    await screen.findByRole('img');
    const series = (plot.option as { series: { data: ({ value: number } | number)[]; markLine?: { lineStyle: { color: string }; data: { yAxis: number; name: string }[] } }[] }).series;
    expect(series[0].data).toEqual(expect.arrayContaining([expect.objectContaining({ value: 40 }), expect.objectContaining({ value: 30 })]));
    expect(series[1].data).toEqual([40, 70, 100]);
    expect(series[1].markLine?.data).toEqual([{ yAxis: 90, name: '90%' }]);
    expect(series[1].markLine?.lineStyle.color).toBe(readColorToken('text-secondary'));
    expect(screen.getByText(/상위 4개 원본 항목이 90% 도달/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[3]).toHaveTextContent('기타30 ea100%');
  });
});

const scatter = { kind: 'scatter', xUnit: 's', xLabel: 'X', yLabel: 'Y', points: [{ id: 'a', label: 'Alpha', x: 1, y: 2 }, { id: 'b', label: 'Beta', x: 3, y: 4 }] } satisfies ChartSpec;
const stats = { min: 1, q1: 2, median: 3, q3: 4, max: 5 };
const box = { kind: 'boxPlot', whisker: 'minMax', groups: [{ id: 'a', label: 'Alpha', stats }, { id: 'b', label: 'Beta', stats }] } satisfies ChartSpec;
const pareto = { kind: 'pareto', items: [{ id: 'a', label: 'Alpha', value: 2 }, { id: 'b', label: 'Beta', value: 1 }] } satisfies ChartSpec;
const selection = () => screen.getByRole('region', { name: '선택 요약' });
const click = (seriesIndex: number, dataIndex: number) => act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex, dataIndex }, {} as never));
const brush = (selections: { seriesIndex: number; dataIndex: number[] }[]) => act(() => plot.onEvents?.brushselected?.({ batch: [{ selected: selections }] }, {} as never));
const end = () => act(() => plot.onEvents?.brushEnd?.({}, {} as never));

it('maps grouped scatter indices past omitted nulls, merges groups and commits only brushEnd', async () => {
  mount({ ...scatter, points: [{ id: 'null', group: 'A', x: null, y: 0 }, { id: 'a', group: 'B', x: 1, y: 2 }, { id: 'b', group: 'A', x: 2, y: 3 }] });
  await screen.findByRole('img');
  const option = plot.option;
  brush([{ seriesIndex: 0, dataIndex: [0] }]);
  brush([{ seriesIndex: 0, dataIndex: [0] }, { seriesIndex: 1, dataIndex: [0] }]);
  expect(plot.option).toBe(option); expect(selection()).toHaveTextContent('선택 없음');
  end(); expect(selection()).toHaveTextContent('2개 선택');
  expect(selection()).not.toHaveTextContent('null');
  const committed = plot.option;
  brush([{ seriesIndex: 1, dataIndex: [0] }, { seriesIndex: 0, dataIndex: [0] }]); end();
  expect(plot.option).toBe(committed);
  click(1, 0); expect(selection()).toHaveTextContent('b · 1개 선택');
});

it.each(['초기화', 'context'])('clears scatter pending selection and ECharts areas on %s', async action => {
  mount(scatter); await screen.findByRole('img');
  const dispatchAction = vi.fn(); act(() => plot.onReady?.({ dispatchAction } as never));
  brush([{ seriesIndex: 0, dataIndex: [0, 1] }]);
  fireEvent.click(screen.getByRole('button', { name: action })); end();
  expect(selection()).toHaveTextContent('선택 없음');
  expect(dispatchAction).toHaveBeenCalledWith({ type: 'brush', areas: [] });
});

it.each([scatter, box, pareto])('preserves $kind selection by ID on reorder, prunes removed IDs and clears on Context', async spec => {
  const view = mount(spec); await screen.findByRole('img');
  click(0, 0); expect(selection()).toHaveTextContent('Alpha');
  const reverse: ChartSpec = spec.kind === 'scatter' ? { ...spec, points: [...spec.points].reverse() } : spec.kind === 'boxPlot' ? { ...spec, groups: [...spec.groups].reverse() } : { ...spec, items: [...spec.items].reverse() };
  view.update(reverse); expect(selection()).toHaveTextContent('Alpha');
  const removed: ChartSpec = spec.kind === 'scatter' ? { ...spec, points: [spec.points[1]] } : spec.kind === 'boxPlot' ? { ...spec, groups: [spec.groups[1]] } : { ...spec, items: [spec.items[1]] };
  view.update(removed); expect(selection()).toHaveTextContent('선택 없음');
  click(0, 0); fireEvent.click(screen.getByRole('button', { name: '초기화' })); expect(selection()).toHaveTextContent('선택 없음');
  click(0, 0); fireEvent.click(screen.getByRole('button', { name: 'context' })); expect(selection()).toHaveTextContent('선택 없음');
});

it('clears pending IDs and cursor on kind change, preserving table visibility', async () => {
  const view = mount(scatter); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '끌어서 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  brush([{ seriesIndex: 0, dataIndex: [0] }]);
  view.update(box); expect(screen.getByRole('table')).toBeVisible();
  view.update(scatter); end();
  expect(selection()).toHaveTextContent('선택 없음');
  expect(screen.getByRole('button', { name: '끌어서 선택' })).toHaveAttribute('aria-pressed', 'false');
});

it('maps box outliers and median marks to the single owning group', async () => {
  mount({ ...box, groups: [{ ...box.groups[0], stats: { ...stats, outliers: [8, 9] } }, box.groups[1]] });
  await screen.findByRole('img');
  click(1, 1); expect(selection()).toHaveTextContent('Alpha');
  click(0, 1); expect(selection()).toHaveTextContent('Beta · 1개 선택');
  click(2, 1); expect(selection()).toHaveTextContent('선택 없음');
});

it('selects multiple Pareto bars, ignores line/reference events and never drills Other', async () => {
  const drill = vi.fn();
  mount({ ...pareto, maxItems: 2, items: [...pareto.items, { id: 'c', label: 'Gamma', value: 1 }], onItemClick: drill }); await screen.findByRole('img');
  click(1, 0); expect(selection()).toHaveTextContent('선택 없음');
  act(() => plot.onEvents?.click?.({ componentType: 'markLine', seriesIndex: 1, dataIndex: 0 }, {} as never));
  expect(selection()).toHaveTextContent('선택 없음');
  click(0, 0); click(0, 1); expect(selection()).toHaveTextContent('2개 선택'); expect(drill).not.toHaveBeenCalled();
  click(0, 0); expect(selection()).toHaveTextContent('기타'); expect(within(selection()).queryByRole('button')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const last = within(screen.getByRole('table')).getAllByRole('row').at(-1)!;
  expect(within(last).queryByRole('button')).toBeNull();
});

it.each([scatter, box, pareto])('supports $kind keyboard selection and explicit drill in table and summary', async spec => {
  const user = userEvent.setup(); const drill = vi.fn();
  const withDrill: ChartSpec = spec.kind === 'scatter' ? { ...spec, onPointClick: drill } : spec.kind === 'boxPlot' ? { ...spec, onGroupClick: drill } : { ...spec, onItemClick: drill };
  mount(withDrill); await screen.findByRole('img');
  const before = window.location.href; const history = vi.spyOn(window.history, 'replaceState');
  await user.click(screen.getByRole('button', { name: '표로 보기' })); await user.tab();
  expect(screen.getAllByRole('checkbox')[0]).toHaveFocus();
  await user.keyboard(' '); expect(screen.getAllByRole('checkbox')[0]).toBeChecked(); expect(drill).not.toHaveBeenCalled();
  await user.tab(); expect(within(screen.getByRole('table')).getAllByRole('button', { name: '상세' })[0]).toHaveFocus();
  await user.keyboard('{Enter}'); expect(drill).toHaveBeenLastCalledWith('a');
  await user.click(within(selection()).getByRole('button', { name: '상세' })); expect(drill).toHaveBeenCalledTimes(2);
  expect(window.location.href).toBe(before); expect(history).not.toHaveBeenCalled();
});

it.each([scatter, box, pareto])('uses English summary, table and toolbar for $kind without inventing drill', async spec => {
  mount(spec); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'english' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
  expect(screen.getByRole('button', { name: 'Reset' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Selection summary' })).toHaveTextContent('No selection');
  expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  const region = screen.getByRole('region', { name: 'Chart' });
  expect(document.getElementById(region.getAttribute('aria-describedby')!)).toHaveTextContent('ea');
});

it('normalizes scatter groups, duplicate IDs and invalid coordinates without losing null rows', async () => {
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ ...scatter, groups: [{ id: 'A', label: 'Declared', color: 'chart-purple' }, { id: 'A', label: 'Duplicate' }], points: [
    { id: 'a', group: 'A', x: 1, y: 2 }, { id: 'a', group: 'A', x: 99, y: 99 },
    { id: 'bad', x: Infinity, y: 2 }, { id: 'unknown', x: null, y: null },
    ...['B', 'C', 'D', 'E'].map((group, i) => ({ id: group, group, x: i, y: i })),
  ], referenceLines: [{ axis: 'x', value: 2, label: 'X ref' }, { axis: 'y', value: 3, label: 'Y ref' }] });
  await screen.findByRole('img');
  const option = plot.option as { series: { symbol: string; data: { itemStyle: { color: string } }[]; markLine?: { lineStyle: { color: string; type: string }; data: unknown[] } }[] };
  expect(option.series.map(s => s.symbol)).toEqual(['circle', 'rect', 'triangle', 'diamond', 'circle', 'rect']);
  expect(option.series[0].data[0].itemStyle.color).toBe(readColorToken('chart-purple'));
  expect(option.series.at(-1)!.data[0].itemStyle.color).toBe(readColorToken('chart-remainder'));
  expect(option.series[0].markLine?.lineStyle).toEqual({ color: readColorToken('text-secondary'), type: 'dashed' });
  expect(option.series[0].markLine?.data).toEqual([{ name: 'X ref', xAxis: 2 }, { name: 'Y ref', yAxis: 3 }]);
  expect(screen.getByRole('list', { name: '범례' }).textContent).toBe('Declared기본 그룹BCDE');
  expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('four scatter groups'));
  expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('duplicate ID'));
  expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('non-finite'));
  expect(diagnostic).toHaveBeenCalledWith(expect.stringContaining('undeclared'));
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(6);
});

it('matches scatter legend shapes to their plotted group shapes and uses first-point order', async () => {
  mount({ ...scatter, points: [ { id: 'b', x: 1, y: 2, group: 'B' }, { id: 'a', x: 2, y: 3 }, { id: 'c', x: 3, y: 4, group: 'C' }, { id: 'd', x: 4, y: 5, group: 'D' } ] });
  await screen.findByRole('img');
  const legend = screen.getByRole('list', { name: '범례' });
  expect(legend.textContent).toBe('B기본 그룹CD');
  const marks = legend.querySelectorAll('svg');
  expect(marks[0].querySelector('circle')).toHaveAttribute('fill', readColorToken('chart-series-1'));
  expect(marks[1].querySelector('rect')).toHaveAttribute('fill', readColorToken('chart-series-2'));
  expect(marks[2].querySelector('path')).toHaveAttribute('d', 'M7 1 L13 13 L1 13 Z');
  expect(marks[3].querySelector('path')).toHaveAttribute('d', 'M7 1 L13 7 L7 13 L1 7 Z');
});

it.each([
  { min: 4, q1: 2, median: 3, q3: 4, max: 5 },
  { ...stats, q1: NaN }, { ...stats, outliers: [Infinity] }, { ...stats, n: -1 }, { ...stats, n: 1.5 },
  { ...stats, min: -2, max: 8 },
])('treats invalid box stats $min/$q1/$n as Unknown with a diagnostic', invalid => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ ...box, whisker: 'tukey', groups: [{ id: 'bad', label: 'Bad', stats: invalid }] });
  expect(screen.getByText('데이터 없음')).toBeVisible();
  expect(screen.getByText(/1개 미확인/)).toBeVisible();
  expect(error).toHaveBeenCalledWith(expect.stringContaining('invalid box statistics'));
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(within(screen.getByRole('table')).getAllByText('미확인')).toHaveLength(7);
});

it.each(['minMax', 'tukey'] as const)('uses caller-owned %s endpoints rather than substituting Tukey fences', async whisker => {
  mount({ ...box, whisker, groups: [{ id: 'a', label: 'Alpha', stats: { ...stats, min: 0, max: 6 } }] }); await screen.findByRole('img');
  const series = (plot.option as { series: { itemStyle?: { color: string }; data: { value: number[] }[] }[] }).series;
  expect(series[0].data[0].value).toEqual([0, 2, 3, 4, 6]);
  expect(series[2].itemStyle?.color).toBe(readColorToken('chart-median-on-fill'));
  expect(screen.getByText(whisker === 'tukey' ? /수염: 1.5×IQR/ : /수염: 최소–최대/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(within(screen.getByRole('table')).getByText('미확인')).toBeVisible();
});

it('cycles four box fill/stroke pairs, drops duplicate group IDs and uses neutral references', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ ...box, groups: [...Array.from({ length: 5 }, (_, i) => ({ id: String(i), label: `G${i}`, stats })), { id: '0', label: 'Duplicate', stats }], referenceLines: [{ value: 3, label: 'Reference' }] }); await screen.findByRole('img');
  const series = (plot.option as { series: { data: { itemStyle: { color: string; borderColor: string } }[]; markLine: { lineStyle: { color: string }; data: unknown[] } }[] }).series;
  expect(series[0].data).toHaveLength(5);
  expect(series[0].data[4].itemStyle).toMatchObject({ color: readColorToken('chart-series-1'), borderColor: readColorToken('chart-series-1-stroke') });
  expect(series[0].markLine.lineStyle.color).toBe(readColorToken('text-secondary'));
  expect(series[0].markLine.data).toEqual([{ name: 'Reference', yAxis: 3 }]);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('duplicate ID'));
});

it('sorts Pareto ties stably and drops negatives, non-finite values and later duplicate IDs', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ kind: 'pareto', items: [{ id: 'a', label: 'A', value: 1 }, { id: 'b', label: 'B', value: 2 }, { id: 'c', label: 'C', value: 2 }, { id: 'a', label: 'Duplicate', value: 10 }, { id: 'bad', label: 'Bad', value: -1 }, { id: 'inf', label: 'Infinity', value: Infinity }] }); await screen.findByRole('img');
  expect((plot.option as { xAxis: { data: string[] } }).xAxis.data).toEqual(['B', 'C', 'A']);
  expect((plot.option as { series: { data: number[] }[] }).series[1].data).toEqual([40, 80, 100]);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('duplicate ID'));
  expect(error).toHaveBeenCalledWith(expect.stringContaining('negative or non-finite'));
});

it.each([NaN, Infinity, 0, -1, 1.1])('diagnoses invalid target %s and uses neutral 80 percent reference', async cumulativeTarget => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ ...pareto, cumulativeTarget }); await screen.findByRole('img');
  const option = plot.option as { yAxis: { min: number; max?: number }[]; series: { markLine?: { data: unknown[] } }[] };
  expect(option.yAxis[0].min).toBe(0); expect(option.yAxis[1]).toMatchObject({ min: 0, max: 100 });
  expect(option.series[1].markLine?.data).toEqual([{ name: '80%', yAxis: 80 }]);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('invalid Pareto target'));
});

it.each([{ cap: 2.9, length: 2 }, { cap: -1, length: 2 }, { cap: NaN, length: 10 }, { cap: Infinity, length: 10 }, { cap: 30, length: 12 }])('resolves Pareto cap $cap to $length displayed rows', async ({ cap, length }) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ kind: 'pareto', maxItems: cap, items: Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: `I${i}`, value: 12 - i })) }); await screen.findByRole('img');
  expect((plot.option as { series: { data: unknown[] }[] }).series[0].data).toHaveLength(length);
});

it('formats Pareto cumulative percentages from unrounded values', async () => {
  mount({ kind: 'pareto', items: ['a', 'b', 'c'].map(id => ({ id, label: id, value: 1 })) }); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const table = screen.getByRole('table'); expect(table).toHaveTextContent('33.3%'); expect(table).toHaveTextContent('66.7%'); expect(table).toHaveTextContent('100%');
});

it.each<ChartSpec>([{ ...scatter, points: [{ id: 'a', x: null, y: 1 }] }, { ...box, groups: [{ id: 'a', label: 'A', stats: null }] }, { ...pareto, items: [{ id: 'a', label: 'A', value: 0 }] }, { ...scatter, points: [] }, { ...box, groups: [] }, { ...pareto, items: [] }])('retains summary and table path for empty/all-unknown $kind', spec => {
  mount(spec); expect(screen.getByText('데이터 없음')).toBeVisible(); expect(screen.queryByRole('img')).toBeNull();
  const region = screen.getByRole('region', { name: 'Chart' }); expect(document.getElementById(region.getAttribute('aria-describedby')!)).toHaveTextContent('ea');
  expect(region).not.toHaveTextContent('도달');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' })); expect(screen.getByRole('table')).toBeVisible();
});

it.each([scatter, box, pareto])('gates $kind CSV on feature and an active route', async spec => {
  const view = mount(spec, false); await screen.findByRole('img');
  expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull(); view.unmount();
  mount(spec, true, false); await screen.findByRole('img');
  expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
});

it.each<{ spec: ChartSpec; expected: string }>([
  { spec: { ...scatter, points: [{ id: 'a', x: 1, y: 2 }, { id: 'b', x: null, y: null }] }, expected: '# test · ea\r\nID,이름,그룹,X (s),Y (ea)\r\na,a,기본 그룹,1 s,2 ea\r\nb,b,기본 그룹,미확인,미확인\r\n' },
  { spec: { ...box, groups: [{ id: 'a', label: 'A', stats: { ...stats, outliers: [8, 9] } }, { id: 'b', label: 'B', stats: null }] }, expected: '# test · ea\r\n그룹,Min,Q1,중앙값,Q3,Max,n,이상치\r\nA,1 ea,2 ea,3 ea,4 ea,5 ea,미확인,8 ea; 9 ea\r\nB,미확인,미확인,미확인,미확인,미확인,미확인,미확인\r\n' },
  { spec: { ...pareto, maxItems: 2, items: [{ id: 'a', label: 'A', value: 3 }, { id: 'b', label: 'B', value: 2 }, { id: 'c', label: 'C', value: 1 }] }, expected: '# test · ea\r\n이름,값,누적 %\r\nA,3 ea,50%\r\n기타,3 ea,100%\r\n' },
])('exports the $spec.kind table projection including unknown/synthetic/outlier values', async ({ spec, expected }) => {
  const blobs: Blob[] = [];
  class DownloadURL extends URL {
    static createObjectURL(blob: Blob) { blobs.push(blob); return 'blob:test'; }
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal('URL', DownloadURL); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    mount(spec, true); await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    const table = screen.getByRole('table');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blobs[0]); });
    expect(text).toBe(expected);
    for (const row of within(table).getAllByRole('row').slice(1)) {
      for (const cell of within(row).getAllByRole('cell').slice(0, -1)) expect(text).toContain(cell.textContent!);
    }
  } finally { vi.unstubAllGlobals(); }
});

it.each(['ko', 'en'])('names box tooltip statistics in %s and preserves all data in the keyboard table', async lang => {
  mount(box); await screen.findByRole('img');
  if (lang === 'en') fireEvent.click(screen.getByRole('button', { name: 'english' }));
  const tooltip = (plot.option as { tooltip: { renderMode: string; formatter: (p: { seriesIndex: number; dataIndex: number }) => string } }).tooltip;
  expect(tooltip.renderMode).toBe('richText');
  const text = tooltip.formatter({ seriesIndex: 0, dataIndex: 0 });
  expect(text).toContain(lang === 'ko' ? '그룹: Alpha' : 'Group: Alpha');
  expect(text).toContain(lang === 'ko' ? '중앙값: 3 ea' : 'Median: 3 ea');
  expect(text).toContain(lang === 'ko' ? 'n: 미확인' : 'n: Unknown');
});

it('replays a scatter brush activated before the lazy renderer supplies its instance', async () => {
  mount(scatter); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '끌어서 선택' }));
  const dispatchAction = vi.fn(); act(() => plot.onReady?.({ dispatchAction } as never));
  expect(dispatchAction).toHaveBeenCalledWith({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } }, { silent: true });
});

it('does not carry a heatmap coordinate selection into a matching new-kind row ID', async () => {
  const view = mount({ kind: 'heatmap', xLabels: ['scatter'], yLabels: ['a'], cells: [{ x: 'scatter', y: 'a', value: 1 }] });
  await screen.findByRole('img'); click(0, 0);
  expect(selection()).toHaveTextContent('1칸 선택');
  view.update(scatter);
  expect(selection()).toHaveTextContent('선택 없음');
});
