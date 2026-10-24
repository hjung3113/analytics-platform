import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from './AnalysisChartFrame';
import { GRID_BOTTOM, GRID_TOP, ROW_LABEL_GUTTER } from './analysisChartGeometry';
import type { EChartProps } from './EChart';

vi.mock('./EChartImpl', () => ({ default: FakePlot }));

type PlottedSeries = { id?: string; data?: unknown[] };
let plotProps: EChartProps | null = null;
const plotOption = () => plotProps!.option as unknown as { dataZoom?: unknown[]; grid: { containLabel?: boolean; top: number; bottom: number; left: number }; series: PlottedSeries[]; yAxis: { axisLabel: { formatter?: (v: string) => string } } };

/** Stand-in plot: one button per bar plays a click on that row; one plays a Brush over the first two rows. */
function FakePlot(props: EChartProps) {
  plotProps = props;
  const categories = (props.option as unknown as { yAxis: { data?: string[] } }).yAxis.data ?? [];
  return <div role="img" aria-label={props.ariaLabel}>
    {categories.map((c, dataIndex) => <button key={c} type="button" onClick={() => props.onEvents?.click?.({ seriesId: 'a', dataIndex, name: c }, {} as never)}>bar-{c}</button>)}
    <button type="button" onClick={() => props.onEvents?.brushEnd?.({ areas: [{ coordRange: [0, 1] }] }, { dispatchAction: () => {} } as never)}>fake-brush</button>
  </div>;
}

const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const rows: ChartSeries[] = [
  { id: 'a', name: 'A', color: 'chart-blue', points: [['R1', 3], ['R2', 5], ['R3', 7]] },
  { id: 'b', name: 'B', color: 'chart-teal', points: [['R1', 1], ['R2', 2], ['R3', 3]] },
];
function mount(props: Partial<AnalysisChartFrameProps> = {}) {
  window.history.replaceState(null, '', '/?v=1');
  const frame = (extra: Partial<AnalysisChartFrameProps>) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisChartFrame chartId="rf" title="Rows" series={rows} xType="category" orientation="horizontal" stacked unit="s" {...extra} />
  </PlatformProvider></I18nProvider>;
  const view = render(frame(props));
  return { ...view, update: (extra: Partial<AnalysisChartFrameProps>) => view.rerender(frame({ ...props, ...extra })) };
}
const bars = (category: string) => plotOption().series.filter(s => s.id !== '__overlay').map(s => s.data![['R1', 'R2', 'R3'].indexOf(category)]);
const highlighted = () => ['R1', 'R2', 'R3'].filter(c => bars(c).every(d => typeof d === 'object' && d !== null));

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { plotProps = null; warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('controlled activeCategory (#690b)', () => {
  it('reports a bar click and keeps the highlight at the prop value until the parent updates it', async () => {
    const onChange = vi.fn();
    const view = mount({ activeCategory: 'R1', onActiveCategoryChange: onChange });
    fireEvent.click(await screen.findByRole('button', { name: 'bar-R3' }));
    expect(onChange).toHaveBeenCalledWith('R3', 'pointer');
    expect(highlighted()).toEqual(['R1']);
    view.update({ activeCategory: 'R3' });
    expect(highlighted()).toEqual(['R3']);
  });

  it('shows no highlight when the prop is absent and a click changes nothing', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'bar-R2' }));
    expect(highlighted()).toEqual([]);
    expect(plotOption().yAxis.axisLabel.formatter).toBeUndefined();
  });

  it('marks the active row by border and bold label, not colour alone, and names it in the selection summary', async () => {
    mount({ activeCategory: 'R2' });
    await screen.findByRole('img');
    expect(bars('R2')).toEqual([expect.objectContaining({ itemStyle: expect.objectContaining({ borderWidth: 2 }) }), expect.objectContaining({ itemStyle: expect.objectContaining({ borderWidth: 2 }) })]);
    expect(plotOption().yAxis.axisLabel.formatter!('R2')).toBe('{active|R2}');
    expect(plotOption().yAxis.axisLabel.formatter!('R1')).toBe('R1');
    expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toContain('활성 행: R2');
  });

  it('calls the callback with keyboard from the point picker', async () => {
    const onChange = vi.fn();
    mount({ activeCategory: null, onActiveCategoryChange: onChange, pointActivation: { on: 'click', onActivate: () => {} } });
    const picker = await screen.findByRole('combobox', { name: '차트 지점 선택' });
    fireEvent.change(picker, { target: { value: JSON.stringify(['a', 'R3']) } });
    expect(onChange).toHaveBeenCalledWith('R3', 'keyboard');
  });

  it('keeps pointActivation as a separate path: a click focuses the row first, then activates', async () => {
    const order: string[] = [];
    mount({ activeCategory: 'R1', onActiveCategoryChange: c => order.push(`focus:${c}`), pointActivation: { on: 'click', onActivate: p => order.push(`activate:${p.x}`) } });
    fireEvent.click(await screen.findByRole('button', { name: 'bar-R2' }));
    expect(order).toEqual(['focus:R2', 'activate:R2']);
    fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
    expect(order).toHaveLength(3);
    expect(order[2].startsWith('activate:')).toBe(true);
  });
});

describe('rowPitch viewport (#690b)', () => {
  it('clamps a pitch below 24 to 24 and warns in development', async () => {
    mount({ rowPitch: 10 });
    await screen.findByRole('img');
    expect(plotProps!.height).toBe(3 * 24 + GRID_TOP + GRID_BOTTOM);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rowPitch 10'));
  });

  it('sizes the chart by rows × pitch and scrolls it inside the plot box', async () => {
    mount({ rowPitch: 30, height: 100 });
    const plot = (await screen.findByRole('img')).parentElement!;
    expect(plotProps!.height).toBe(3 * 30 + GRID_TOP + GRID_BOTTOM);
    expect(plot.className).toContain('overflow-y-auto');
    expect(plot.style.maxHeight).toBe('100px');
  });

  it('draws a fixed grid so row i starts at gridTop + i × pitch and the band is rows × pitch', async () => {
    mount({ rowPitch: 30 });
    await screen.findByRole('img');
    const grid = plotOption().grid;
    expect(grid.containLabel).toBe(false);
    expect(grid.top).toBe(GRID_TOP);
    expect(grid.left).toBe(ROW_LABEL_GUTTER);
    expect(plotProps!.height! - grid.top - grid.bottom).toBe(3 * 30);
  });

  it('turns category zoom off, hides the zoom button and keeps Brush', async () => {
    mount({ rowPitch: 26 });
    await screen.findByRole('img');
    expect(plotOption().dataZoom).toEqual([]);
    expect(screen.queryByRole('button', { name: '확대' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'fake-brush' }));
    expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toContain('R1 – R2');
  });

  it('leaves existing horizontal consumers their zoom', async () => {
    mount();
    await screen.findByRole('img');
    expect(plotOption().dataZoom).toHaveLength(1);
    expect(screen.getByRole('button', { name: '확대' })).toBeTruthy();
  });

  it('scrolls a hidden active row to gridTop + index × pitch on an outside change, but not for its own click', async () => {
    // The owner accepts the request inside the click event, as a controlled parent does.
    const owner: { accept?: (c: string | null) => void } = {};
    const view = mount({ rowPitch: 30, revealActive: true, activeCategory: 'R1', onActiveCategoryChange: c => owner.accept?.(c) });
    owner.accept = c => view.update({ activeCategory: c });
    const plot = (await screen.findByRole('img')).parentElement!;
    Object.defineProperty(plot, 'clientHeight', { configurable: true, value: 40 });
    act(() => view.update({ activeCategory: 'R3' }));
    expect(plot.scrollTop).toBe(GRID_TOP + 2 * 30);
    plot.scrollTop = 0;
    fireEvent.click(screen.getByRole('button', { name: 'bar-R2' }));
    expect(plot.scrollTop).toBe(0);
  });
});

describe('reveal after an ignored pointer request (#690b FIX1)', () => {
  it('still reveals when the parent later sets the category the ignored click asked for', async () => {
    const view = mount({ rowPitch: 30, revealActive: true, activeCategory: 'R1', onActiveCategoryChange: () => {} });
    const plot = (await screen.findByRole('img')).parentElement!;
    Object.defineProperty(plot, 'clientHeight', { configurable: true, value: 40 });
    fireEvent.click(screen.getByRole('button', { name: 'bar-R3' }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    act(() => view.update({ activeCategory: 'R3' }));
    expect(plot.scrollTop).toBe(GRID_TOP + 2 * 30);
  });

  it('reveals without any timer advancing', async () => {
    const view = mount({ rowPitch: 30, revealActive: true, activeCategory: 'R1', onActiveCategoryChange: () => {} });
    const plot = (await screen.findByRole('img')).parentElement!;
    Object.defineProperty(plot, 'clientHeight', { configurable: true, value: 40 });
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'bar-R3' }));
      act(() => view.update({ activeCategory: 'R3' }));
      expect(plot.scrollTop).toBe(GRID_TOP + 2 * 30);
    } finally { vi.useRealTimers(); }
  });
});

describe('outside active row moves the selected point (#690i UX-2)', () => {
  const picked = () => (screen.getByRole('combobox', { name: '차트 지점 선택' }) as HTMLSelectElement).selectedOptions[0]!.textContent ?? '';
  const activation = { on: 'click' as const, onActivate: () => {} };

  it('moves the selection to the row, keeping the selected series, and leaves `null` alone', async () => {
    const view = mount({ pointActivation: activation, activeCategory: null });
    await screen.findByRole('img');
    const select = screen.getByRole('combobox', { name: '차트 지점 선택' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: [...select.options].find(o => o.textContent!.includes('R2') && o.textContent!.includes('B'))!.value } });
    expect(picked()).toContain('B');
    act(() => view.update({ activeCategory: 'R3' }));
    expect(picked()).toContain('R3');
    expect(picked()).toContain('B');
    const moved = picked();
    act(() => view.update({ activeCategory: null }));
    expect(picked()).toBe(moved);
  });

  it('does not move focus', async () => {
    const view = mount({ pointActivation: activation });
    await screen.findByRole('img');
    const outside = document.createElement('button'); document.body.append(outside); outside.focus();
    act(() => view.update({ activeCategory: 'R2' }));
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('does not loop on its own change: a click selects the row, the echoed activeCategory keeps it', async () => {
    const owner: { accept?: (c: string | null) => void } = {};
    const view = mount({ pointActivation: activation, activeCategory: null, onActiveCategoryChange: c => owner.accept?.(c) });
    owner.accept = c => view.update({ activeCategory: c });
    fireEvent.click(await screen.findByRole('button', { name: 'bar-R2' }));
    expect(picked()).toContain('R2');
    const settled = picked();
    act(() => view.update({ activeCategory: 'R2' }));
    expect(picked()).toBe(settled);
  });

  it('respects isPointSelectable: the row\'s first selectable point is used when the selected series is not selectable there', async () => {
    const view = mount({ pointActivation: activation, isPointSelectable: point => !(point.seriesId === 'a' && point.x === 'R3') });
    await screen.findByRole('img');
    expect(picked()).toContain('A');
    act(() => view.update({ activeCategory: 'R3' }));
    expect(picked()).toContain('R3');
    expect(picked()).toContain('B');
  });
});

describe('active row that is already set moves the selected point (#690i UX-5)', () => {
  const picked = () => (screen.getByRole('combobox', { name: '차트 지점 선택' }) as HTMLSelectElement).selectedOptions[0]!.textContent ?? '';
  const activation = { on: 'click' as const, onActivate: () => {} };

  it('selects the active row when it is set at mount', async () => {
    mount({ pointActivation: activation, activeCategory: 'R3' });
    await screen.findByRole('img');
    expect(picked()).toContain('R3');
  });

  it('selects the active row when the points arrive after the first render', async () => {
    const view = mount({ pointActivation: activation, activeCategory: 'R3', series: [] });
    view.update({ series: rows });
    await screen.findByRole('img');
    expect(picked()).toContain('R3');
  });
});

describe('category labels without rowPitch (#690i UX-4)', () => {
  const axisLabel = () => (plotOption().yAxis as unknown as { axisLabel: { interval: unknown } }).axisLabel;
  it('thins labels out automatically; a row pitch keeps every label', async () => {
    const view = mount();
    await screen.findByRole('img');
    expect(axisLabel().interval).toBe('auto');
    view.update({ rowPitch: 30 });
    expect(axisLabel().interval).toBe(0);
  });

  it('reveals the active row again when rowPitch appears while a row is active', async () => {
    const view = mount({ revealActive: true, activeCategory: 'R3', onActiveCategoryChange: () => {} });
    const plot = (await screen.findByRole('img')).parentElement!;
    Object.defineProperty(plot, 'clientHeight', { configurable: true, value: 40 });
    act(() => view.update({ rowPitch: 30 }));
    expect(plot.scrollTop).toBe(GRID_TOP + 2 * 30);
  });
});

describe('props outside horizontal mode (#690b)', () => {
  it('ignores them and warns once in development', async () => {
    window.history.replaceState(null, '', '/?v=1');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <AnalysisChartFrame chartId="v" title="V" series={[{ id: 's', name: 'S', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1]] }]} unit="s" rowPitch={30} activeCategory="x" />
    </PlatformProvider></I18nProvider>);
    await screen.findByRole('img');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('only to orientation="horizontal"'));
    expect((plotProps!.option as unknown as { dataZoom: unknown[] }).dataZoom).toHaveLength(1);
  });
});
