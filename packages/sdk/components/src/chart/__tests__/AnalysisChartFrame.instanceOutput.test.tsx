import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { CHART_PANEL_OUTPUT_KEY, createChartPanel, groupId, spaceId, type MenuMeta, type MenuViewPanels, type PanelInstance } from '@ap/contracts';
import { AnalysisSelectionInstances, createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionChips, useAnalysisSelectionInputs, useSavedViewPanels, useSavedViewSupport } from '@ap/kernel';
import { useSavedViews } from '@ap/kernel/host';
import { createFakeSavedViewStore, noContext, testAdapter, testSpace } from '@ap/kernel/testing';
import { usePageKeyRules } from '../../table/tableUrlWarning';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
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
