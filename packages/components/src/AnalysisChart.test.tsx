import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useI18n, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChart, type ChartSpec } from './AnalysisChart';
import { readColorToken, type ThemeColorToken } from '@ap/ui/theme';
import type { EChartProps } from './EChart';

let plot: EChartProps;
vi.mock('./EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
const heat: ChartSpec = { kind: 'heatmap', xLabels: ['09', '10'], yLabels: ['A', 'B'], cells: [{ x: '09', y: 'A', value: 0 }, { x: '10', y: 'A', value: null }] };
function ChangeContext() {
  const { setGlobal } = usePlatform();
  const { setLang } = useI18n();
  return <><button onClick={() => setLang('en')}>english</button><button onClick={() => setGlobal({ scopeId: 'FDRY' })}>context</button></>;
}
function mount(spec: ChartSpec, canExport = false) {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: 'G', en: 'G' }, icon: House, space: 'analytics' }], menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: canExport, compare: true, annotate: true, savedView: false }, pageKeys: [] }] });
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const wrap = (next: ChartSpec) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ChangeContext /><AnalysisChart chartId="test" title="Chart" unit="ea" spec={next} /></PlatformProvider></I18nProvider>;
  const view = render(wrap(spec));
  return { ...view, update: (next: ChartSpec) => view.rerender(wrap(next)) };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AnalysisChart heatmap', () => {
  it('distinguishes zero, unknown and missing in plot, summary and same-data table', async () => {
    mount(heat);
    await screen.findByRole('img');
    const option = plot.option as { series: { data: { value: unknown[] }[] }[] };
    expect(option.series[0].data.map(d => d.value)).toEqual([[0, 0, 0], [1, 0, null]]);
    expect(screen.getByText(/2칸 비어 있음/)).toHaveTextContent('1칸 미확인');
    const section = screen.getByRole('region', { name: 'Chart' });
    expect(document.getElementById(section.getAttribute('aria-describedby')!)).toHaveTextContent('ea');
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('0');
    expect(rows[2]).toHaveTextContent('미확인');
  });
});

describe('AnalysisChart donut', () => {
  it('groups smallest slices into Other, keeps Unclassified separate, and preserves the denominator', async () => {
    mount({ kind: 'donut', slices: [10, 9, 8, 7, 6, 5].map((value, i) => ({ id: String(i), label: `S${i}`, value })), total: 50, maxSlices: 3 });
    await screen.findByRole('img');
    const series = (plot.option as { series: { data: { name: string; value: number }[] }[] }).series[0];
    expect(series.data.map(d => [d.name, d.value])).toEqual([['S0', 10], ['S1', 9], ['기타', 26], ['미분류', 5]]);
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveTextContent('20%');
    expect(screen.getByText('50 ea')).toBeTruthy();
  });
});

type CapturedOption = { series: { type: string; emphasis: { focus: string }; data: { value: unknown; name?: string; itemStyle: { color: string; borderColor: string; borderWidth: number; borderType?: string } }[] }[]; brush: { inBrush: object; outOfBrush: object }; tooltip: { formatter: (params: { dataIndex: number }) => string } };
const option = () => plot.option as CapturedOption;
const clickPlot = (index: number) => act(() => plot.onEvents?.click?.({ componentType: 'series', dataIndex: index }, {} as never));
const brushPlot = (indices: number[]) => act(() => plot.onEvents?.brushselected?.({ batch: [{ selected: [{ seriesIndex: 0, dataIndex: indices }] }] }, {} as never));
const selection = () => screen.getByRole('region', { name: '선택 요약' });

it.each<{ scale: import('./AnalysisChart').HeatmapSpec['scale']; values: number[]; tokens: ThemeColorToken[] }>([
  { scale: { type: 'sequential', domain: [0, 100] }, values: [0, 25, 50, 75, 100], tokens: ['chart-heat-seq-0', 'chart-heat-seq-1', 'chart-heat-seq-2', 'chart-heat-seq-3', 'chart-heat-seq-4'] },
  { scale: { type: 'diverging', pivot: 10, domain: [-30, 20] }, values: [-30, -10, 10, 30, 50], tokens: ['chart-heat-div-0', 'chart-heat-div-1', 'chart-heat-div-2', 'chart-heat-div-3', 'chart-heat-div-4'] },
  { scale: { type: 'diverging', pivot: 10, domain: [-30, 20], lowerIsBetter: false }, values: [-30, 10, 50], tokens: ['chart-heat-div-4', 'chart-heat-div-2', 'chart-heat-div-0'] },
  { scale: { type: 'threshold', breaks: [10, 20], labels: ['양호', '주의', '위험'] }, values: [0, 10, 20], tokens: ['chart-status-good', 'chart-status-warn', 'chart-status-critical'] },
])('maps $scale to public palette tokens, including inclusive threshold boundaries', async ({ scale, values, tokens }) => {
  mount({ kind: 'heatmap', scale, xLabels: values.map(String), yLabels: ['Y'], cells: values.map(value => ({ x: String(value), y: 'Y', value })) });
  await screen.findByRole('img');
  expect(option().series[0].data.map(d => d.itemStyle.color)).toEqual(tokens.map(name => readColorToken(name)));
  if (scale?.type === 'threshold') for (const label of scale.labels) expect(screen.getByText(label)).toBeTruthy();
});

it('uses dashed unknown markers and outline selection without changing ramp colours', async () => {
  mount(heat); await screen.findByRole('img');
  expect(option().series[0].data[1].itemStyle).toMatchObject({ color: readColorToken('chart-no-data'), borderColor: readColorToken('chart-no-data-pattern'), borderType: 'dashed' });
  expect(option().tooltip.formatter({ dataIndex: 0 })).toBe('09 · A: 0 ea');
  expect(option().tooltip.formatter({ dataIndex: 1 })).toBe('10 · A: 미확인');
  const color = option().series[0].data[0].itemStyle.color;
  brushPlot([0, 1]);
  act(() => plot.onEvents?.brushEnd?.({}, {} as never));
  expect(selection()).toHaveTextContent('2칸 선택');
  expect(option().series[0].data[0].itemStyle).toMatchObject({ color, borderColor: readColorToken('chart-selection-outline'), borderWidth: 1.5 });
  expect(option().series[0].emphasis.focus).toBe('none');
  expect(option().brush.inBrush).toEqual({}); expect(option().brush.outOfBrush).toEqual({});
});

it('shares canvas/table selection, drills only via Details, resets, clears on Context and prunes removed keys', async () => {
  const drill = vi.fn(); const view = mount({ ...heat, onCellClick: drill });
  await screen.findByRole('img'); const url = window.location.href;
  const history = vi.spyOn(window.history, 'replaceState');
  clickPlot(0); expect(selection()).toHaveTextContent('A · 09'); expect(drill).not.toHaveBeenCalled();
  fireEvent.click(within(selection()).getByRole('button', { name: '상세' })); expect(drill).toHaveBeenLastCalledWith('09', 'A');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const boxes = screen.getAllByRole('checkbox'); expect(boxes[0]).toBeChecked();
  fireEvent.click(boxes[1]); expect(selection()).toHaveTextContent('2칸 선택');
  const table = screen.getByRole('table'); fireEvent.click(within(table).getAllByRole('button', { name: '상세' })[1]);
  expect(drill).toHaveBeenCalledTimes(2); expect(drill).toHaveBeenLastCalledWith('10', 'A');
  expect(window.location.href).toBe(url); expect(history).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '초기화' })); expect(selection()).toHaveTextContent('선택 없음');
  brushPlot([0, 1]); act(() => plot.onEvents?.brushEnd?.({}, {} as never)); view.update({ ...heat, cells: [heat.cells[0]] });
  expect(selection()).toHaveTextContent('1칸 선택');
  fireEvent.click(screen.getByRole('button', { name: 'context' })); expect(selection()).toHaveTextContent('선택 없음');
  history.mockClear(); clickPlot(0); expect(history).not.toHaveBeenCalled();
});

it('reports invalid cells and threshold breaks without throwing and preserves valid cells', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ ...heat, cells: [...heat.cells, { x: 'outside', y: 'A', value: 5 }], scale: { type: 'threshold', breaks: [5, 5], labels: ['a', 'b', 'c'] } });
  await screen.findByRole('img'); expect(option().series[0].data).toHaveLength(2); expect(error).toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith('AnalysisChart: threshold breaks must be increasing; using sequential scale');
  expect(option().series[0].data.map(cell => cell.itemStyle.color)).toEqual([readColorToken('chart-heat-seq-2'), readColorToken('chart-no-data')]);
});

it('selects a donut slice without drill, switches centre, and drills only on Details', async () => {
  const drill = vi.fn(); mount({ kind: 'donut', slices: [{ id: 'a', label: 'Alpha', value: 20 }, { id: 'b', label: 'Beta', value: 80 }], onSliceClick: drill });
  await screen.findByRole('img'); expect(screen.getByText('100 ea')).toBeTruthy();
  clickPlot(0); expect(screen.getByText('20 ea')).toBeTruthy(); expect(drill).not.toHaveBeenCalled();
  fireEvent.click(within(selection()).getByRole('button', { name: '상세' })); expect(drill).toHaveBeenCalledExactlyOnceWith('a');
  clickPlot(0); expect(screen.getByText('100 ea')).toBeTruthy(); expect(selection()).toHaveTextContent('선택 없음');
  clickPlot(1); fireEvent.click(screen.getByRole('button', { name: '초기화' })); expect(screen.getByText('100 ea')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' })); fireEvent.click(screen.getAllByRole('checkbox')[1]);
  expect(selection()).toHaveTextContent('Beta'); expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
});

it('drops negative donut slices, diagnoses total below sum and uses the sum', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  mount({ kind: 'donut', total: 1, slices: [{ id: 'a', label: 'Alpha', value: 10 }, { id: 'bad', label: 'Bad', value: -3 }] });
  await screen.findByRole('img'); expect(option().series[0].data).toHaveLength(1); expect(screen.getByText('10 ea')).toBeTruthy(); expect(error).toHaveBeenCalledWith(expect.stringContaining('negative')); expect(error).toHaveBeenCalledWith(expect.stringContaining('total'));
});

it('shows an empty state for a zero denominator', () => {
  mount({ kind: 'donut', slices: [{ id: 'a', label: 'Alpha', value: 0 }] });
  expect(screen.getByText('데이터 없음')).toBeTruthy(); expect(screen.queryByRole('img')).toBeNull();
});

it.each([1, 9])('clamps maxSlices %i and preserves explicit colours with ordered defaults', async maxSlices => {
  mount({ kind: 'donut', maxSlices, slices: [{ id: 'a', label: 'A', value: 100, color: 'chart-purple' }, ...[40, 30, 20, 10, 5].map((value, i) => ({ id: String(i), label: `S${i}`, value }))] });
  await screen.findByRole('img'); const data = option().series[0].data;
  expect(data).toHaveLength(maxSlices === 1 ? 2 : 5);
  expect(data[0].itemStyle.color).toBe(readColorToken('chart-purple'));
  expect(data.at(-1)?.itemStyle.color).toBe(readColorToken('chart-remainder'));
  if (maxSlices === 9) expect(data.slice(1, 4).map(d => d.itemStyle.color)).toEqual(['chart-series-1', 'chart-series-2', 'chart-series-3'].map(c => readColorToken(c as ThemeColorToken)));
});

it.each([false, true])('gates export with features.export=%s and offers no Compare/Annotate', async enabled => {
  mount(heat, enabled); await screen.findByRole('img');
  expect(!!screen.queryByRole('button', { name: '내보내기' })).toBe(enabled);
  expect(screen.queryByRole('button', { name: '비교' })).toBeNull(); expect(screen.queryByRole('button', { name: '주석' })).toBeNull();
});

it('clears the ECharts brush areas as well as local selection on Reset and Context change', async () => {
  mount(heat); await screen.findByRole('img');
  const dispatchAction = vi.fn(); act(() => plot.onReady?.({ dispatchAction } as never));
  brushPlot([0]);
  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  expect(dispatchAction).toHaveBeenCalledWith({ type: 'brush', areas: [] });
  dispatchAction.mockClear(); brushPlot([0]); fireEvent.click(screen.getByRole('button', { name: 'context' }));
  expect(dispatchAction).toHaveBeenCalledWith({ type: 'brush', areas: [] });
});

it.each<{ spec: ChartSpec; expected: string }>([
  { spec: heat, expected: '# test · ea\r\nx,y,값\r\n09,A,0 ea\r\n10,A,미확인\r\n' },
  { spec: { kind: 'donut', slices: [{ id: 'a', label: 'Alpha, One', value: 20 }, { id: 'b', label: 'Beta', value: 80 }], total: 200 }, expected: '# test · ea\r\n이름,값,%\r\n"Alpha, One",20 ea,10%\r\nBeta,80 ea,40%\r\n미분류,100 ea,50%\r\n' },
])('exports the table projection for $spec.kind as CSV', async ({ spec, expected }) => {
  const blobs: Blob[] = [];
  class DownloadURL extends URL {
    static createObjectURL(blob: Blob) { blobs.push(blob); return 'blob:test'; }
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal('URL', DownloadURL);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    mount(spec, true); await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blobs[0]); });
    expect(text).toBe(expected); expect(DownloadURL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  } finally { vi.unstubAllGlobals(); }
});


it('selects and drills from the table with Tab, Space and Enter', async () => {
  const user = userEvent.setup(); const drill = vi.fn();
  mount({ ...heat, onCellClick: drill }); await screen.findByRole('img');
  await user.click(screen.getByRole('button', { name: '표로 보기' }));
  await user.tab(); expect(screen.getAllByRole('checkbox')[0]).toHaveFocus();
  await user.keyboard(' '); expect(screen.getAllByRole('checkbox')[0]).toBeChecked(); expect(selection()).toHaveTextContent('1칸 선택');
  expect(drill).not.toHaveBeenCalled(); await user.tab();
  expect(within(screen.getByRole('table')).getAllByRole('button', { name: '상세' })[0]).toHaveFocus();
  await user.keyboard('{Enter}'); expect(drill).toHaveBeenCalledExactlyOnceWith('09', 'A');
});

it('uses English chart, table, unknown, aggregate and drill copy', async () => {
  mount({ ...heat, onCellClick: vi.fn() }); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'english' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
  expect(screen.getAllByText('Unknown')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Selection summary' })).toHaveTextContent('No selection');
  expect(screen.getAllByRole('button', { name: 'Details' })).toHaveLength(2);
  expect(screen.getByRole('checkbox', { name: 'Select A · 09' })).toBeTruthy();
});

it.each([1, 24, 25])('shows every category label up to 24 categories (%i)', async count => {
  mount({ ...heat, xLabels: Array.from({ length: count }, (_, i) => String(i)), yLabels: Array.from({ length: count }, (_, i) => String(i)), cells: [{ x: '0', y: '0', value: 1 }] });
  await screen.findByRole('img');
  const axes = plot.option as { xAxis: { axisLabel: { interval: number | string } }; yAxis: { axisLabel: { interval: number | string } } };
  expect(axes.xAxis.axisLabel.interval).toBe(count <= 24 ? 0 : 'auto');
  expect(axes.yAxis.axisLabel.interval).toBe(count <= 24 ? 0 : 'auto');
});

it('marks the diverging pivot at the neutral midpoint in both languages', async () => {
  const view = mount({ ...heat, scale: { type: 'diverging', pivot: 60, domain: [30, 80] } });
  await screen.findByRole('img');
  const pivot = screen.getByText('60 목표');
  expect(pivot.parentElement).toHaveClass('left-1/2');
  expect(pivot.parentElement?.querySelector('[aria-hidden]')).toHaveClass('border-l');
  fireEvent.click(screen.getByRole('button', { name: 'english' }));
  expect(screen.getByText('60 target')).toBeTruthy();
  view.update({ ...heat, scale: { type: 'sequential' } });
  expect(screen.queryByText('60 target')).toBeNull();
});

it('puts keyboard-operable rectangle selection in the header instead of over the grid', async () => {
  const user = userEvent.setup();
  mount(heat); await screen.findByRole('img');
  const dispatchAction = vi.fn(); act(() => plot.onReady?.({ dispatchAction } as never));
  expect((plot.option as { brush: { toolbox: string[] } }).brush.toolbox).toEqual([]);
  const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
  const button = within(toolbar).getByRole('button', { name: '끌어서 선택' });
  within(toolbar).getByRole('button', { name: '초기화' }).focus();
  await user.tab(); expect(button).toHaveFocus();
  await user.keyboard('{Enter}'); expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(dispatchAction).toHaveBeenCalledWith({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } }, { silent: true });
  await user.keyboard(' '); expect(button).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'english' }));
  expect(screen.getByRole('button', { name: 'Drag to select' })).toBeTruthy();
});

it.each([
  { lang: 'ko', count: 1, expected: 'A · 09 · 1칸 선택' },
  { lang: 'ko', count: 3, expected: 'A · 09, A · 10, A · 11 · 3칸 선택' },
  { lang: 'ko', count: 5, expected: '5칸 선택 · A · 13–09' },
  { lang: 'ko', count: 25, expected: '25칸 선택 · E–A · 13–09' },
  { lang: 'en', count: 1, expected: 'A · 09 · 1 selected' },
  { lang: 'en', count: 3, expected: 'A · 09, A · 10, A · 11 · 3 selected' },
  { lang: 'en', count: 5, expected: '5 cells selected · A · 13–09' },
  { lang: 'en', count: 25, expected: '25 cells selected · E–A · 13–09' },
])('summarizes $count heatmap cells in $lang with axis-ordered ranges above three cells', async ({ lang, count, expected }) => {
  const xLabels = ['13', '12', '11', '10', '09'];
  const yLabels = ['E', 'D', 'C', 'B', 'A'];
  mount({ kind: 'heatmap', xLabels, yLabels, cells: yLabels.flatMap(y => xLabels.map(x => ({ x, y, value: 1 }))).reverse(), onCellClick: vi.fn() });
  await screen.findByRole('img');
  if (lang === 'en') fireEvent.click(screen.getByRole('button', { name: 'english' }));
  brushPlot(Array.from({ length: count }, (_, i) => i));
  act(() => plot.onEvents?.brushEnd?.({}, {} as never));
  const summary = screen.getByRole('region', { name: lang === 'ko' ? '선택 요약' : 'Selection summary' });
  expect(summary.textContent).toBe(expected + (count === 1 ? (lang === 'ko' ? '상세' : 'Details') : ''));
  expect(within(summary).queryAllByRole('button')).toHaveLength(count === 1 ? 1 : 0);
});

it.each(['초기화', 'context'])('clears the pending drag on %s so brushEnd cannot restore it', async action => {
  mount(heat); await screen.findByRole('img');
  clickPlot(1);
  brushPlot([0]);
  fireEvent.click(screen.getByRole('button', { name: action }));
  act(() => plot.onEvents?.brushEnd?.({}, {} as never));
  expect(selection()).toHaveTextContent('선택 없음');
});
