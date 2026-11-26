import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { CHART_PANEL_OUTPUT_KEY, createChartPanel, EQUIPMENT_SELECTION_DIMENSION, groupId, parseDateTime, spaceId, type MenuMeta, type MenuViewPanels, type PanelInstance } from '@ap/contracts';
import { AnalysisSelectionInstances, createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionChips, useAnalysisSelectionInputs, useSavedViewPanels, useSavedViewSupport } from '@ap/kernel';
import { useSavedViews } from '@ap/kernel/host';
import { createFakeSavedViewStore, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisSelectionChipZone } from '../../filters/AnalysisSelectionChipZone';
import { usePageKeyRules } from '../../table/tableUrlWarning';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { NextAnalysisBridge } from '../NextAnalysisBridge';
import type { EChartProps } from '../EChart';

const plots = new Map<string, EChartProps>();
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plots.set(props.ariaLabel!, props); return <div />; } }));
afterEach(() => { cleanup(); plots.clear(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

const label = { ko: '분석', en: 'Analysis' };
const fields = {
  measures: [{ id: 'count', label, unit: '건', reaggregation: 'sum' as const }],
  breakdowns: ['equipment', 'recipe'].map(id => ({ id, label, dimension: id })),
};
function bar(id: string, breakdown: string) {
  const result = createChartPanel(fields, { kind: 'bar', measure: 'count', breakdown }, id, () => true);
  if (result.status !== 'ok') throw new Error(result.problem.code);
  return result.instance;
}

const first = bar('chart-1', 'equipment');
const second = bar('chart-2', 'recipe');
const firstKey = 'chart-1.selection';
const secondKey = 'chart-2.selection';
const reader: PanelInstance = {
  id: 'reader-1', source: { kind: 'declared', panel: 'reader' }, outputs: [],
  inputs: [{ key: 'equipmentInput', from: firstKey, mode: 'follow' }],
};
const support = { menuId: 'home', menuSchemaVersion: 1, contextKeys: [], pageKeys: [] };
function registry(overrides: Partial<MenuMeta> = {}) {
  return createRegistry({
    spaces: [testSpace()], groups: [{ id: groupId('g'), space: spaceId('mars'), label, icon: House }],
    menus: [{ id: 'home', group: groupId('g'), primary: true, path: '/', icon: House, label, description: label,
      permission: 'platform:view', requiresScope: false, chartFields: fields,
      context: { ...noContext, time: 'apply' }, query: { mode: 'apply' }, pageType: 'analysis', savedViews: 'screen',
      features: { export: false, savedView: true, annotate: false, compare: false },
      pageKeys: ['equipmentInput'], repeatedPageKeys: ['equipmentInput'], contextResetKeys: ['equipmentInput'],
      analysisSelectionInbound: [{ key: 'equipmentInput', dimension: 'equipment', shape: 'set' }],
      panels: [{ id: 'reader', title: label, grain: 'day', endpoints: [], outputs: [],
        queryInputs: { page: [{ key: 'equipmentInput', selection: 'filter' }] }, displayInputs: {} }],
      ...overrides }],
  });
}

const store = () => createFakeSavedViewStore([]);
const adapter = testAdapter();
function platform(children: ReactNode, menus = registry(), savedViews = store()) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={menus} savedViews={savedViews}>{children}</PlatformProvider></I18nProvider>;
}
const series = [{ id: 'a', name: 'A', color: 'chart-blue' as const, kind: 'bar' as const, points: [['a', 1], ['b', 2]] as [string, number][] }];
function Chart({ id }: { id: string }) {
  return <AnalysisChartFrame chartId={id} title={id} series={series} unit="" xType="category" orientation="horizontal"
    analysisSelectionOutput={{ panelId: id, instanceId: id, key: CHART_PANEL_OUTPUT_KEY }} />;
}
const search = () => new URLSearchParams(window.location.search);
function pick(id: string, name: string, add = false) {
  act(() => plots.get(`${id}: A`)!.onEvents!.click!({ seriesId: 'a', name, event: { event: { metaKey: add } } }, {} as never));
}
let chips: ReturnType<typeof useAnalysisSelectionChips>['chips'];
function Chips() { chips = useAnalysisSelectionChips().chips; return null; }

it('publishes a repeated set for each generated bar under its own key and dimension', async () => {
  let badKeys: string[] = [];
  function Rules() {
    badKeys = usePageKeyRules([firstKey, secondKey].map(key => ({ key, label, repeated: true, valid: value => value === 'b' }))).badKeys;
    return null;
  }
  render(platform(<><Chips /><Rules /><AnalysisSelectionInstances instances={[first, second]}>
    <Chart id={first.id} /><Chart id={second.id} />
  </AnalysisSelectionInstances></>));
  await waitFor(() => expect(plots.size).toBe(2));
  pick(first.id, 'a');
  pick(first.id, 'b', true);
  pick(second.id, 'b');
  expect(search().getAll(firstKey)).toEqual(['a', 'b']);
  expect(search().getAll(secondKey)).toEqual(['b']);
  expect(chips.map(({ key, dimension }) => [key, dimension])).toEqual([[firstKey, 'equipment'], [secondKey, 'recipe']]);
  expect(badKeys).toEqual([firstKey]);
});

it('follows the registered chart output named by the reader instance', () => {
  let applied: ReturnType<typeof useAnalysisSelectionInputs>['applied'];
  function Reader() { applied = useAnalysisSelectionInputs('reader', reader.inputs).applied; return null; }
  window.history.replaceState(null, '', `/?v=1&${firstKey}=a&equipmentInput=b`);
  render(platform(<AnalysisSelectionInstances instances={[first, reader]}><Reader /></AnalysisSelectionInstances>));
  expect(applied!).toEqual([expect.objectContaining({ use: 'filter', selection: { shape: 'set', values: ['a'] },
    source: expect.objectContaining({ panelId: first.id, dimension: 'equipment' }) })]);
});

it('re-registers both chart channels when reopening a saved view and can publish again', async () => {
  const savedViews = store();
  const menus = registry();
  const panels: MenuViewPanels = { version: 1, instances: [first, second] };
  let views: ReturnType<typeof useSavedViews>;
  function Workspace({ initial }: { initial: MenuViewPanels | null }) {
    const [value, update] = useState(initial);
    useSavedViewSupport(support);
    useSavedViewPanels({ value, onOpen: opened => { if (opened !== 'unreadable') update(opened); } });
    views = useSavedViews();
    return <AnalysisSelectionInstances instances={value?.instances}>
      <Chips />{value?.instances.map(({ id }) => <Chart key={id} id={id} />)}
    </AnalysisSelectionInstances>;
  }
  const view = render(platform(<Workspace key="save" initial={panels} />, menus, savedViews));
  await waitFor(() => expect(views!.status).toBe('ready'));
  const saved = await act(async () => views.saveAs({ name: 'Both bars', kind: 'menu-view' }));
  if (!saved.ok) throw new Error('Saved view creation failed');
  expect(saved.value.view).toMatchObject({ panels });
  view.rerender(platform(<Workspace key="open" initial={null} />, menus, savedViews));
  await act(async () => { await views.select(saved.value.view.id); });
  pick(first.id, 'a');
  pick(second.id, 'b');
  expect(chips.map(({ key, dimension, selection }) => [key, dimension, selection])).toEqual([
    [firstKey, 'equipment', { shape: 'set', values: ['a'] }],
    [secondKey, 'recipe', { shape: 'set', values: ['b'] }],
  ]);
});

it.each(['declared output', 'inbound', 'drill', 'invalid id'] as const)('refuses a chart output with %s', kind => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const instance = kind === 'invalid id' ? bar('bad/id', 'equipment') : first;
  const key = `${instance.id}.selection`;
  const selection = { dimension: 'room', shape: 'set' as const };
  const overrides: Partial<MenuMeta> = { pageKeys: [key], repeatedPageKeys: [key], contextResetKeys: [key], panels: [], analysisSelectionInbound: [] };
  if (kind === 'declared output') overrides.panels = [{ id: 'owner', title: label, grain: 'day', endpoints: [],
    queryInputs: {}, displayInputs: {}, outputs: [{ key, action: 'select', selection }] }];
  if (kind === 'inbound') overrides.analysisSelectionInbound = [{ key, ...selection }];
  if (kind === 'drill') { overrides.drill = { levels: [{ key, label }] }; overrides.repeatedPageKeys = []; }
  window.history.replaceState(null, '', `/?v=1&${key}=a`);
  render(platform(<AnalysisSelectionInstances instances={[instance]}><Chips /><Chart id={instance.id} /></AnalysisSelectionInstances>,
    kind === 'invalid id' ? registry() : registry(overrides)));
  pick(instance.id, 'b');
  expect(search().getAll(key)).toEqual(['a']);
  expect(chips.map(chip => chip.dimension)).toEqual(kind === 'declared output' || kind === 'inbound' ? ['room'] : []);
  if (kind === 'declared output') expect(chips[0].source?.panelId).toBe('owner');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(key));
});

it('withdraws the removed channel and its value while keeping the other selection', () => {
  const menus = registry();
  const savedViews = store();
  const tree = (instances: PanelInstance[]) => platform(<><Chips /><AnalysisSelectionInstances instances={instances}>{null}</AnalysisSelectionInstances></>, menus, savedViews);
  window.history.replaceState(null, '', `/?v=1&${firstKey}=a&${secondKey}=b&extra=keep`);
  const view = render(tree([first, second]));
  expect(chips.map(chip => chip.key)).toEqual([firstKey, secondKey]);
  view.rerender(tree([second]));
  expect(chips.map(chip => chip.key)).toEqual([secondKey]);
  expect([...search().entries()]).toEqual(expect.arrayContaining([[secondKey, 'b'], ['extra', 'keep']]));
  expect(search().has(firstKey)).toBe(false);
});

it('keeps local range selection working when a chart instance output is rejected', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const from = '2026-09-01T00:00:00';
  const mid = '2026-09-01T01:00:00';
  const to = '2026-09-01T02:00:00';
  const bad = bar('bad/id', 'equipment');
  const timeSeries = [{ id: 'a', name: 'A', color: 'chart-blue' as const, kind: 'bar' as const, points: [[from, 1], [mid, 2], [to, 3]] as [string, number][] }];
  const allowedSession = testSession(['platform:view', 'analytics:view']);
  const allowedAdapter = testAdapter({ session: () => allowedSession });
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${from}&to=${to}`);
  render(<I18nProvider><PlatformProvider adapter={allowedAdapter} registry={registry()} savedViews={store()}>
    <AnalysisSelectionInstances instances={[bad]}>
      <AnalysisChartFrame chartId={bad.id} title={bad.id} series={timeSeries} unit="s" nextAnalysis
        analysisSelectionOutput={{ panelId: bad.id, instanceId: bad.id, key: CHART_PANEL_OUTPUT_KEY }} />
    </AnalysisSelectionInstances>
  </PlatformProvider></I18nProvider>);
  await waitFor(() => expect(plots.size).toBe(1));
  act(() => plots.get(`${bad.id}: A`)!.onEvents!.brushEnd!({
    areas: [{ coordRange: [parseDateTime(mid, 'from').getTime(), parseDateTime(to, 'to').getTime()] }],
  }, { dispatchAction: () => {} } as never));
  expect(within(screen.getByRole('region', { name: '선택 요약' })).getByText(/선택 구간:/)).toBeTruthy();
  const nextGroup = screen.getByRole('group', { name: '다음 분석' });
  fireEvent.click(within(nextGroup).getByRole('button', { name: '조건으로' }));
  fireEvent.click(within(screen.getByRole('group', { name: '구간 적용 확인' })).getByRole('button', { name: '적용' }));
  expect(search().get('from')).toBe(mid);
  expect(search().has(`${bad.id}.selection`)).toBe(false);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${bad.id}.selection`));
});

it('publishes accepted chart instance next-analysis actions under the namespaced key for the chip menu', async () => {
  const allowedSession = testSession(['platform:view', 'analytics:view']);
  const allowedAdapter = testAdapter({ session: () => allowedSession });
  const equipFields = {
    measures: fields.measures,
    breakdowns: [{ id: EQUIPMENT_SELECTION_DIMENSION, label, dimension: EQUIPMENT_SELECTION_DIMENSION }],
  };
  const equipResult = createChartPanel(equipFields, { kind: 'bar', measure: 'count', breakdown: EQUIPMENT_SELECTION_DIMENSION }, 'chart-1', () => true);
  if (equipResult.status !== 'ok') throw new Error(equipResult.problem.code);
  const equipBar = equipResult.instance;
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  render(<I18nProvider><PlatformProvider adapter={allowedAdapter} registry={registry({ chartFields: equipFields })} savedViews={store()}>
    <NextAnalysisBridge>
      <AnalysisSelectionChipZone />
      <AnalysisSelectionInstances instances={[equipBar]}>
        <AnalysisChartFrame chartId={equipBar.id} title={equipBar.id} series={series} unit="" xType="category" orientation="horizontal" nextAnalysis
          analysisSelectionOutput={{ panelId: equipBar.id, instanceId: equipBar.id, key: CHART_PANEL_OUTPUT_KEY }} />
      </AnalysisSelectionInstances>
    </NextAnalysisBridge>
  </PlatformProvider></I18nProvider>);
  await waitFor(() => expect(plots.size).toBe(1));
  pick(equipBar.id, 'a');
  const user = userEvent.setup();
  const actionTrigger = document.querySelector(`[data-analysis-chip-action="${firstKey}"]`) as HTMLElement;
  expect(actionTrigger).toBeTruthy();
  await user.click(actionTrigger);
  const applyItem = await screen.findByRole('menuitem', { name: '조건으로' });
  await user.click(applyItem);
  expect(search().getAll('selectedEquipmentIds')).toEqual(['a']);
});
