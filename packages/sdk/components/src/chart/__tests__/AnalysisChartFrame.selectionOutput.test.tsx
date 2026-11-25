import { PlatformPage } from '../../archetypes/PlatformPage';
import { PanelWorkspace } from '../../workspace/PanelWorkspace';
import { AnalysisPanelAddContext } from '../../workspace/PanelAdd';
import { AnalysisSelectionChipZone } from '../../filters/AnalysisSelectionChipZone';
import { stubCompactTableGeometry } from '../../testing';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, ANALYSIS_SELECTION_MAX_VALUES } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { EQUIPMENT_SELECTION_DIMENSION, defineEndpoint, groupId, parseDateTime, spaceId, type AnalysisSelection, type ApiResponse, type MenuQuery, type PlatformAdapter, type ScopeCheck } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import { Button, DetailPanelSlotProvider, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, SurfacePauseScope, useDetailPanelSlotHost } from '@ap/ui';
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

it('clears an omitted keyboard draft endpoint when the Top N ranking changes', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  const second: ChartSeries = { ...B, points: [['a', 6], ['c', 7]] };
  const frame = (visibleSeriesIds: string[]) => <I18nProvider><PlatformProvider adapter={adapter} registry={rangeRegistry}>
    <AnalysisChartFrame chartId="sel" title="Sel" series={[A, second]} visibleSeriesIds={visibleSeriesIds}
      unit="s" xType="category" orientation="horizontal" reaggregation="sum" categoryTopN={{ count: 2 }} analysisSelectionOutput={output} />
  </PlatformProvider></I18nProvider>;
  const view = render(frame(['a']));
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  const start = () => within(summary()).getByRole('combobox', { name: '구간 시작' });
  fireEvent.click(start());
  fireEvent.click(await screen.findByRole('option', { name: 'b' }));
  expect(start()).toHaveTextContent('b');

  view.rerender(frame(['b']));
  expect.soft(start()).toHaveTextContent('c');
  fireEvent.click(within(summary()).getByRole('button', { name: '선택' }));
  expect(new URLSearchParams(window.location.search).get(output.key)).toBe('c/a');
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
    outputs: [{ key: setOutput.key, action: 'select', selection: { shape: 'set', dimension: EQUIPMENT_SELECTION_DIMENSION } }],
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
        selection: { shape: 'set', dimension: EQUIPMENT_SELECTION_DIMENSION, drillLevel: level.key } }] }],
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
      selection: { shape: 'set', dimension: EQUIPMENT_SELECTION_DIMENSION, objectKind: 'equipment' } }] }] },
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
        selection: { shape: 'set' as const, dimension: EQUIPMENT_SELECTION_DIMENSION, drillLevel: 'step', objectKind: 'equipment' } }] },
      { id: 'receiver', title: chipLabel('수신 패널'), grain: 'day', endpoints: [],
        queryInputs: {}, displayInputs: { page: [{ key: setOutput.key, selection: 'highlight' as const }] }, outputs: [] },
      { id: 'receiver-two', title: chipLabel('둘째 수신 패널'), grain: 'day', endpoints: [],
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

function FittedChips() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [summary, setSummary] = useState<HTMLSpanElement | null>(null);
  return <div ref={setContainer} data-testid="chip-row">
    <span ref={setSummary}>조회 요약</span>
    <AnalysisSelectionChipZone fit={{ container, summary }} />
  </div>;
}

function stubChipMeasurements() {
  const observers = new Map<Element, ResizeObserverCallback>();
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { observers.set(target, this.callback); }
    unobserve(target: Element) { observers.delete(target); }
    disconnect() {}
  });
  return (container: HTMLElement) => {
    const measure = (target: Element, width: number) => observers.get(target)!(
      [{ target, contentRect: { width, height: 26 } } as ResizeObserverEntry], {} as ResizeObserver);
    act(() => {
      measure(screen.getByTestId('chip-row'), 300);
      measure(screen.getByText('조회 요약'), 100);
      measure(container.querySelector('[data-analysis-chip-probe]')!, 400);
    });
  };
}

const fittedChipRegistry = createRegistry({
  spaces: rangeRegistry.spaces, groups: rangeRegistry.groups,
  menus: rangeRegistry.menus.map(menu => ({ ...menu,
    pageKeys: [...menu.pageKeys, setOutput.key], repeatedPageKeys: [setOutput.key],
    contextResetKeys: [...menu.contextResetKeys!, setOutput.key], panels: [...menu.panels!, ...setRegistry.menus[0]!.panels!],
  })),
});

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

/**
 * Adds the receiver panel for real: it joins the source panel's group as the active tab, as in HW Time. `below` opens it as a new row
 * instead and keeps a second candidate, so the source panel and its row «새 패널» stay in place.
 */
function AddingWorkspace({ below = false }: { below?: boolean }) {
  const { route } = usePlatform();
  const [added, setAdded] = useState(false);
  const [reveal, setReveal] = useState<{ panelId: string; seq: number } | null>(null);
  if (route?.menu.id !== 'home') return null;
  return <PanelWorkspace label={chipLabel('Workspace')} persistKey="adding" initialMode="stack"
    presets={[{ id: 'chip', label: chipLabel('Preset'), layout: { type: 'group', panels: ['bars'], active: 'bars' } }]} initialPreset="chip"
    revealRequest={reveal}
    analysisPanelAddition={{ items: [{ id: 'receiver', title: chipLabel('수신 패널') },
      ...(below ? [{ id: 'receiver-two', title: chipLabel('둘째 수신 패널') }] : [])], onAdd: () => {
      setAdded(true);
      setReveal(current => ({ panelId: 'receiver', seq: (current?.seq ?? 0) + 1 }));
    } }}
    panels={[{ id: 'bars', title: chipLabel('Bars'), primary: true, render: () =>
      <AnalysisChartFrame chartId="adding" title="Adding chart" series={[A]} unit="s" xType="category" analysisSelectionOutput={setOutput} nextAnalysis /> },
      ...(added ? [{ id: 'receiver', title: chipLabel('수신 패널'), placement: below ? 'below' as const : undefined, render: () => <p>수신 패널 본문</p> }] : [])]} />;
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

  const addFromRow = async () => {
    const user = userEvent.setup();
    within(await screen.findByRole('group', { name: '다음 분석' })).getByRole('button', { name: '새 패널' }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: '수신 패널' }));
  };

  const addingPage = (below: boolean) => <I18nProvider><PlatformProvider adapter={adapter} registry={chipRegistry} slots={chipSlots}>
    <PlatformPage><AddingWorkspace below={below} /></PlatformPage>
  </PlatformProvider></I18nProvider>;
  const tabOf = (id: string) => screen.getAllByRole('tab').find(tab => tab.dataset.tabPanelId === id);

  it('keeps focus on the row «새 패널» trigger when the addition leaves its panel in place', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    render(addingPage(true));
    await addFromRow();
    await waitFor(() => expect(tabOf('receiver')).toBeDefined());
    await waitFor(() => expect(within(nextRow()).getByRole('button', { name: '새 패널' })).toHaveFocus());
    // Two charts on one output keep apart: the key names the chart as well.
    expect(JSON.parse(within(nextRow()).getByRole('button', { name: '새 패널' }).dataset.focusKey!)).toEqual(['next-analysis-panel', 'adding', setOutput.panelId, setOutput.key]);
  });

  it('moves focus to the added panel tab when the new tab covers the row «새 패널» trigger', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&equipment=a');
    render(addingPage(false));
    await addFromRow();
    await waitFor(() => expect(tabOf('receiver')).toHaveFocus());
    expect(tabOf('receiver')).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('[data-dock-panel="bars"]')).toHaveAttribute('inert');
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
    window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${from}&to=${to}&range=${mid}/${to}&equipment=a`);
    const foldChips = stubChipMeasurements();
    const { container } = render(<I18nProvider><PlatformProvider adapter={adapter} registry={fittedChipRegistry} slots={{ contextBar: <FittedChips /> }}>
      <PlatformPage><AnalysisChartFrame chartId="sel" title="Sel" unit="s" nextAnalysis analysisSelectionOutput={output}
        series={[{ ...A, points: [[from, 1], [mid, 2], [to, 3]] }]} /></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByRole('img', { name: /Sel/ });
    const user = userEvent.setup();
    const origin = { name: /date .* 동작$/ };
    const list = () => screen.queryByRole('dialog', { name: '분석 선택' });
    if (surface === 'folded') {
      foldChips(container);
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

type SourceRow = { id: string };
type SourcePage = { rows: SourceRow[]; total?: number; truncated?: boolean };
type ReadSourceRows = (request: MenuQuery, signal?: AbortSignal) => Promise<ApiResponse<SourcePage>>;
const sourceEndpoint = defineEndpoint<{ selected: string[] }, SourcePage>({
  id: 'fixture.sourceRows', menuId: 'home', paramKeys: { selected: true }, permission: 'platform:view',
  requiresScope: true, context: {}, kinds: [], mergeTimeDomain: false, limits: { maxRows: 2 },
});
const sourceDeclaration = {
  endpoint: sourceEndpoint,
  params: (selection: AnalysisSelection) => ({
    selected: selection.shape === 'set' ? selection.values : [selection.from, selection.to],
  }),
  columns: [{ id: 'id', header: 'Source ID', value: (row: SourceRow) => row.id }],
  getRowId: (row: SourceRow) => row.id,
};
function SourceRowsSlot() {
  const { ref } = useDetailPanelSlotHost();
  return <aside ref={ref} />;
}
function sourceRowsChart({ outcome = 'ok', data = { rows: [{ id: 'source-1' }] }, declared = true, url = 'equipment=a',
  axis = 'category', mounted = true, validateScope, readRows, maxRows, wrapChart, fittedChips = false }: {
  outcome?: ApiResponse<SourcePage>['outcome']; data?: SourcePage | null; declared?: boolean;
  url?: string; axis?: 'category' | 'time'; mounted?: boolean; validateScope?: PlatformAdapter['validateScope'];
  readRows?: ReadSourceRows;
  maxRows?: number;
  wrapChart?: (chart: ReactNode) => ReactNode;
  fittedChips?: boolean;
} = {}) {
  const menuQuery = vi.fn(readRows ?? (async () => ({ ...await none(), data, outcome })));
  const sourceAdapter = testAdapter({ session: () => session, menuQuery, ...(validateScope && { validateScope }) });
  const range = url.includes('range=');
  const dates = ['2026-09-01T00:00:00', '2026-09-01T01:00:00'];
  const series = axis === 'time' ? { ...A, points: dates.map((date, index): [string, number] => [date, index + 1]) } : A;
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&${url}`);
  const chartRegistry = fittedChips ? fittedChipRegistry : range ? rangeRegistry : chipRegistry;
  const declaration = maxRows === undefined ? sourceDeclaration : { ...sourceDeclaration, maxRows };
  const chart = mounted && <AnalysisChartFrame chartId="source" title="Source" unit="s" series={[series]} xType={axis} nextAnalysis
    analysisSelectionOutput={range ? output : setOutput} selectionActions={() => <Button>Extra</Button>}
    nextAnalysisRows={declared ? declaration : undefined} />;
  const { container } = render(<I18nProvider><PlatformProvider adapter={sourceAdapter} registry={chartRegistry}
    slots={fittedChips ? { contextBar: <FittedChips /> } : chipSlots}>
    <DetailPanelSlotProvider><PlatformPage>
      <AnalysisPanelAddContext.Provider value={{ items: [{ id: 'receiver', title: chipLabel('수신 패널') }], onAdd: vi.fn() }}>
        {wrapChart ? wrapChart(chart) : chart}
      </AnalysisPanelAddContext.Provider>
    </PlatformPage><SourceRowsSlot /></DetailPanelSlotProvider>
  </PlatformProvider></I18nProvider>);
  return Object.assign(menuQuery, { container });
}
const sourceRowButton = () => within(nextRow()).getByRole('button', { name: '원본 행' });
const sourceDrawer = () => screen.findByRole('dialog', { name: '원본 행' });

describe('Next analysis source rows', () => {
  let restoreGeometry: () => void;
  beforeEach(() => { restoreGeometry = stubCompactTableGeometry(800); });
  afterEach(() => { restoreGeometry(); });

  it.each([
    ['equipment=a', ['나누기', '새 패널', '다른 분석', '원본 행', '조건으로', '지우기']],
    ['range=a/b', ['원본 행', '주석 남기기', 'Extra', '지우기']],
  ] as const)('places the action in the next-analysis order (%s)', (url, expected) => {
    sourceRowsChart({ url });
    expect(within(nextRow()).getAllByRole('button').map(button => button.textContent)).toEqual(expected);
  });

  it.each([{ declared: false }, { url: 'other=1' }, { mounted: false }])('hides the action without both a mounted declaration and selection (%j)', async options => {
    const menuQuery = sourceRowsChart(options);
    expect(screen.queryByRole('button', { name: '원본 행' })).toBeNull();
    if (!options.url) {
      await userEvent.setup().click(chipMore());
      expect(screen.queryByRole('menuitem', { name: '원본 행' })).toBeNull();
    }
    expect(menuQuery).not.toHaveBeenCalled();
  });

  it.each([
    { url: 'equipment=a&equipment=b', subtitle: 'a, b', selected: ['a', 'b'] },
    { url: 'from=2026-09-01T00:00:00&to=2026-09-01T01:00:00&range=2026-09-01T00:00:00/2026-09-01T01:00:00',
      axis: 'time' as const, subtitle: /2026-09-01 00:00.*→.*2026-09-01 01:00/, selected: ['2026-09-01T00:00:00', '2026-09-01T01:00:00'] },
  ])('reads the selected rows through the scoped adapter ($url)', async ({ url, axis, subtitle, selected }) => {
    const menuQuery = sourceRowsChart({ url, axis });
    expect(menuQuery).not.toHaveBeenCalled();
    await userEvent.setup().click(sourceRowButton());
    const drawer = within(await sourceDrawer());
    expect(drawer.getByText(subtitle)).toBeVisible();
    expect(await drawer.findByRole('cell', { name: 'source-1' })).toBeVisible();
    expect(menuQuery).toHaveBeenCalledExactlyOnceWith({
      endpoint: sourceEndpoint.id, context: { scopeId: 'MEM' }, params: { selected },
    }, expect.any(AbortSignal));
  });

  it('waits for the server to validate the selected Scope before requesting rows', async () => {
    let finishValidation!: (scope: ScopeCheck) => void;
    const validation = new Promise<ScopeCheck>(resolve => { finishValidation = resolve; });
    const menuQuery = sourceRowsChart({ validateScope: () => validation });
    await userEvent.setup().click(sourceRowButton());
    const drawer = within(await sourceDrawer());
    expect(menuQuery).not.toHaveBeenCalled();
    await act(async () => { finishValidation({ status: 'valid', grantedRooms: [] }); });
    expect(await drawer.findByRole('cell', { name: 'source-1' })).toBeVisible();
    expect(menuQuery).toHaveBeenCalledTimes(1);
  });

  it('follows an edited selection and closes when it is cleared', async () => {
    const menuQuery = sourceRowsChart();
    await screen.findByRole('img', { name: /Source/ });
    await userEvent.setup().click(sourceRowButton());
    const drawer = await sourceDrawer();
    await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(1));
    pointClick('b');
    expect(within(drawer).getByText('b')).toBeVisible();
    await waitFor(() => expect(menuQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { selected: ['b'] } }), expect.any(AbortSignal),
    ));
    await userEvent.setup().click(within(nextRow()).getByRole('button', { name: '지우기' }));
    expect(drawer).not.toBeInTheDocument();
  });

  it('does not display rows from B under the subtitle of cached selection A', async () => {
    const respond = async (request: MenuQuery): Promise<ApiResponse<SourcePage>> => {
      const { selected } = request.params as { selected: string[] };
      return { ...await none(), outcome: 'ok', data: { rows: [{ id: `source-${selected[0]}` }] } };
    };
    // Keep revalidation pending so the final A row can only come from the cache.
    const readRows = vi.fn<ReadSourceRows>()
      .mockImplementationOnce(respond)
      .mockImplementationOnce(respond)
      .mockImplementation(() => new Promise(() => {}));
    sourceRowsChart({ readRows });
    await screen.findByRole('img', { name: /Source/ });
    fireEvent.click(sourceRowButton());
    const drawer = within(await sourceDrawer());
    expect(await drawer.findByRole('cell', { name: 'source-a' })).toBeVisible();
    pointClick('b');
    expect(await drawer.findByRole('cell', { name: 'source-b' })).toBeVisible();
    pointClick('a');
    expect(drawer.getByText('a', { exact: true })).toBeVisible();
    expect(drawer.queryByRole('cell', { name: 'source-b' })).not.toBeInTheDocument();
    expect(await drawer.findByRole('cell', { name: 'source-a' })).toBeVisible();
  });

  it('aborts pending source rows when the surface pauses and requests them again on resume', async () => {
    function PausableChart({ children }: { children: ReactNode }) {
      const [paused, setPaused] = useState(false);
      return <>
        <button type="button" onClick={() => setPaused(!paused)}>{paused ? 'Resume surface' : 'Pause surface'}</button>
        <SurfacePauseScope paused={paused}>{children}</SurfacePauseScope>
      </>;
    }
    const readRows = vi.fn<ReadSourceRows>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ data: { rows: [{ id: 'resumed-row' }] }, assessments: [], trust: null, correlationId: 'fixture', outcome: 'ok' });
    const menuQuery = sourceRowsChart({ readRows, wrapChart: chart => <PausableChart>{chart}</PausableChart> });
    fireEvent.click(sourceRowButton());
    await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(1));
    const signal = menuQuery.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Pause surface' }));
    expect(signal?.aborted).toBe(true);
    expect(menuQuery).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Resume surface' }));
    expect(await within(await sourceDrawer()).findByRole('cell', { name: 'resumed-row' })).toBeVisible();
    expect(menuQuery).toHaveBeenCalledTimes(2);
  });

  it('reports all capped rows available across the table pages', async () => {
    const cap = 120;
    sourceRowsChart({ maxRows: cap, data: { rows: Array.from({ length: cap + 1 }, (_, index) => ({ id: `source-${index + 1}` })) } });
    const user = userEvent.setup();
    await user.click(sourceRowButton());
    const drawer = within(await sourceDrawer());
    expect(await drawer.findByText(`표에서 원본 행 ${cap}개를 볼 수 있습니다. 조회 한도에 도달했습니다.`)).toBeVisible();
    expect(await drawer.findByRole('cell', { name: 'source-1' })).toBeVisible();
    expect(drawer.getByRole('table')).toHaveAttribute('aria-rowcount', String(cap + 1));
    const next = drawer.getByRole('button', { name: '다음' });
    await user.click(next);
    expect(await drawer.findByRole('cell', { name: 'source-101' })).toBeVisible();
    expect(next).toBeDisabled();
  });

  it.each([
    { rows: [{ id: 'source-1' }], total: 3 },
    { rows: [{ id: 'source-1' }], truncated: true },
    { rows: [{ id: 'source-1' }, { id: 'source-2' }, { id: 'source-3' }] },
  ])('discloses the number of rows shown for a capped result (%j)', async data => {
    sourceRowsChart({ data });
    await userEvent.setup().click(sourceRowButton());
    const drawer = within(await sourceDrawer());
    const shown = Math.min(data.rows.length, 2);
    expect(await drawer.findByText(`표에서 원본 행 ${shown}개를 볼 수 있습니다. 조회 한도에 도달했습니다.`)).toBeVisible();
    expect(await drawer.findAllByRole('cell')).toHaveLength(shown);
  });

  it.each([
    { outcome: 'forbidden' as const, data: null, message: /권한이 없/ },
    { outcome: 'too_large' as const, data: null, message: '조회 범위가 너무 큽니다' },
    { outcome: 'empty' as const, data: null, message: '조건에 맞는 결과가 없습니다' },
    { outcome: 'ok' as const, data: { rows: [] }, message: '조건에 맞는 결과가 없습니다' },
  ])('shows the result state inside the drawer ($outcome)', async ({ outcome, data, message }) => {
    sourceRowsChart({ outcome, data });
    await userEvent.setup().click(sourceRowButton());
    const drawer = within(await sourceDrawer());
    const state = await drawer.findByText(message, { selector: '[role="alert"] div, [role="status"] div' });
    expect(state).toBeVisible();
    expect(drawer.queryByRole('table')).toBeNull();
  });

  it.each(['Escape', 'close button'])('returns keyboard focus to the row opener after %s', async closeWith => {
    sourceRowsChart();
    const user = userEvent.setup();
    const opener = sourceRowButton();
    within(nextRow()).getByRole('button', { name: '다른 분석' }).focus();
    await user.tab();
    expect(opener).toHaveFocus();
    await user.keyboard('{Enter}');
    const drawer = await sourceDrawer();
    const close = within(drawer).getByRole('button', { name: '상세 닫기' });
    expect(close).toHaveFocus();
    await user.tab();
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
    if (closeWith === 'Escape') {
      await user.click(within(drawer).getByRole('button', { name: '크게 보기' }));
      expect(within(drawer).getByRole('button', { name: '원래 크기로' })).toHaveAttribute('aria-pressed', 'true');
      await user.keyboard('{Escape}');
      expect(drawer).toBeInTheDocument();
      await user.keyboard('{Escape}');
    } else await user.click(close);
    expect(drawer).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it.each(['Escape', 'close button'])('opens the same drawer from the chip and returns focus after %s', async closeWith => {
    sourceRowsChart();
    const user = userEvent.setup();
    const opener = chipMore();
    await user.click(opener);
    await user.click(screen.getByRole('menuitem', { name: '원본 행' }));
    const drawer = await sourceDrawer();
    const close = within(drawer).getByRole('button', { name: '상세 닫기' });
    expect(close).toHaveFocus();
    if (closeWith === 'Escape') await user.keyboard('{Escape}');
    else await user.click(close);
    expect(drawer).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it.each(['Escape', 'close button'])('returns focus to the originating chip in the folded list after %s', async closeWith => {
    const foldChips = stubChipMeasurements();
    const { container } = sourceRowsChart({ fittedChips: true, url: 'range=a/b&equipment=a' });
    foldChips(container);
    const user = userEvent.setup();
    await user.click(chipControls().getByRole('button', { name: '+1 ›' }));
    const list = () => screen.queryByRole('dialog', { name: '분석 선택' });
    const origin = { name: /date .* 동작$/ };
    await user.click(within(list()!).getByRole('button', origin));
    await user.click(screen.getByRole('menuitem', { name: '원본 행' }));
    const drawer = await sourceDrawer();
    const close = within(drawer).getByRole('button', { name: '상세 닫기' });
    expect(close).toHaveFocus();
    expect(list()).toBeNull();
    if (closeWith === 'Escape') await user.keyboard('{Escape}');
    else await user.click(close);
    expect(drawer).not.toBeInTheDocument();
    const restored = within(await screen.findByRole('dialog', { name: '분석 선택' }));
    await waitFor(() => expect(restored.getByRole('button', origin)).toHaveFocus());
  });
});
