import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, parseDateTime, spaceId } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: true, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const none = async () => ({ data: null, assessments: [], trust: null, correlationId: 'fixture', outcome: 'empty' as const });
const adapter = testAdapter({ session: () => session, getEntity: none, listAnnotations: none, saveAnnotation: none });
const tree = (props: Partial<AnalysisChartFrameProps>) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
  <AnalysisChartFrame chartId="sel" title="Sel" series={[]} unit="s" {...props} /></PlatformProvider></I18nProvider>;
const summary = () => screen.getByRole('region', { name: '선택 요약' });
const brush = (range: [number, number]) => act(() => plot.onEvents?.brushEnd?.({ areas: [{ coordRange: range }] }, { dispatchAction: () => {} } as never));
const dataOf = (id: string) => (plot.option as unknown as { series: { id: string; data: unknown[] }[] }).series.find(s => s.id === id)!.data;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

const A: ChartSeries = { id: 'a', name: 'A', color: 'chart-blue', kind: 'bar', points: [['a', 1], ['b', 2], ['c', 3]] };
const B: ChartSeries = { id: 'b', name: 'B', color: 'chart-purple', kind: 'bar', points: [['a', 1], ['c', 3]] };

describe('category projection (#2020)', () => {
  it('draws, tabulates and summarizes a vertical category series by category name, missing = null', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    render(tree({ series: [A, B], xType: 'category' }));
    await screen.findByRole('img');
    const values = (dataOf('b') as unknown[]).map(d => (Array.isArray(d) ? d[1] : (d as { value?: unknown })?.value ?? d));
    expect(values.map(v => (Array.isArray(v) ? v[1] : v))).toEqual([1, null, 3]);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: /표로 보기/ }));
    const row = screen.getByRole('cell', { name: 'b' }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map(c => c.textContent)).toEqual(['b', '2', '—']);
    brush([1, 1]);
    expect(summary().textContent).toContain('B: n=0');
  });
  it('collapses duplicate categories on the vertical axis', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const dup: ChartSeries = { ...A, points: [['a', 1], ['b', 2], ['a', 9]] };
    render(tree({ series: [dup], xType: 'category' }));
    await screen.findByRole('img');
    expect((plot.option as unknown as { xAxis: { data: string[] } }).xAxis.data).toEqual(['a', 'b']);
  });
});

describe('category keyboard selection (#2024)', () => {
  it('selects a range with the start/end selects and enables the page actions', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    render(tree({ series: [A], xType: 'category', selectionActions: s => <button type="button">act {s.from}-{s.to}</button> }));
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    fireEvent.click(screen.getByRole('combobox', { name: '구간 시작' }));
    fireEvent.click(await screen.findByRole('option', { name: 'b' }));
    fireEvent.click(within(summary()).getByRole('button', { name: '선택' }));
    expect(summary().textContent).toContain('선택 구간: b – c');
    expect(within(summary()).getByRole('button', { name: 'act b-c' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '주석' }).hasAttribute('disabled')).toBe(false);
  });
  it('offers no start/end selects on a time axis without a query end', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const t: ChartSeries = { ...A, points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] };
    render(tree({ series: [t] }));
    await screen.findByRole('img');
    expect(screen.queryByRole('combobox', { name: '구간 시작' })).toBeNull();
  });
});

describe('selection follows the data (#2064)', () => {
  const hour = (h: number) => `2026-10-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00:00`;
  const bars = (points: [string, number][]): ChartSeries => ({ id: 's', name: 'S', color: 'chart-blue', kind: 'bar', points });
  const url = '/?v=1&scopeId=MEM&from=2026-10-01T00:00:00&to=2026-10-04T00:00:00';
  it('re-fits a time selection to the new bar boundaries and keeps the editor open', async () => {
    window.history.replaceState(null, '', url);
    const hourly = bars(Array.from({ length: 72 }, (_, h) => [hour(h), 1]));
    const view = render(tree({ series: [hourly] }));
    await screen.findByRole('img');
    const ms = (s: string) => new Date(s).getTime();
    brush([ms('2026-10-01T10:00:00'), ms('2026-10-03T10:00:00')]);
    fireEvent.click(screen.getByRole('button', { name: '주석' }));
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
    view.rerender(tree({ series: [bars([['2026-10-01T00:00:00', 1], ['2026-10-02T00:00:00', 1], ['2026-10-03T00:00:00', 1]])] }));
    // Start floors to the day bar that holds 10:00, end ceils to the next boundary; the open editor stays while the selection survives.
    expect(summary().textContent).toContain('선택 구간: 2026-10-01 00:00 – 2026-10-04 00:00');
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
  });
  it('clears a category selection whose end is no longer drawn', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const view = render(tree({ series: [A], xType: 'category' }));
    await screen.findByRole('img');
    brush([0, 2]);
    expect(summary().textContent).toContain('선택 구간: a – c');
    fireEvent.click(screen.getByRole('button', { name: '주석' }));
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
    view.rerender(tree({ series: [{ ...A, points: [['a', 1], ['b', 2]] }], xType: 'category' }));
    expect(screen.queryByText(/선택 구간: a/)).toBeNull();
    expect(screen.queryByRole('textbox', { name: '주석 내용' })).toBeNull();
  });
});

const compareRegistry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: true, compare: true }, pageKeys: [] }],
});
const compareTree = (props: Partial<AnalysisChartFrameProps>) => <I18nProvider><PlatformProvider adapter={adapter} registry={compareRegistry}>
  <AnalysisChartFrame chartId="sel" title="Sel" series={[]} unit="s" {...props} /></PlatformProvider></I18nProvider>;
const ShiftEnd = ({ to }: { to: string }) => { const { setGlobal } = usePlatform(); return <button type="button" onClick={() => setGlobal({ to })}>shift-end</button>; };

describe('review fix round (#2020 FIX1)', () => {
  const ms = (s: string) => parseDateTime(s, 'x').getTime();
  const day = (d: number) => `2026-10-0${d}T00:00:00`;
  const dailyBars = (n: number): ChartSeries => ({ id: 's', name: 'S', color: 'chart-blue', kind: 'bar', points: Array.from({ length: n }, (_, i) => [day(i + 1), 1] as [string, number]) });
  it('C1: a Context change clears selection, confirm and editor instead of refitting them back', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-10-01T00:00:00&to=2026-10-04T00:00:00');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <ShiftEnd to="2026-10-05T00:00:00" /><AnalysisChartFrame chartId="sel" title="Sel" series={[dailyBars(3)]} unit="s" />
    </PlatformProvider></I18nProvider>);
    await screen.findByRole('img');
    brush([ms('2026-10-03T06:00:00'), ms('2026-10-03T18:00:00')]);
    expect(summary().textContent).toContain('선택 구간: 2026-10-03 00:00 – 2026-10-04 00:00');
    fireEvent.click(screen.getByRole('button', { name: '분석 구간 적용…' }));
    fireEvent.click(screen.getByRole('button', { name: '주석' }));
    expect(screen.getByRole('group', { name: '구간 적용 확인' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'shift-end' }));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(screen.queryByText(/선택 구간: 2026/)).toBeNull();
    expect(screen.queryByRole('group', { name: '구간 적용 확인' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: '주석 내용' })).toBeNull();
  });
  it('C2: a reordered category axis normalizes the selection to the new order', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const view = render(tree({ series: [A], xType: 'category' }));
    await screen.findByRole('img');
    brush([1, 2]);
    expect(summary().textContent).toContain('선택 구간: b – c');
    view.rerender(tree({ series: [{ ...A, points: [['c', 3], ['b', 2], ['a', 1]] }], xType: 'category' }));
    expect(summary().textContent).toContain('선택 구간: c – b');
    expect(summary().textContent).toContain('A: n=2');
    fireEvent.click(screen.getByRole('combobox', { name: '구간 끝' }));
    expect((await screen.findAllByRole('option')).map(o => o.textContent)).toContain('b');
    expect((await screen.findAllByRole('option')).map(o => o.textContent)).toContain('c');
  });
  const compareMount = async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-10-01T10:00:00&to=2026-10-04T10:00:00');
    const hourly = bars24();
    const view = render(compareTree({ series: [hourly], compareSeries: [{ ...hourly, id: 'prev', name: 'P' }] }));
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    return view;
  };
  const bars24 = (): ChartSeries => ({ id: 's', name: 'S', color: 'chart-blue', kind: 'bar', points: Array.from({ length: 72 }, (_, h) => [`2026-10-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00:00`, 1] as [string, number]) });
  it('C3: Compare on, a granularity refit that clips shows the partial notice', async () => {
    const view = await compareMount();
    brush([ms('2026-10-01T10:00:00'), ms('2026-10-02T10:00:00')]);
    expect(screen.queryByText(/현재 기간으로 잘랐습니다/)).toBeNull();
    view.rerender(compareTree({ series: [dailyBars(3)], compareSeries: [{ ...dailyBars(3), id: 'prev', name: 'P' }] }));
    expect(summary().textContent).toContain('선택 구간: 2026-10-01 10:00 – 2026-10-03 00:00');
    expect(screen.getByText(/현재 기간으로 잘랐습니다/)).toBeTruthy();
  });
  it('C3: turning Compare on over a range wholly before the period clears it, closes its editor and says so', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-10-01T10:00:00&to=2026-10-04T10:00:00');
    const hourly = bars24();
    render(compareTree({ series: [hourly], compareSeries: [{ ...hourly, id: 'prev', name: 'P' }] }));
    await screen.findByRole('img');
    brush([ms('2026-10-01T02:00:00'), ms('2026-10-01T03:30:00')]);
    fireEvent.click(screen.getByRole('button', { name: '주석' }));
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    expect(screen.queryByRole('textbox', { name: '주석 내용' })).toBeNull();
    expect(screen.queryByText(/선택 구간: 2026/)).toBeNull();
    expect(screen.getByText(/이전 기간이라 선택하지 않았습니다/)).toBeTruthy();
  });
});

describe('category keyboard walk (#2024, FIX1 C4)', () => {
  it.each([
    ['fill vertical', { size: 'fill' as const }, true],
    ['horizontal', { orientation: 'horizontal' as const }, false],
  ])('sets both endpoints and confirms with the keyboard only: %s', async (_name, extra, focusMoves) => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const user = userEvent.setup();
    render(tree({ series: [A], xType: 'category', ...extra, selectionActions: s => <button type="button">act {s.from}-{s.to}</button> }));
    await screen.findByRole('img');
    const before = window.location.search;
    const brushButton = screen.getByRole('button', { name: '구간 선택' });
    for (let i = 0; i < 80 && document.activeElement !== brushButton; i++) await user.tab();
    expect(document.activeElement).toBe(brushButton);
    await user.keyboard('{Enter}');
    const start = screen.getByRole('combobox', { name: '구간 시작' });
    // Only a fill card moves focus to the start select (the form may sit below the fold); other sizes keep focus on Brush and the form is the next stops.
    if (focusMoves) expect(document.activeElement).toBe(start);
    else for (let i = 0; i < 20 && document.activeElement !== start; i++) await user.tab();
    expect(document.activeElement).toBe(start);
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: 'b' }));
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: '구간 끝' }));
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: 'c' }));
    const choose = within(summary()).getByRole('button', { name: '선택' });
    for (let i = 0; i < 5 && document.activeElement !== choose; i++) await user.tab();
    expect(document.activeElement).toBe(choose);
    await user.keyboard('{Enter}');
    expect(summary().textContent).toContain('선택 구간: b – c');
    expect(within(summary()).getByRole('button', { name: 'act b-c' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '주석' }).hasAttribute('disabled')).toBe(false);
    expect(window.location.search).toBe(before);
  });
  it('offers no start/end selects for StartAlign (Brush is off)', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const two: ChartSeries = { ...B, id: 'b2', name: 'B2' };
    render(tree({ series: [A, two], xType: 'category', orientation: 'horizontal', stacked: true, startAlign: true }));
    await screen.findByRole('img');
    expect(screen.queryByRole('combobox', { name: '구간 시작' })).toBeNull();
  });
});
