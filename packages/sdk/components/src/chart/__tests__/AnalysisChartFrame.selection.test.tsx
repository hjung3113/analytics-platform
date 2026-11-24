import { PlatformPage } from '../../archetypes/PlatformPage';
import { PanelWorkspace } from '../../workspace/PanelWorkspace';
import { AnalysisSelectionChipZone } from '../../filters/AnalysisSelectionChipZone';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { useId, useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, ANALYSIS_SELECTION_MAX_VALUES } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, parseDateTime, spaceId } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@ap/ui';
import type { EChartProps } from '../EChart';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', query: { mode: 'live' as const }, features: { export: false, savedView: false, annotate: true, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view', 'analytics:view']);
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
const B: ChartSeries = { id: 'b', name: 'B', color: 'chart-series-3', kind: 'bar', points: [['a', 1], ['c', 3]] };

it('outlines matching values across series and clears the emphasis without selecting them', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  const props = { series: [A, B], xType: 'category', orientation: 'horizontal' } satisfies Partial<AnalysisChartFrameProps>;
  const view = render(tree({ ...props, highlightedValues: ['a', 'missing'] }));
  await screen.findByRole('img');
  const outlines = () => (plot.option as { series: { type: string; data: number[][] }[] }).series
    .filter(s => s.type === 'custom').map(s => s.data.map(([category]) => category));
  expect(outlines()).toEqual([[0], [0]]);
  expect(dataOf('a')[0]).toBe(1);
  expect(dataOf('b')[0]).toBe(1);
  expect(dataOf('a')[1]).toBe(2);
  view.rerender(tree({ ...props, highlightedValues: [] }));
  expect(outlines()).toEqual([]);
  expect(dataOf('a')[0]).toBe(1);
});

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
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', query: { mode: 'live' as const }, features: { export: false, savedView: false, annotate: true, compare: true }, pageKeys: [] }],
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
    fireEvent.click(screen.getByRole('button', { name: '분석 구간으로 적용' }));
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

const output = { panelId: 'trend', key: 'range' };
const rangeRegistry = createRegistry({
  spaces: registry.spaces, groups: registry.groups,
  menus: registry.menus.map(menu => ({ ...menu, pageKeys: [output.key], contextResetKeys: [output.key], panels: [{
    id: output.panelId, title: { ko: '추세', en: 'Trend' }, queryInputs: {}, displayInputs: {}, grain: 'day', endpoints: [],
    outputs: [{ key: output.key, action: 'select', selection: { shape: 'range', dimension: 'date' } }],
  }] })),
});

it('creates a URL range with the chart form, edits it through the chip, and clears it from the chart', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  const user = userEvent.setup();
  const series: ChartSeries[] = [{ ...A, points: [['c', 3], ['b', 2], ['a', 1]] }];
  const rowGroups = { header: 'Group', byCategory: new Map([['b', { group: 'B', label: 'Bravo' }]]) };
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisSelectionChipZone />
    <AnalysisChartFrame chartId="sel" title="Sel" series={series} unit="s" xType="category" orientation="horizontal" rowGroups={rowGroups} analysisSelectionOutput={output} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  const search = () => new URLSearchParams(window.location.search);
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  expect(within(summary()).getByRole('combobox', { name: '구간 시작' })).toBeTruthy();
  fireEvent.click(within(summary()).getByRole('button', { name: '선택' }));
  expect(search().get('range')).toBe('c/a');
  expect(within(summary()).queryByRole('combobox', { name: '구간 시작' })).toBeNull();
  const chip = screen.getByRole('button', { name: 'date c – a' });
  chip.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog')).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(chip);
  await user.keyboard('{Enter}');
  const picker = screen.getByRole('dialog');
  fireEvent.click(within(picker).getAllByRole('combobox')[0]);
  fireEvent.click(await screen.findByRole('option', { name: 'Group: B · Bravo' }));
  fireEvent.click(within(picker).getByRole('button', { name: '적용' }));
  expect(search().get('range')).toBe('b/a');
  expect(summary().textContent).toContain('선택 구간: Group: B · Bravo –');
  fireEvent.click(within(summary()).getByRole('button', { name: '지우기' }));
  expect(search().has('range')).toBe(false);
  expect(within(summary()).getByRole('combobox', { name: '구간 시작' })).toBeTruthy();
});

it('restores a shared wall-clock range and writes a quick range using the same bounds', () => {
  const day = '2026-09-01';
  const at = (hour: string) => `${day}T${hour}:00:00`;
  const url = new URLSearchParams({ v: '1', scopeId: 'MEM', from: at('00'), to: at('02'), range: `${at('00')}/${at('01')}` });
  window.history.replaceState(null, '', `/?${url}`);
  const series: ChartSeries[] = [{ ...A, points: [[at('00'), 1], [at('01'), 2]] }];
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisSelectionChipZone />
    <AnalysisChartFrame chartId="sel" title="Sel" series={series} unit="s" analysisSelectionOutput={output} />
  </PlatformProvider></I18nProvider>);
  expect(summary().textContent).toContain(`선택 구간: ${day} 00:00 – ${day} 01:00`);
  fireEvent.click(within(summary()).getByRole('button', { name: '1시간' }));
  expect(new URLSearchParams(window.location.search).get('range')).toBe(`${at('01')}/${at('02')}`);
  const chip = screen.getByRole('button', { name: `date ${at('01')} – ${at('02')}` });
  fireEvent.click(chip);
  expect(within(screen.getByRole('dialog')).getAllByRole('textbox')).toHaveLength(2);
});

it.each(['chip edit', 'deep link'] as const)('keeps an equal time range out of the global period after a %s', async source => {
  const from = '2026-09-01T00:00:00';
  const end = '2026-09-01T01:00:00';
  const to = '2026-09-01T02:00:00';
  const expectedRange = `${from}/${from}`;
  window.history.replaceState(null, '', `/?${new URLSearchParams({ v: '1', scopeId: 'MEM', from, to, range: source === 'chip edit' ? `${from}/${end}` : expectedRange })}`);
  const series: ChartSeries[] = [{ ...A, points: [[from, 1], [end, 2]] }];
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisSelectionChipZone />
    <AnalysisChartFrame chartId="sel" title="Sel" series={series} unit="s" analysisSelectionOutput={output} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img', { name: 'Sel: A' });
  if (source === 'chip edit') {
    fireEvent.click(screen.getByRole('button', { name: `date ${from} – ${end}` }));
    const picker = within(screen.getByRole('dialog'));
    fireEvent.change(picker.getAllByRole('textbox')[1], { target: { value: from } });
    fireEvent.click(picker.getByRole('button', { name: '적용' }));
  }
  // The chip may hold the zero-length range; the time-axis chart neither draws nor offers it as a period.
  const apply = screen.queryByRole('button', { name: '분석 구간으로 적용' });
  expect.soft(apply).toBeNull();
  if (apply) {
    fireEvent.click(apply);
    const confirmation = screen.queryByRole('group', { name: '구간 적용 확인' });
    if (confirmation) fireEvent.click(within(confirmation).getByRole('button', { name: '적용' }));
  }
  const search = new URLSearchParams(window.location.search);
  expect(search.get('range')).toBe(expectedRange);
  expect([search.get('from'), search.get('to')]).toEqual([from, to]);
});

it.each([
  ['category', output, false],
  ['category', undefined, true],
  ['time', output, true],
] as const)('renders the global apply control by axis (%s) and URL output (%j)', async (xType, selectionOutput, shown) => {
  const from = '2026-09-01T00:00:00';
  const to = '2026-09-01T02:00:00';
  const series = xType === 'time' ? [{ ...A, points: [[from, 1], [to, 2]] as ChartSeries['points'] }] : [A];
  const params = new URLSearchParams({ v: '1', scopeId: 'MEM', from, to });
  if (selectionOutput) params.set('range', xType === 'time' ? `${from}/${to}` : 'a/a');
  window.history.replaceState(null, '', `/?${params}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={selectionOutput ? rangeRegistry : registry}>
    <AnalysisChartFrame chartId="sel" title="Sel" series={series} unit="s" xType={xType} analysisSelectionOutput={selectionOutput} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  if (!selectionOutput) brush([0, 0]);
  expect(within(summary()).getByText(/선택 구간:/)).toBeTruthy();
  expect(within(summary()).queryByRole('button', { name: '분석 구간으로 적용' }) !== null).toBe(shown);
  expect(within(summary()).queryByText('시간축에서만 분석 구간으로 적용할 수 있습니다.') !== null).toBe(xType === 'category' && shown);
});

it('closes the global-period confirmation when the same frame leaves the time axis', async () => {
  const from = '2026-09-01T00:00:00';
  const to = '2026-09-01T02:00:00';
  window.history.replaceState(null, '', `/?${new URLSearchParams({ v: '1', scopeId: 'MEM', from, to, range: `${from}/${to}` })}`);
  const series: ChartSeries[] = [{ ...A, points: [[from, 1], [to, 2]] }];
  const frame = (xType: 'time' | 'category') => <I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisChartFrame chartId="sel" title="Sel" series={series} unit="s" xType={xType} analysisSelectionOutput={output} />
  </PlatformProvider></I18nProvider>;
  const { rerender } = render(frame('time'));
  await screen.findByRole('img');
  fireEvent.click(within(summary()).getByRole('button', { name: '분석 구간으로 적용' }));
  expect(screen.getByRole('group', { name: '구간 적용 확인' })).toBeTruthy();
  rerender(frame('category'));
  expect(screen.queryByRole('group', { name: '구간 적용 확인' })).toBeNull();
});

const setOutput = { panelId: 'bars', key: 'equipment' };
const setRegistry = createRegistry({
  spaces: registry.spaces, groups: registry.groups,
  menus: registry.menus.map(menu => ({ ...menu, pageKeys: [setOutput.key], repeatedPageKeys: [setOutput.key], contextResetKeys: [setOutput.key], panels: [{
    id: setOutput.panelId, title: { ko: '설비', en: 'Equipment' }, queryInputs: {}, displayInputs: {}, grain: 'day', endpoints: [],
    outputs: [{ key: setOutput.key, action: 'select', selection: { shape: 'set', dimension: 'equipmentId' } }],
  }] })),
});
const nextRow = () => screen.getByRole('group', { name: '다음 분석' });
const search = () => new URLSearchParams(window.location.search);
const pointClick = (name: string, modifiers = {}) => act(() => plot.onEvents?.click?.({
  seriesId: 'a', name, event: { event: modifiers },
}, {} as never));
const setChart = (series = A) => render(<I18nProvider><PlatformProvider adapter={adapter} registry={setRegistry}>
  <AnalysisChartFrame chartId="set" title="Set" series={[series]} unit="s" xType="category" orientation="horizontal"
    analysisSelectionOutput={setOutput} nextAnalysis />
</PlatformProvider></I18nProvider>);

it.each([false, true])('keeps legacy behavior unless nextAnalysis is enabled (%s)', async nextAnalysis => {
  const from = '2026-09-01T00:00:00';
  const mid = '2026-09-01T01:00:00';
  const to = '2026-09-01T02:00:00';
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${from}&to=${to}`);
  render(tree({ series: [{ ...A, points: [[from, 1], [mid, 2], [to, 3]] }], nextAnalysis }));
  await screen.findByRole('img');
  expect(screen.queryByRole('group', { name: '다음 분석' })).toBeNull();
  brush([parseDateTime(mid, 'from').getTime(), parseDateTime(to, 'to').getTime()]);
  if (!nextAnalysis) {
    expect(screen.queryByRole('group', { name: '다음 분석' })).toBeNull();
    expect(within(summary()).getByRole('button', { name: '분석 구간으로 적용' })).toBeTruthy();
    expect(within(summary()).getByRole('button', { name: '지우기' })).toBeTruthy();
    return;
  }
  expect(search().get('from')).toBe(from);
  expect(summary().contains(nextRow())).toBe(false);
  const condition = within(nextRow()).getByRole('button', { name: '조건으로' });
  fireEvent.click(condition);
  expect(search().get('from')).toBe(from);
  await userEvent.setup().keyboard('{Escape}');
  expect(screen.queryByRole('group', { name: '구간 적용 확인' })).toBeNull();
  expect(document.activeElement).toBe(condition);
  fireEvent.click(condition);
  fireEvent.click(within(screen.getByRole('group', { name: '구간 적용 확인' })).getByRole('button', { name: '적용' }));
  expect(search().get('from')).toBe(mid);
});

it('tabs from the plot to the category range actions and restores focus on Escape', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&range=a/b');
  const user = userEvent.setup();
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisChartFrame chartId="sel" title="Sel" series={[A]} unit="s" xType="category" analysisSelectionOutput={output} nextAnalysis
      pointActions={[{ id: 'point', label: 'Point', onSelect: vi.fn() }]}
      selectionActions={() => <DropdownMenu><DropdownMenuTrigger asChild><Button>Extra actions</Button></DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem>Extra item</DropdownMenuItem></DropdownMenuContent></DropdownMenu>} />
  </PlatformProvider></I18nProvider>);
  const plotGroup = (await screen.findByRole('img')).parentElement!;
  expect(within(nextRow()).queryByRole('button', { name: '조건으로' })).toBeNull();
  const trigger = within(nextRow()).getByRole('button', { name: 'Extra actions' });
  plotGroup.focus();
  for (let i = 0; i < 8 && document.activeElement !== trigger; i += 1) await user.tab();
  expect(document.activeElement).toBe(trigger);
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('menuitem', { name: 'Extra item' })).toBeTruthy();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(within(nextRow()).getByRole('button', { name: '지우기' }));
  expect(search().has(output.key)).toBe(false);
});

it('exports point clicks, toggles by x, and applies equipment only on an explicit press', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&selectedEquipmentIds=prior');
  setChart();
  await screen.findByRole('img');
  expect(screen.queryByRole('group', { name: '다음 분석' })).toBeNull();
  pointClick('a');
  pointClick('b', { metaKey: true });
  pointClick('a', { shiftKey: true });
  expect(search().getAll(setOutput.key)).toEqual(['b']);
  expect(search().getAll('selectedEquipmentIds')).toEqual(['prior']);
  const user = userEvent.setup();
  screen.getByRole('button', { name: '선택에 지점 추가' }).focus();
  await user.keyboard('{Enter}');
  expect(search().getAll(setOutput.key)).toEqual(['b', 'a']);
  await user.keyboard('{Enter}');
  expect(search().getAll(setOutput.key)).toEqual(['b']);
  within(nextRow()).getByRole('button', { name: '조건으로' }).focus();
  await user.keyboard('{Enter}');
  expect(search().getAll('selectedEquipmentIds')).toEqual(['b']);
});

it('keeps a full set intact, announces the limit, and allows removing a value', async () => {
  const points = Array.from({ length: ANALYSIS_SELECTION_MAX_VALUES + 1 }, (_, i): [string, number] => [`E${i}`, i]);
  const params = new URLSearchParams({ v: '1', scopeId: 'MEM' });
  for (const [x] of points.slice(1)) params.append(setOutput.key, x);
  window.history.replaceState(null, '', `/?${params}`);
  setChart({ ...A, points });
  await screen.findByRole('img');
  pointClick('E0', { shiftKey: true });
  expect(search().getAll(setOutput.key)).toEqual(params.getAll(setOutput.key));
  expect(within(nextRow()).getByRole('status').textContent).toContain(String(ANALYSIS_SELECTION_MAX_VALUES));
  pointClick('E1', { metaKey: true });
  expect(search().getAll(setOutput.key)).toHaveLength(ANALYSIS_SELECTION_MAX_VALUES - 1);
  fireEvent.click(within(nextRow()).getByRole('button', { name: '지우기' }));
  expect(search().getAll(setOutput.key)).toEqual([]);
});

it('disables applying a shared set containing an invalid global equipment ID', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&selectedEquipmentIds=prior&equipment=%20&equipment=a');
  setChart();
  const apply = within(await screen.findByRole('group', { name: '다음 분석' })).getByRole('button', { name: '조건으로' });
  expect(apply).toHaveProperty('disabled', true);
  expect(document.getElementById(apply.getAttribute('aria-describedby')!)?.textContent).toContain('설비 ID');
  fireEvent.click(apply);
  expect(search().getAll('selectedEquipmentIds')).toEqual(['prior']);
  expect(search().getAll(setOutput.key)).toEqual([' ', 'a']);
});

it.each(['metaKey', 'ctrlKey'] as const)('undoes two pointer selections with %s despite row replacements', async modifier => {
  const rowRegistry = createRegistry({ spaces: setRegistry.spaces, groups: setRegistry.groups,
    menus: setRegistry.menus.map(menu => ({ ...menu, pageKeys: [...(menu.pageKeys ?? []), 'row'] })) });
  function Bars() {
    const { setPage } = usePlatform();
    return <AnalysisChartFrame chartId="set" title="Set" series={[A]} unit="s" xType="category" orientation="horizontal"
      analysisSelectionOutput={setOutput} nextAnalysis
      onActiveCategoryChange={row => setPage({ row }, { replace: true, preserveSelectionUndo: true })} />;
  }
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={rowRegistry}><Bars /></PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  pointClick('a');
  pointClick('b');
  expect(search().getAll(setOutput.key)).toEqual(['b']);
  expect(search().get('row')).toBe('b');
  fireEvent.keyDown(document.body, { key: 'z', [modifier]: true });
  await waitFor(() => expect(search().getAll(setOutput.key)).toEqual(['a']));
  expect(search().get('row')).toBe('b');
  fireEvent.keyDown(document.body, { key: 'z', [modifier]: true });
  await waitFor(() => expect(search().getAll(setOutput.key)).toEqual([]));
  expect(search().get('row')).toBe('a');
});

it('does not keep the selection undo step across a drill write whose first array member is empty', async () => {
  const drillRegistry = createRegistry({ spaces: setRegistry.spaces, groups: setRegistry.groups,
    menus: setRegistry.menus.map(menu => ({ ...menu, pageKeys: [...(menu.pageKeys ?? []), 'drillModule'], contextResetKeys: [...(menu.contextResetKeys ?? []), 'drillModule'],
      drill: { levels: [{ key: 'drillModule', label: { ko: 'Module', en: 'Module' } }] } })) });
  let page: ReturnType<typeof usePlatform>['setPage'] | undefined;
  function Bars() {
    const { setPage } = usePlatform();
    page = setPage;
    return <AnalysisChartFrame chartId="set" title="Set" series={[A]} unit="s" xType="category" orientation="horizontal"
      analysisSelectionOutput={setOutput} nextAnalysis />;
  }
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={drillRegistry}><Bars /></PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  pointClick('a');
  expect(search().getAll(setOutput.key)).toEqual(['a']);
  act(() => page!({ drillModule: ['', 'PM1'] }, { replace: true, preserveSelectionUndo: true }));
  expect(search().get('drillModule')).toBe('PM1');
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(search().get('drillModule')).toBe('PM1');
  expect(search().getAll(setOutput.key)).toEqual(['a']);
});

it('treats an explicit null output as suspended from the first mount', async () => {
  const from = '2026-09-01T00:00:00';
  const to = '2026-09-01T02:00:00';
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${from}&to=${to}`);
  const series: ChartSeries[] = [{ ...A, points: [[from, 1], [to, 2]] }];
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisChartFrame chartId="sel" title="Sel" series={series} unit="s" nextAnalysis analysisSelectionOutput={null} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  brush([parseDateTime(from, 'from').getTime(), parseDateTime(to, 'to').getTime()]);
  expect(screen.queryByText(/선택 구간:/)).toBeNull();
  expect(screen.queryByRole('button', { name: '분석 구간으로 적용' })).toBeNull();
  expect(screen.queryByRole('group', { name: '다음 분석' })).toBeNull();
  expect(search().has(output.key)).toBe(false);
});

it('hides the local range and closes confirmation while the output is suspended', async () => {
  const from = '2026-09-01T00:00:00';
  const to = '2026-09-01T02:00:00';
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${from}&to=${to}`);
  const series: ChartSeries[] = [{ ...A, points: [[from, 1], [to, 2]] }];
  const frame = (analysisSelectionOutput?: typeof output) => <I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisChartFrame chartId="sel" title="Sel" series={series} unit="s" nextAnalysis analysisSelectionOutput={analysisSelectionOutput} />
  </PlatformProvider></I18nProvider>;
  const { rerender } = render(frame(output));
  await screen.findByRole('img');
  brush([parseDateTime(from, 'from').getTime(), parseDateTime(to, 'to').getTime()]);
  const apply = () => within(nextRow()).getByRole('button', { name: '조건으로' });
  fireEvent.click(apply());
  expect(screen.getByRole('group', { name: '구간 적용 확인' })).toBeTruthy();
  rerender(frame());
  expect(screen.queryByRole('button', { name: '분석 구간으로 적용' })).toBeNull();
  expect(screen.queryByRole('group', { name: '다음 분석' })).toBeNull();
  expect(screen.queryByRole('group', { name: '구간 적용 확인' })).toBeNull();
  expect(within(summary()).queryByText(/선택 구간:/)).toBeNull();
  rerender(frame(output));
  expect(screen.queryByRole('group', { name: '구간 적용 확인' })).toBeNull();
  fireEvent.click(apply());
  expect(screen.getByRole('group', { name: '구간 적용 확인' })).toBeTruthy();
});

it('highlights a shared set on first render and replaces it on plain click', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
  setChart();
  await screen.findByRole('img');
  expect(dataOf('a')[0]).toMatchObject({ value: 1, label: { show: true }, itemStyle: { borderWidth: expect.any(Number) } });
  pointClick('b');
  expect(search().getAll(setOutput.key)).toEqual(['b']);
});

it('points More help at the Next Analysis row when enabled', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
  setChart();
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  expect(screen.getByText(/다음 분석.*조건으로/)).toBeTruthy();
});

it.each([['a', true], ['a&equipment=b', false]])('offers the declared next drill level for %s', async (values, single) => {
  const level = { key: 'step', label: { ko: '단계', en: 'Step' } };
  const declared = createRegistry({
    spaces: setRegistry.spaces, groups: setRegistry.groups,
    menus: setRegistry.menus.map(menu => ({
      ...menu, pageKeys: [...menu.pageKeys, level.key], contextResetKeys: [...menu.contextResetKeys!, level.key], drill: { levels: [level] },
      panels: [{ ...menu.panels![0]!, outputs: [{ key: setOutput.key, action: 'select',
        selection: { shape: 'set', dimension: 'equipmentId', drillLevel: level.key } }] }],
    })),
  });
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&equipment=${values}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={declared}>
    <AnalysisChartFrame chartId="set" title="Set" series={[A]} unit="s" xType="category" analysisSelectionOutput={setOutput} nextAnalysis />
  </PlatformProvider></I18nProvider>);
  const drill = within(nextRow()).getByRole('button', { name: '나누기' });
  if (!single) {
    expect(drill.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(drill.getAttribute('aria-describedby')!)?.textContent).toMatch(/하나/);
    return;
  }
  const user = userEvent.setup();
  await user.click(drill);
  await user.click(screen.getByRole('menuitem', { name: '단계 · a' }));
  expect(search().get('step')).toBe('a');
  expect(within(nextRow()).queryByRole('button', { name: '나누기' })).toBeNull();
});

it('leaves standard items absent on an output without relevant declarations', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
  setChart();
  expect(within(nextRow()).queryByRole('button', { name: /나누기|새 패널|다른 분석/ })).toBeNull();
});

it('renders object destinations, describes link conditions, and keeps permission-denied rows disabled', async () => {
  const [source] = setRegistry.menus;
  const label = (name: string) => ({ ko: name, en: name });
  const destination = (id: string) => ({ ...source!, id, primary: false, path: `/${id}/:id`, aliases: [], label: label(id),
    pageKeys: [], repeatedPageKeys: [], contextResetKeys: [], panels: [], opensObject: { equipment: { param: 'id' } } });
  const linked = createRegistry({
    spaces: setRegistry.spaces, groups: setRegistry.groups,
    menus: [{ ...source!, panels: [{ ...source!.panels![0]!, outputs: [{ key: setOutput.key, action: 'select',
      selection: { shape: 'set', dimension: 'equipmentId', objectKind: 'equipment' } }] }] },
    { ...destination('allowed'), pageKeys: ['date', 'returnTo'], context: { ...noContext, time: 'apply' },
      query: { mode: 'apply', required: { page: [{ key: 'date', label: label('Date') }] } } },
    { ...destination('denied'), permission: 'console:access' }, destination('absent'),
    { ...destination('dropped'), path: '/dropped', pageKeys: ['eqp'], opensObject: { equipment: { pageKey: 'eqp' } } }],
  });
  const has = linked.has;
  const destinations = linked.objectDestinations;
  vi.spyOn(linked, 'has').mockImplementation(id => id !== 'absent' && has(id));
  // Simulate a stale destination index so the resolver returns a dropped page key.
  vi.spyOn(linked, 'objectDestinations').mockImplementation(kind => destinations(kind).map(menu => (
    menu.id === 'dropped' ? { ...menu, opensObject: { equipment: { pageKey: 'extra' } } } : menu
  )));
  function RoutedChart() {
    const { route } = usePlatform();
    return route?.menu.id === source!.id
      ? <AnalysisChartFrame chartId="set" title="Set" series={[A]} unit="s" xType="category" analysisSelectionOutput={setOutput} nextAnalysis />
      : null;
  }
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={linked}><RoutedChart /></PlatformProvider></I18nProvider>);
  const user = userEvent.setup();
  await user.click(within(nextRow()).getByRole('button', { name: '다른 분석' }));
  expect(screen.queryByRole('menuitem', { name: 'absent' })).toBeNull();
  const allowed = screen.getByRole('menuitem', { name: 'allowed' });
  const description = (item: HTMLElement) => document.getElementById(item.getAttribute('aria-describedby')!)?.textContent;
  expect(description(allowed)).toContain('전달: a');
  expect(description(allowed)).toMatch(/allowed.*Date/);
  expect(description(screen.getByRole('menuitem', { name: 'dropped' }))).toContain('extra');
  const denied = screen.getByRole('menuitem', { name: 'denied' });
  expect(denied.getAttribute('aria-disabled')).toBe('true');
  expect(description(denied)).toContain('권한');
  await user.click(denied);
  expect(await screen.findByRole('menu')).toBeTruthy();
  await user.click(allowed);
  expect(window.location.pathname).toBe('/mars/allowed/a');
  expect(search().get('returnTo')).toContain('equipment=a');
});

it('explains unavailable single-value actions before the menu’s range actions', async () => {
  const level = { key: 'step', label: { ko: '단계', en: 'Step' } };
  const declared = createRegistry({
    spaces: rangeRegistry.spaces, groups: rangeRegistry.groups,
    menus: rangeRegistry.menus.map(menu => ({
      ...menu, pageKeys: [...menu.pageKeys, level.key], contextResetKeys: [...menu.contextResetKeys!, level.key], drill: { levels: [level] },
      panels: menu.panels!.map(panel => ({ ...panel, outputs: panel.outputs.map(item =>
        ({ ...item, selection: { ...item.selection!, drillLevel: level.key, objectKind: 'equipment' } })) })),
    })),
  });
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&range=a/b');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={declared}>
    <AnalysisChartFrame chartId="sel" title="Sel" series={[A]} unit="s" xType="category" analysisSelectionOutput={output} nextAnalysis
      selectionActions={() => <Button>Extra</Button>} />
  </PlatformProvider></I18nProvider>);
  const buttons = within(nextRow()).getAllByRole('button');
  expect(buttons.map(button => button.textContent)).toEqual(['나누기', '다른 분석', '주석 남기기', 'Extra', '지우기']);
  for (const item of buttons.slice(0, 2)) {
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(item.getAttribute('aria-describedby')!)?.textContent).toMatch(/하나/);
  }
});

const chipLabel = (name: string) => ({ ko: name, en: name });
const chipRegistry = createRegistry({
  spaces: setRegistry.spaces, groups: setRegistry.groups,
  menus: setRegistry.menus.flatMap(menu => [{
    ...menu, pageKeys: [...menu.pageKeys, 'step'], contextResetKeys: [...menu.contextResetKeys!, 'step'],
    drill: { levels: [{ key: 'step', label: chipLabel('단계') }] },
    panels: [
      { ...menu.panels![0]!, outputs: [{ ...menu.panels![0]!.outputs[0]!,
        selection: { shape: 'set' as const, dimension: 'equipmentId', drillLevel: 'step', objectKind: 'equipment' } }] },
      { id: 'receiver', title: chipLabel('수신 패널'), grain: 'day', endpoints: [],
        queryInputs: {}, displayInputs: { page: [{ key: setOutput.key, selection: 'highlight' as const }] }, outputs: [] },
    ],
  }, {
    ...menu, id: 'equipment-detail', path: '/equipment/:id', primary: false, aliases: [],
    pageKeys: ['returnTo'], repeatedPageKeys: [], contextResetKeys: [], panels: [],
    label: chipLabel('설비 상세'), opensObject: { equipment: { param: 'id' } },
  }]),
});
const chipSlots = { contextBar: <AnalysisSelectionChipZone /> };
const chipControls = () => within(screen.getByRole('group', { name: '분석 선택' }));
const chipMore = () => chipControls().getByRole('button', { name: /a 동작$/ });
const chipItems = () => within(screen.getByRole('menu')).getAllByRole('menuitem');

function chipPage(frame: 'live' | 'unmounted' | 'suspended', onAdd = vi.fn()) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={chipRegistry} slots={chipSlots}>
    <PlatformPage><ChartChipWorkspace frame={frame} onAdd={onAdd} /></PlatformPage>
  </PlatformProvider></I18nProvider>;
}

function ChartChipWorkspace({ frame, onAdd }: { frame: 'live' | 'unmounted' | 'suspended'; onAdd: ReturnType<typeof vi.fn> }) {
  const { route } = usePlatform();
  const id = useId();
  if (route?.menu.id !== 'home') return null;
  return <PanelWorkspace label={chipLabel('Workspace')} persistKey={`chip-${id.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`} initialMode="stack"
      presets={[{ id: 'chip', label: chipLabel('Preset'), layout: { type: 'group', panels: ['bars', 'neighbor'], active: 'bars' } }]}
      initialPreset="chip"
      analysisPanelAddition={{ items: [{ id: 'receiver', title: chipLabel('수신 패널') }], onAdd }}
      panels={[{ id: 'bars', title: chipLabel('Bars'), primary: true, render: () => frame === 'unmounted' ? null :
        <AnalysisChartFrame chartId="chip" title="Chip chart" series={[A]} unit="s" xType="category"
          analysisSelectionOutput={frame === 'live' ? setOutput : null} nextAnalysis /> },
        { id: 'neighbor', title: chipLabel('옆 패널'), render: () => <p>옆 패널 본문</p> }]} />;
}

describe('Next analysis chip actions', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['조건으로', '나누기', '새 패널', '다른 분석'] as const)('runs the same row action from the chip: %s', async action => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    const onAdd = vi.fn();
    render(chipPage('live', onAdd));
    const rowItems = within(await screen.findByRole('group', { name: '다음 분석' })).getAllByRole('button');
    const user = userEvent.setup();
    await user.click(chipMore());
    expect(chipItems().map(item => item.getAttribute('aria-label') ?? item.textContent))
      .toEqual(rowItems.map(item => item.textContent));
    const item = screen.getByRole('menuitem', { name: action });
    if (action === '조건으로') {
      await user.click(item);
      expect(search().getAll('selectedEquipmentIds')).toEqual(['a']);
      expect(search().has('equipment')).toBe(false);
    } else {
      item.focus();
      await user.keyboard('{ArrowRight}');
      if (action === '나누기') {
        await user.click(await screen.findByRole('menuitem', { name: '단계 · a' }));
        expect(search().get('step')).toBe('a');
      } else if (action === '새 패널') {
        await user.click(await screen.findByRole('menuitem', { name: '수신 패널' }));
        expect(onAdd).toHaveBeenCalledExactlyOnceWith({ source: 'home/receiver', inputs: { equipment: { shape: 'set', values: ['a'] } } });
        expect(chipMore()).toHaveFocus();
      } else {
        await user.click(await screen.findByRole('menuitem', { name: '설비 상세' }));
        expect(window.location.pathname).toBe('/mars/equipment-detail/a');
      }
    }
  });

  it.each(['unmounted', 'suspended'] as const)('shows only declaration actions after the live frame is %s', async frame => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    const onAdd = vi.fn();
    const view = render(chipPage('live', onAdd));
    await screen.findByRole('group', { name: '다음 분석' });
    const user = userEvent.setup();
    await user.click(chipMore());
    expect(screen.getByRole('menuitem', { name: '조건으로' })).toBeVisible();
    await user.keyboard('{Escape}');
    view.rerender(chipPage(frame, onAdd));
    await user.click(chipMore());
    expect(chipItems().map(item => item.textContent)).toEqual(['나누기', '새 패널', '다른 분석', '지우기']);
  });

  it('falls back to declarations when the source panel stays mounted in a background tab', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    render(chipPage('live'));
    await screen.findByRole('group', { name: '다음 분석' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: '옆 패널' }));
    await screen.findByText('옆 패널 본문');
    await user.click(chipMore());
    expect(chipItems().map(item => item.textContent)).toEqual(['나누기', '새 패널', '다른 분석', '지우기']);
  });

  it.each(['hidden', 'absent', 'duplicate'] as const)('hides add actions for a %s source without a unique add-enabled owner', async source => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    const onAdd = vi.fn();
    const workspaces = [
      { id: 'owner', source: source !== 'absent', add: false },
      { id: 'other', source: source === 'duplicate', add: true },
    ];
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={chipRegistry} slots={chipSlots}>
      <PlatformPage>{workspaces.map(workspace => {
        const panelId = workspace.source ? setOutput.panelId : 'unrelated';
        return <PanelWorkspace key={workspace.id} label={chipLabel(workspace.id)} persistKey={workspace.id}
          presets={[{ id: 'only', label: chipLabel('Preset'), layout: { type: 'group', panels: ['primary', panelId], active: panelId } }]}
          initialPreset="only"
          analysisPanelAddition={workspace.add ? { items: [{ id: 'receiver', title: chipLabel('수신 패널') }], onAdd } : undefined}
          panels={[
            { id: 'primary', title: chipLabel('Primary'), primary: true, render: () => null },
            { id: panelId, title: chipLabel(workspace.id === 'owner' ? 'Bars' : 'Other bars'), render: () => workspace.source
              ? <AnalysisChartFrame chartId={workspace.id} title="Chart" series={[A]} unit="s" xType="category" analysisSelectionOutput={setOutput} nextAnalysis />
              : null },
          ]} />;
      })}</PlatformPage>
    </PlatformProvider></I18nProvider>);
    const user = userEvent.setup();
    if (source === 'hidden') {
      await screen.findByRole('group', { name: '다음 분석' });
      await user.click(screen.getByRole('button', { name: 'Bars 동작' }));
      await user.click(screen.getByRole('menuitem', { name: '숨기기' }));
      await waitFor(() => expect(screen.queryByRole('group', { name: '다음 분석' })).toBeNull());
    }
    if (source === 'duplicate') await waitFor(() => expect(screen.getAllByRole('group', { name: '다음 분석' })).toHaveLength(2));
    await user.click(chipMore());
    expect(onAdd).not.toHaveBeenCalled();
    expect(chipItems().map(item => item.textContent)).toEqual(['나누기', '다른 분석', '지우기']);
  });

  it('uses the set output drill declaration when a local point drill is also configured', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    const value = vi.fn(() => 'local-value');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={chipRegistry}>
      <AnalysisChartFrame chartId="set" title="Set" series={[A]} unit="s" xType="category" analysisSelectionOutput={setOutput}
        nextAnalysis nextAnalysisPointDrill={{ level: 'step', value }} />
    </PlatformProvider></I18nProvider>);
    const user = userEvent.setup();
    await user.click(within(nextRow()).getByRole('button', { name: '나누기' }));
    await user.click(screen.getByRole('menuitem', { name: '단계 · a' }));
    expect(search().get('step')).toBe('a');
    expect(value).not.toHaveBeenCalled();
  });

  it.each(['inline', 'folded'] as const)('returns period cancellation to the origin chip actions in the %s surface', async surface => {
    const from = '2026-09-01T00:00:00';
    const mid = '2026-09-01T01:00:00';
    const to = '2026-09-01T02:00:00';
    const declared = createRegistry({
      spaces: rangeRegistry.spaces, groups: rangeRegistry.groups,
      menus: rangeRegistry.menus.map(menu => ({ ...menu,
        pageKeys: [...menu.pageKeys, setOutput.key], repeatedPageKeys: [setOutput.key],
        contextResetKeys: [...menu.contextResetKeys!, setOutput.key], panels: [...menu.panels!, ...setRegistry.menus[0]!.panels!],
      })),
    });
    window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${from}&to=${to}&range=${mid}/${to}&equipment=a`);
    const observers = new Map<Element, ResizeObserverCallback>();
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { observers.set(target, this.callback); }
      disconnect() {}
    });
    function FittedChips() {
      const [container, setContainer] = useState<HTMLDivElement | null>(null);
      const [summary, setSummary] = useState<HTMLSpanElement | null>(null);
      return <div ref={setContainer} data-testid="chip-row">
        <span ref={setSummary}>조회 요약</span>
        <AnalysisSelectionChipZone fit={{ container, summary }} />
      </div>;
    }
    const { container } = render(<I18nProvider><PlatformProvider adapter={adapter} registry={declared} slots={{ contextBar: <FittedChips /> }}>
      <PlatformPage><AnalysisChartFrame chartId="sel" title="Sel" unit="s" nextAnalysis analysisSelectionOutput={output}
        series={[{ ...A, points: [[from, 1], [mid, 2], [to, 3]] }]} /></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByRole('img', { name: /Sel/ });
    const user = userEvent.setup();
    const origin = { name: /date .* 동작$/ };
    const list = () => screen.queryByRole('dialog', { name: '분석 선택' });
    if (surface === 'folded') {
      const measure = (target: Element, width: number) => observers.get(target)!(
        [{ target, contentRect: { width, height: 26 } } as ResizeObserverEntry], {} as ResizeObserver);
      act(() => {
        measure(screen.getByTestId('chip-row'), 300);
        measure(screen.getByText('조회 요약'), 100);
        measure(container.querySelector('[data-analysis-chip-probe]')!, 400);
      });
      await user.click(chipControls().getByRole('button', { name: '+1 ›' }));
    }
    await user.click((surface === 'folded' ? within(list()!) : chipControls()).getByRole('button', origin));
    await user.click(screen.getByRole('menuitem', { name: '조건으로' }));
    expect(within(screen.getByRole('group', { name: '구간 적용 확인' })).getByRole('button', { name: '적용' })).toHaveFocus();
    expect(list()).toBeNull();
    await user.keyboard('{Escape}');
    const restored = surface === 'folded' ? within(await screen.findByRole('dialog', { name: '분석 선택' })) : chipControls();
    expect(restored.getByRole('button', origin)).toHaveFocus();
    expect(search().get('from')).toBe(from);
    // Applying clears the selection with the period, so focus goes to the chart's brush tool, not the vanishing chip.
    await user.click(restored.getByRole('button', origin));
    await user.click(screen.getByRole('menuitem', { name: '조건으로' }));
    await user.click(within(screen.getByRole('group', { name: '구간 적용 확인' })).getByRole('button', { name: '적용' }));
    expect(search().get('from')).toBe(mid);
    await waitFor(() => expect(screen.queryByRole('button', origin)).toBeNull());
    expect(list()).toBeNull();
    expect(screen.getByRole('button', { name: '구간 선택' })).toHaveFocus();
  });

  it('shares disabled reasons and leaves a blocked action open', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a&equipment=b');
    render(chipPage('live'));
    const row = within(await screen.findByRole('group', { name: '다음 분석' }));
    const user = userEvent.setup();
    await user.click(chipControls().getByRole('button', { name: /동작$/ }));
    const drill = screen.getByRole('menuitem', { name: '나누기' });
    const reason = (item: HTMLElement) => document.getElementById(item.getAttribute('aria-describedby')!)?.textContent;
    expect(drill).toHaveAttribute('aria-disabled', 'true');
    expect(reason(drill)).toBe(reason(row.getByRole('button', { name: '나누기' })));
    await user.click(drill);
    expect(screen.getByRole('menu')).toBeVisible();
    expect(search().has('step')).toBe(false);
  });

  it('shares plain range actions and returns from period confirmation to the chip', async () => {
    const from = '2026-09-01T00:00:00';
    const mid = '2026-09-01T01:00:00';
    const to = '2026-09-01T02:00:00';
    window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${from}&to=${to}`);
    const onSelect = vi.fn();
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry} slots={chipSlots}>
      <PlatformPage><AnalysisChartFrame chartId="sel" title="Sel" unit="s" nextAnalysis analysisSelectionOutput={output}
        series={[{ ...A, points: [[from, 1], [mid, 2], [to, 3]] }]}
        selectionActions={[{ id: 'extra', label: '추가 동작', onSelect }]} /></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByRole('img');
    brush([parseDateTime(mid, 'from').getTime(), parseDateTime(to, 'to').getTime()]);
    expect(within(nextRow()).getByRole('button', { name: '추가 동작' })).toBeVisible();
    const more = chipControls().getByRole('button', { name: /동작$/ });
    const user = userEvent.setup();
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: '추가 동작' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ from: mid, to }));
    expect(more).toHaveFocus();
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: '조건으로' }));
    const confirmation = within(screen.getByRole('group', { name: '구간 적용 확인' }));
    expect(confirmation.getByRole('button', { name: '적용' })).toHaveFocus();
    expect(search().get('from')).toBe(from);
    await user.keyboard('{Escape}');
    expect(more).toHaveFocus();
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: '조건으로' }));
    await user.click(within(screen.getByRole('group', { name: '구간 적용 확인' })).getByRole('button', { name: '적용' }));
    expect(search().get('from')).toBe(mid);
  });

  it.each(['{Enter}', ' ', '{ArrowDown}'])('opens chip actions with %j and restores focus on Escape', async key => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    render(chipPage('live'));
    const user = userEvent.setup();
    const more = chipMore();
    chipControls().getByRole('button', { name: /선택 지우기$/ }).focus();
    await user.tab();
    expect(more).toHaveFocus();
    await user.keyboard(key);
    expect(screen.getByRole('menuitem', { name: '나누기' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(more).toHaveFocus();
  });
});
