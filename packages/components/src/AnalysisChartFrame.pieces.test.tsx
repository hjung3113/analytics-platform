import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from './AnalysisChartFrame';
import type { EChartProps } from './EChart';
import { downloadChartCsv } from './analysisChartCsv';
vi.mock('./analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));

let plot: EChartProps;
vi.mock('./EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
const series: ChartSeries[] = [
  { id: 'one', name: 'One', color: 'chart-blue', kind: 'bar', points: [['Row B | B1', 2], ['Row A | A1', 4]] },
  { id: 'two', name: 'Two', color: 'chart-purple', kind: 'bar', points: [['Row B | B1', 3], ['Row A | A1', 5]] },
];
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: true, savedView: false, annotate: false, compare: true }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
function frame(props: Partial<AnalysisChartFrameProps> = {}) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><AnalysisChartFrame chartId="pieces" title="Pieces" series={series} xType="category" unit="s" {...props} /></PlatformProvider></I18nProvider>;
}
async function mount(props: Partial<AnalysisChartFrameProps> = {}) {
  window.history.replaceState(null, '', '/?v=1');
  const view = render(frame(props));
  await screen.findByRole('img');
  return view;
}
function pointEvent(name: string) {
  act(() => plot.onEvents?.[name]?.({ seriesId: 'one', name: 'Row B | B1', value: 2, dataIndex: 0 }, {} as never));
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('AnalysisChartFrame SDK pieces (#541)', () => {
  it('activates a clicked point with its category, series and value without navigation', async () => {
    const onActivate = vi.fn();
    await mount({ pointActivation: { on: 'click', onActivate } });
    pointEvent('click');
    expect(onActivate).toHaveBeenCalledWith({ x: 'Row B | B1', seriesId: 'one', value: 2 });
    expect(window.location.search).toBe('?v=1');
  });
  it('cancels the delayed legacy click path on double click', async () => {
    const onActivate = vi.fn(); const onPointClick = vi.fn();
    await mount({ pointActivation: { on: 'dblclick', onActivate }, onPointClick });
    vi.useFakeTimers();
    pointEvent('click'); pointEvent('click'); pointEvent('dblclick');
    act(() => { vi.runAllTimers(); });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onPointClick).not.toHaveBeenCalled();
  });
  it('never runs the click path before a slow native double-click activation', async () => {
    const onActivate = vi.fn(); const onPointClick = vi.fn();
    await mount({ pointActivation: { on: 'dblclick', onActivate }, onPointClick });
    vi.useFakeTimers();
    pointEvent('click');
    act(() => { vi.advanceTimersByTime(400); });
    pointEvent('click'); pointEvent('dblclick');
    act(() => { vi.runAllTimers(); });
    expect(onActivate).toHaveBeenCalledExactlyOnceWith({ x: 'Row B | B1', seriesId: 'one', value: 2 });
    expect(onPointClick).not.toHaveBeenCalled();
  });
  it('only selects on a single click when opting into double click', async () => {
    const onPointClick = vi.fn();
    await mount({ pointActivation: { on: 'dblclick', onActivate: vi.fn() }, onPointClick });
    vi.useFakeTimers(); pointEvent('click');
    act(() => { vi.runAllTimers(); });
    expect(onPointClick).not.toHaveBeenCalled();
  });
  it('keeps the existing onPointClick immediate without new props', async () => {
    const onPointClick = vi.fn(); await mount({ onPointClick }); pointEvent('click');
    expect(onPointClick).toHaveBeenCalledWith('Row B | B1', 'one');
  });
  it.each(['contextmenu', 'Shift+F10', 'ContextMenu', 'toolbar'])('runs an action through %s', async method => {
    const onSelect = vi.fn(); await mount({ pointActions: [{ id: 'inspect', label: 'Inspect', onSelect }] });
    if (method === 'contextmenu') pointEvent('contextmenu');
    else if (method === 'toolbar') act(() => { screen.getByRole('button', { name: '지점 동작' }).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
    else fireEvent.keyDown(screen.getByRole('group', { name: '차트 지점' }), { key: method === 'Shift+F10' ? 'F10' : 'ContextMenu', shiftKey: method === 'Shift+F10' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Inspect' }));
    expect(onSelect).toHaveBeenCalledWith({ x: 'Row B | B1', seriesId: 'one', value: 2 });
  });
  it('offers a keyboard point picker and explicit activation button', async () => {
    const onActivate = vi.fn(); await mount({ pointActivation: { on: 'dblclick', onActivate } });
    const picker = screen.getByRole('combobox', { name: '차트 지점 선택' });
    fireEvent.change(picker, { target: { value: JSON.stringify(['two', 'Row A | A1']) } });
    fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
    expect(onActivate).toHaveBeenCalledWith({ x: 'Row A | A1', seriesId: 'two', value: 5 });
  });
  it('disables activation and actions during brush with a visible reason', async () => {
    const onActivate = vi.fn(); const onSelect = vi.fn();
    await mount({ pointActivation: { on: 'click', onActivate }, pointActions: [{ id: 'inspect', label: 'Inspect', onSelect }] });
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    pointEvent('click'); pointEvent('dblclick'); pointEvent('contextmenu');
    fireEvent.keyDown(screen.getByRole('group', { name: '차트 지점' }), { key: 'F10', shiftKey: true });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onActivate).not.toHaveBeenCalled(); expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText('구간 선택 중에는 지점 실행과 동작을 사용할 수 없습니다.')).toBeTruthy();
    expect((screen.getByRole('button', { name: '지점 동작' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('renders horizontal category rows in supplied order with stacked segments and table rows', async () => {
    await mount({ orientation: 'horizontal', stacked: true });
    const option = plot.option as any;
    expect(option.yAxis).toMatchObject({ type: 'category', inverse: true, data: ['Row B | B1', 'Row A | A1'] });
    expect(option.xAxis.type).toBe('value');
    expect(option.series.slice(0, 2)).toMatchObject([{ type: 'bar', stack: 'total', data: [2, 4] }, { type: 'bar', stack: 'total', data: [3, 5] }]);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByText('같은 데이터를 표로 보기'));
    expect(screen.getAllByRole('row').slice(1).map(row => row.textContent)).toEqual(['Row B | B123', 'Row A | A145']);
  });
  it('shares horizontal plotted categories and first values with the picker, callbacks, table and export', async () => {
    const onActivate = vi.fn(); const onSelect = vi.fn();
    await mount({ orientation: 'horizontal', visibleSeriesIds: ['two'], series: [
      { ...series[0], points: [['A', 1], ['A', 8]] },
      { ...series[1], points: [['A', 2], ['A', 99], ['B', 77]] },
    ], pointActivation: { on: 'click', onActivate }, pointActions: [{ id: 'inspect', label: 'Inspect', onSelect }] });
    const picker = screen.getByRole('combobox', { name: '차트 지점 선택' });
    expect(Array.from(picker.querySelectorAll('option')).map(option => option.textContent)).toEqual(['A · Two · 2']);
    expect((plot.option as any).yAxis.data).toEqual(['A']);
    expect((plot.option as any).series[0]).toMatchObject({ id: 'two', data: [2] });
    fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
    act(() => plot.onEvents?.click?.({ seriesId: 'two', dataIndex: 0 }, {} as never));
    expect(onActivate.mock.calls).toEqual([[{ x: 'A', seriesId: 'two', value: 2 }], [{ x: 'A', seriesId: 'two', value: 2 }]]);
    act(() => plot.onEvents?.contextmenu?.({ seriesId: 'two', name: 'B', value: 77 }, {} as never));
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => plot.onEvents?.contextmenu?.({ seriesId: 'two', dataIndex: 0 }, {} as never));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Inspect' }));
    expect(onSelect).toHaveBeenCalledWith({ x: 'A', seriesId: 'two', value: 2 });
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.objectContaining({ chartId: 'pieces' }), ['x', 'Two'], [['A', 2]]);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByText('같은 데이터를 표로 보기'));
    expect(screen.getAllByRole('row').slice(1).map(row => row.textContent)).toEqual(['A2']);
  });
  it('brushes a category range on the vertical axis in horizontal mode', async () => {
    await mount({ orientation: 'horizontal' });
    expect((plot.option as any).brush).toMatchObject({ yAxisIndex: 0, brushType: 'lineY' });
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    act(() => plot.onEvents?.brushEnd?.({ areas: [{ coordRange: [0, 1] }] }, { dispatchAction: vi.fn() } as never));
    expect(screen.getByText(/Row B \| B1 – Row A \| A1/)).toBeTruthy();
  });
  it('renders controlled visibility from props and only requests changes', async () => {
    const onVisibleSeriesChange = vi.fn(); const view = await mount({ visibleSeriesIds: ['one'], onVisibleSeriesChange });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Two' }));
    expect(onVisibleSeriesChange).toHaveBeenCalledWith(['one', 'two']);
    expect((screen.getByRole('checkbox', { name: 'Two' }) as HTMLInputElement).checked).toBe(false);
    view.rerender(frame({ visibleSeriesIds: ['two'], onVisibleSeriesChange }));
    await waitFor(() => expect((plot.option as any).series[0].id).toBe('two'));
  });
  it('keeps uncontrolled legend toggles and distinguishes all-off from empty data', async () => {
    await mount();
    fireEvent.click(screen.getByRole('checkbox', { name: 'One' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Two' }));
    expect(screen.getByText('표시할 시리즈를 모두 껐습니다')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'One' }));
    expect(screen.queryByText('표시할 시리즈를 모두 껐습니다')).toBeNull();
  });
  it('cancels pending activation work when brushing starts or the frame unmounts', async () => {
    const onPointClick = vi.fn();
    const view = await mount({ pointActivation: { on: 'dblclick', onActivate: vi.fn() }, onPointClick });
    vi.useFakeTimers(); pointEvent('click');
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    act(() => { vi.runAllTimers(); });
    expect(onPointClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    pointEvent('click'); view.unmount();
    act(() => { vi.runAllTimers(); });
    expect(onPointClick).not.toHaveBeenCalled();
  });
  it('keeps disabled consumer actions unavailable', async () => {
    const onSelect = vi.fn(); await mount({ pointActions: [{ id: 'inspect', label: 'Inspect', onSelect, disabled: true }] });
    pointEvent('contextmenu');
    const item = await screen.findByRole('menuitem', { name: 'Inspect' });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item); expect(onSelect).not.toHaveBeenCalled();
  });
  it('uses the controlled all-off state without treating empty data as hidden series', async () => {
    const view = await mount({ visibleSeriesIds: [] });
    expect(screen.getByText('표시할 시리즈를 모두 껐습니다')).toBeTruthy();
    view.rerender(frame({ series: [] }));
    expect(screen.queryByText('표시할 시리즈를 모두 껐습니다')).toBeNull();
  });
  it('preserves wall-clock point identity and value on time axes', async () => {
    const onActivate = vi.fn(); const onPointClick = vi.fn();
    await mount({ xType: 'time', series: [{ ...series[0], points: [['2026-10-21T10:20:00', 7]] }], pointActivation: { on: 'click', onActivate }, onPointClick });
    act(() => plot.onEvents?.click?.({ seriesId: 'one', dataIndex: 0 }, {} as never));
    expect(onActivate).toHaveBeenCalledWith({ x: '2026-10-21T10:20:00', seriesId: 'one', value: 7 });
    expect(onPointClick).toHaveBeenCalledWith('2026-10-21T10:20:00', 'one');
  });

  it('keeps horizontal export and trust aligned with the table projection', async () => {
    vi.mocked(downloadChartCsv).mockClear();
    await mount({ orientation: 'horizontal', visibleSeriesIds: ['two'], trust: { source: 'Test source', updated: 'Test updated', coverage: 'Test coverage' } });
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    expect(downloadChartCsv).toHaveBeenCalledWith(expect.objectContaining({ chartId: 'pieces' }), ['x', 'Two'], [['Row B | B1', 3], ['Row A | A1', 5]]);
    expect(screen.getByText(/Test source/)).toBeTruthy();
    expect(screen.getByText(/Test coverage/)).toBeTruthy();
  });
  it('aligns horizontal segments by category label and keeps unknown values null', async () => {
    await mount({ orientation: 'horizontal', series: [series[0], { ...series[1], points: [['Row A | A1', null], ['Row B | B1', 8]] }] });
    expect((plot.option as any).series[1].data).toEqual([8, null]);
  });
  it('opens right-click actions for the actual clicked point', async () => {
    const onSelect = vi.fn(); await mount({ pointActions: [{ id: 'inspect', label: 'Inspect', onSelect }] });
    act(() => plot.onEvents?.contextmenu?.({ seriesId: 'two', name: 'Row A | A1', dataIndex: 1, value: 5 }, {} as never));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Inspect' }));
    expect(onSelect).toHaveBeenCalledWith({ x: 'Row A | A1', seriesId: 'two', value: 5 });
  });
  it('retains uncontrolled comparison visibility while toggling current series', async () => {
    await mount({ compareSeries: [{ ...series[1], id: 'previous', name: 'Previous' }] });
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'One' }));
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    expect((screen.getByRole('checkbox', { name: 'Previous' }) as HTMLInputElement).checked).toBe(false);
  });
  it('drives comparison visibility from the same controlled ID set', async () => {
    const onVisibleSeriesChange = vi.fn();
    await mount({ compareSeries: [{ ...series[1], id: 'previous', name: 'Previous' }], visibleSeriesIds: ['previous'], onVisibleSeriesChange });
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    expect((plot.option as any).series[0].id).toBe('previous');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Previous' }));
    expect(onVisibleSeriesChange).toHaveBeenCalledWith([]);
    expect((screen.getByRole('checkbox', { name: 'Previous' }) as HTMLInputElement).checked).toBe(true);
  });

});
