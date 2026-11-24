import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { emptyGlobal, groupId, NO_FEATURES, spaceId, type AnalysisSelection, type PanelDeclaration } from '@ap/contracts';
import { House } from 'lucide-react';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { analysisSelectionParam, parseAnalysisSelection, useAnalysisSelectionChips, useAnalysisSelectionInputs, useAnalysisSelectionOutput, usePlatform } from '../../index';
import { I18nProvider } from '../../i18n';
import { LentPanelPlatformContext } from '../../platform/contexts';
import { useAnalysisSelectionHoverTarget } from '../analysisSelection';
import { useLeaveRequest, useUnsavedGuard } from '../../platform/hooks';
import { lentPanelPlatform } from '../../platform/lent-panel-platform';
import { PaneQueryDraftProvider, PaneScreenProvider, PlatformProvider, useHostPlatform, type PaneScreen } from '../../platform/platform';
import { queryMissingRequired } from '../../query/draft-state';
import { disabledReason, projectDisplayInputs, projectQueryInputs } from '../../registry/panel-inputs';
import { createRegistry, type MenuEntry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

const title = { ko: '추세', en: 'Trend' };
const setKey = 'equipmentSet';
const rangeKey = 'timeRange';
const panel = { id: 'source', title, queryInputs: {}, displayInputs: {}, grain: 'daily', endpoints: [], outputs: [] };
const panels: PanelDeclaration[] = [
  { ...panel, outputs: [
    { key: setKey, action: 'pick', selection: { shape: 'set', dimension: 'equipment' } },
    { key: rangeKey, action: 'brush', selection: { shape: 'range', dimension: 'time' } },
  ] },
  { ...panel, id: 'receiver', queryInputs: { page: [{ key: setKey, selection: 'filter' }] }, displayInputs: { page: [{ key: rangeKey, selection: 'highlight' }] } },
  { ...panel, id: 'plain' },
  { ...panel, id: 'alternate', outputs: [{ key: setKey, action: 'pick', selection: { shape: 'set', dimension: 'equipment' } }] },
];
const home: MenuEntry = {
  id: 'home', path: '/', primary: true, group: groupId('overview'), label: title, description: title, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: NO_FEATURES, pageKeys: [],
};
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: home.group, label: title, icon: House, space: spaceId('mars') }],
  menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false, panels,
    pageKeys: [setKey, rangeKey, 'sort'], repeatedPageKeys: [setKey], contextResetKeys: [setKey, rangeKey] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const set: AnalysisSelection = { shape: 'set', values: ['B', 'A'] };
const range: AnalysisSelection = { shape: 'range', from: '14:00', to: '16:00' };
const search = () => new URLSearchParams(window.location.search);

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;
}
function Lent({ children }: { children: ReactNode }) {
  return <LentPanelPlatformContext.Provider value={lentPanelPlatform(useHostPlatform(), { context: emptyGlobal, page: { [setKey]: ['bound'] } })}>{children}</LentPanelPlatformContext.Provider>;
}
function mount<T>(hook: () => T, query = '', wrapper = Wrapper) {
  window.history.replaceState(null, '', `/mars/analysis?v=1${query}`);
  return renderHook(hook, { wrapper }).result;
}
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([
  [setKey, set, ['B', 'A']],
  [rangeKey, range, ['14:00/16:00']],
] as const)('encodes %s, reads it back, and restores it from a shared URL', (key, selection, values) => {
  const result = mount(() => useAnalysisSelectionOutput('source', key));
  act(() => expect(result.current.select(selection)).toBe(true));
  expect(search().getAll(key)).toEqual(values);
  expect(result.current.selection).toEqual(selection);
  const shared = window.location.search.replace('?v=1', '');
  cleanup();
  expect(mount(() => useAnalysisSelectionOutput('source', key), shared).current.selection).toEqual(selection);
});

it('pushes once per change, skips equal selections, and restores the prior selection on Back', async () => {
  const result = mount(() => useAnalysisSelectionOutput('source', setKey), '&equipmentSet=B&equipmentSet=A');
  const start = window.history.length;
  act(() => expect(result.current.select({ shape: 'set', values: ['B', '', 'A', 'B'] })).toBe(true));
  expect(window.history.length).toBe(start);
  act(() => expect(result.current.select({ shape: 'set', values: ['A', 'B'] })).toBe(true));
  expect(window.history.length).toBe(start + 1);
  act(() => expect(result.current.select(null)).toBe(true));
  expect(search().has(setKey)).toBe(false);
  expect(window.history.length).toBe(start + 2);
  window.history.back();
  await waitFor(() => expect(result.current.selection).toEqual({ shape: 'set', values: ['A', 'B'] }));
});

const a = { shape: 'set', values: ['A'] } as const;
const b = { shape: 'set', values: ['B'] } as const;
const initialA = '&equipmentSet=A';
const useWriter = () => ({ output: useAnalysisSelectionOutput('source', setKey), platform: usePlatform() });
it.each([['main', 'source'], ['board', 'source'], ['main', 'alternate'], ['board', 'alternate']] as const)('restores A in one event on %s with %s as the final writer', async (surface, writer) => {
  const propose = vi.fn<(screen: PaneScreen) => void>();
  function Board({ children }: { children: ReactNode }) {
    const [screen, setScreen] = useState<PaneScreen>({ menuId: 'analysis', params: {}, query: '?v=1' + initialA });
    return <Wrapper><PaneScreenProvider paneId="one" screen={screen} onChange={next => { propose(next); setScreen(next); }} onLeave={() => {}}>{children}</PaneScreenProvider></Wrapper>;
  }
  window.history.pushState(null, '', window.location.href); // Start at the history tip so both pushes add entries.
  const result = mount(() => ({ source: useAnalysisSelectionOutput('source', setKey),
    alternate: useAnalysisSelectionOutput('alternate', setKey), reader: useAnalysisSelectionInputs('receiver'),
  }), initialA, surface === 'board' ? Board : Wrapper);
  const start = window.history.length;
  act(() => { result.current.source.select(b); expect(result.current[writer].select(a)).toBe(true); });
  expect(result.current.reader.applied).toMatchObject([{ selection: a, source: { panelId: 'source', dimension: 'equipment' } }]);
  if (surface === 'board') return expect(propose.mock.calls.map(([screen]) => new URLSearchParams(screen.query).getAll(setKey))).toEqual([['B'], ['A']]);
  expect(window.history.length).toBe(start + 2);
  window.history.back();
  await waitFor(() => expect(result.current.reader.applied).toMatchObject([{ selection: b, source: { panelId: 'source', dimension: 'equipment' } }]));
});

it.each([['reselect', b, ['B']], ['clear', null, []]] as const)('resends an unaccepted board %s', (_, next, values) => {
  const propose = vi.fn<(screen: PaneScreen) => void>();
  const Held = ({ children }: { children: ReactNode }) => <Wrapper><PaneScreenProvider paneId="one" screen={{ menuId: 'analysis', params: {}, query: '?v=1' + initialA }} onChange={propose} onLeave={() => {}}>{children}</PaneScreenProvider></Wrapper>;
  const result = mount(() => useAnalysisSelectionOutput('source', setKey), initialA, Held);
  act(() => expect(result.current.select(next)).toBe(true));
  act(() => expect(result.current.select(next)).toBe(true));
  expect(result.current.selection).toEqual(a);
  expect(propose.mock.calls.map(([screen]) => new URLSearchParams(screen.query).getAll(setKey))).toEqual([values, values]);
});

it('composes a period reset, a new selection and a clear in one event', () => {
  const { current: { output, platform } } = mount(useWriter, '&equipmentSet=B&from=2026-09-19T00:00:00&to=2026-09-20T00:00:00');
  const period = { from: '2026-09-20T00:00:00', to: '2026-09-21T00:00:00' };
  act(() => {
    platform.setGlobal(period);
    expect(search().has(setKey)).toBe(false);
    expect(output.select(b)).toBe(true);
    expect.soft(Object.fromEntries(search())).toMatchObject({ ...period, [setKey]: 'B' });
    expect(output.select(null)).toBe(true);
  });
  expect(Object.fromEntries(search())).toEqual({ v: '1', ...period });
});

it('rejects a stale selection after navigating away in the same event', () => {
  const { current: { output, platform } } = mount(useWriter, initialA);
  act(() => { expect(platform.navigate('/mars')).toBe(true); expect.soft(output.select(b)).toBe(false); });
  expect(window.location.pathname).toBe('/mars');
});

it('asks again after cancelling a guarded selection', () => {
  const guard: { request?: ReturnType<typeof useLeaveRequest> } = {};
  function Guarded() {
    useUnsavedGuard(true, { leaves: 'address' });
    const request = useLeaveRequest();
    useLayoutEffect(() => { guard.request = request; }, [request]);
    return null;
  }
  const result = mount(() => useAnalysisSelectionOutput('source', setKey), initialA, ({ children }) => <Wrapper><Guarded />{children}</Wrapper>);
  act(() => { result.current.select(b); });
  act(() => guard.request!.cancel());
  expect(search().getAll(setKey)).toEqual(['A']);
  act(() => { result.current.select(b); });
  expect(guard.request).toBeTruthy();
  act(() => guard.request!.confirm());
  expect(search().getAll(setKey)).toEqual(['B']);
});

const invalidEntries = [
  [rangeKey, ['a/b/c']],
  [setKey, Array.from({ length: 51 }, (_, i) => String(i))],
] as const;
it.each(invalidEntries)('keeps a panel unavailable when its availability override requires invalid %s', (key, values) => {
  const { current: platform } = mount(usePlatform, '&' + new URLSearchParams(values.map(value => [key, value])));
  const receiver = { ...panels[1], availability: { requires: [{ anyOf: [key] }], disabledReason: title } };
  expect(disabledReason(receiver, { [rangeKey]: platform.pageParam(rangeKey), [setKey]: platform.pageParams(setKey) })).toEqual(title);
});

it.each(invalidEntries)('omits invalid URL values for %s from projections and required inputs', (key, values) => {
  const query = new URLSearchParams(values.map(value => [key, value]));
  const { current: platform } = mount(usePlatform, `&${query}`);
  const inputs = { [rangeKey]: platform.pageParam(rangeKey), [setKey]: platform.pageParams(setKey) };
  const receiver = panels[1];
  expect.soft(projectQueryInputs(receiver, inputs)).not.toHaveProperty(setKey);
  expect.soft(projectDisplayInputs(receiver, inputs)).not.toHaveProperty(rangeKey);
  const menu = { ...platform.route!.menu, query: { mode: 'apply', required: { page: [{ key, label: title }] } } } as const;
  expect(queryMissingRequired(menu, platform.global, platform.page)).toEqual([{ key, label: title }]);
});

it.each(invalidEntries)('reports rejected %s and clears the raw key', (key, values) => {
  const query = new URLSearchParams(values.map(value => [key, value]));
  const result = mount(() => ({
    input: useAnalysisSelectionInputs('receiver'), output: useAnalysisSelectionOutput('source', key),
  }), `&${query}`);
  expect(result.current.output.selection).toBeNull();
  expect.soft(result.current.input).toMatchObject({ applied: [], rejected: [key] });
  act(() => expect(result.current.output.select(null)).toBe(true));
  expect(search().has(key)).toBe(false);
  expect(result.current.input.rejected).toEqual([]);
});

it.each([
  [setKey, { shape: 'set', values: Array.from({ length: 51 }, (_, i) => String(i)) }],
  [setKey, range],
  [rangeKey, { ...range, from: '' }],
  [rangeKey, { ...range, to: '16/00' }],
] as const)('rejects invalid writes to %s', (key, selection) => {
  const result = mount(() => useAnalysisSelectionOutput('source', key), '&equipmentSet=A&timeRange=x%2Fy');
  const previous = window.location.href;
  act(() => expect(result.current.select(selection)).toBe(false));
  expect(window.location.href).toBe(previous);
});

it.each([[''], ['a/'], ['/b'], ['a/b/c'], ['a/b', 'c/d']])('treats an invalid range as absent (%j)', (...values) => {
  expect(parseAnalysisSelection('range', values)).toBeNull();
});

it('normalizes a set for the URL and treats an empty set as clear', () => {
  expect(analysisSelectionParam({ shape: 'set', values: ['B', '', 'A', 'B'] })).toEqual(['B', 'A']);
  expect(parseAnalysisSelection('set', ['', 'B', 'A', 'B'])).toEqual(set);
  expect(parseAnalysisSelection('set', [''])).toBeNull();
  const result = mount(() => useAnalysisSelectionOutput('source', setKey), '&equipmentSet=A');
  act(() => expect(result.current.select({ shape: 'set', values: [''] })).toBe(true));
  expect(search().has(setKey)).toBe(false);
});

it('reads filter and highlight inputs and keeps the result across unrelated writes', () => {
  const result = mount(() => ({
    receiver: useAnalysisSelectionInputs('receiver'), plain: useAnalysisSelectionInputs('plain'),
    range: useAnalysisSelectionOutput('source', rangeKey), platform: usePlatform(),
  }), '&equipmentSet=B&equipmentSet=A&timeRange=14%3A00%2F16%3A00');
  const { receiver } = result.current;
  expect(receiver).toEqual({ filtered: true, rejected: [], unavailable: [], applied: [
    { key: setKey, use: 'filter', selection: set, source: { panelId: 'source', title, dimension: 'equipment' } },
    { key: rangeKey, use: 'highlight', selection: range, source: { panelId: 'source', title, dimension: 'time' } },
  ] });
  expect(result.current.plain).toEqual({ applied: [], filtered: false, rejected: [], unavailable: [] });
  act(() => result.current.platform.setPage({ sort: 'name', [setKey]: ['B', 'A', 'B'] }));
  expect(result.current.receiver).toBe(receiver);
  act(() => result.current.platform.setPage({ [setKey]: null }));
  expect(result.current.receiver).toEqual({ filtered: false, applied: [receiver.applied[1]], rejected: [], unavailable: [] });
  act(() => result.current.platform.setPage({ [rangeKey]: 'malformed' }));
  expect(result.current.range.selection).toBeNull();
  expect(result.current.receiver.applied).toEqual([]);
});

it.each([
  () => useAnalysisSelectionOutput('plain', setKey),
  () => useAnalysisSelectionInputs('missing'),
])('throws on undeclared usage on a menu route', hook => {
  expect(() => mount<unknown>(hook)).toThrow(RangeError);
});

it('ignores bound values and disables selection writes in a lent panel', () => {
  const result = mount(() => ({
    output: useAnalysisSelectionOutput('source', setKey), inputs: useAnalysisSelectionInputs('receiver'),
  }), '&equipmentSet=B', ({ children }) => <Wrapper><Lent>{children}</Lent></Wrapper>);
  expect(result.current.output.selection).toBeNull();
  expect(result.current.output.select(set)).toBe(false);
  expect(result.current.inputs).toEqual({ applied: [], filtered: false, rejected: [], unavailable: [] });
  expect(search().getAll(setKey)).toEqual(['B']);
});

const middleKey = 'moduleSet';
const lastKey = 'operationSet';
const equipmentLabel = { ko: '설비', en: 'Equipment' };
const chipPanels: PanelDeclaration[] = [
  { ...panel, id: 'last', queryInputs: { page: [{ key: middleKey, selection: 'filter' }] },
    outputs: [{ key: lastKey, action: 'pick', selection: { shape: 'set', dimension: 'operation' } }] },
  { ...panel, id: 'middle', displayInputs: { page: [{ key: setKey, selection: 'filter' }, { key: rangeKey, selection: 'highlight' }] },
    outputs: [{ key: middleKey, action: 'pick', selection: { shape: 'set', dimension: 'module' } }] },
  panels[0],
  { ...panels[3], outputs: [{ key: setKey, action: 'pick', selection: { shape: 'set', dimension: 'equipment', label: equipmentLabel } }] },
];
const chipKeys = [lastKey, middleKey, setKey, rangeKey];
const chipRegistry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: home.group, label: title, icon: House, space: spaceId('mars') }],
  menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false, panels: chipPanels,
    pageKeys: [...chipKeys, 'sort'], repeatedPageKeys: [lastKey, middleKey, setKey], contextResetKeys: chipKeys }],
});
function ChipWrapper({ children }: { children: ReactNode }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={chipRegistry}>{children}</PlatformProvider></I18nProvider>;
}
const chainQuery = '&operationSet=op&moduleSet=mod&equipmentSet=A&timeRange=14%3A00%2F16%3A00&sort=name';

it('orders analysis selection chips by filter ancestry and uses the first writer as source', () => {
  const result = mount(useAnalysisSelectionChips, chainQuery, ChipWrapper);
  expect(result.current.chips).toEqual([
    { key: setKey, selection: a, dimension: 'equipment', label: equipmentLabel, source: { panelId: 'source', title }, available: true, after: null },
    { key: middleKey, selection: { shape: 'set', values: ['mod'] }, dimension: 'module', label: null, source: { panelId: 'middle', title }, available: true, after: setKey },
    { key: lastKey, selection: { shape: 'set', values: ['op'] }, dimension: 'operation', label: null, source: { panelId: 'last', title }, available: true, after: middleKey },
    { key: rangeKey, selection: range, dimension: 'time', label: null, source: { panelId: 'source', title }, available: true, after: null },
  ]);
});

it('breaks only a filter cycle at its first declared member and keeps a later chip after it', () => {
  const pick = (key: string, dimension: string) => [{ key, action: 'pick', selection: { shape: 'set', dimension } }] as const;
  const filter = (key: string) => ({ page: [{ key, selection: 'filter' }] }) as const;
  const cyclePanels: PanelDeclaration[] = [
    { ...panel, id: 'pc', queryInputs: filter('ka'), outputs: [...pick('kc', 'c')] },
    { ...panel, id: 'pa', queryInputs: filter('kb'), outputs: [...pick('ka', 'a')] },
    { ...panel, id: 'pb', queryInputs: filter('ka'), outputs: [...pick('kb', 'b')] },
  ];
  const cycleRegistry = createRegistry({
    spaces: [testSpace()], groups: [{ id: home.group, label: title, icon: House, space: spaceId('mars') }],
    menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false, panels: cyclePanels,
      pageKeys: ['kc', 'ka', 'kb'], repeatedPageKeys: ['kc', 'ka', 'kb'], contextResetKeys: ['kc', 'ka', 'kb'] }],
  });
  const CycleWrapper = ({ children }: { children: ReactNode }) => <I18nProvider><PlatformProvider adapter={adapter} registry={cycleRegistry}>{children}</PlatformProvider></I18nProvider>;
  const result = mount(useAnalysisSelectionChips, '&kc=c&ka=a&kb=b', CycleWrapper);
  expect(result.current.chips.map(chip => [chip.key, chip.after])).toEqual([['ka', null], ['kc', 'ka'], ['kb', 'ka']]);

  let renders = 0;
  const linked = mount(() => {
    if (++renders > 20) throw new Error('Cyclic reports did not converge');
    const aInputs = useAnalysisSelectionInputs('pa');
    const bInputs = useAnalysisSelectionInputs('pb');
    useAnalysisSelectionOutput('pa', 'ka', { available: aInputs.applied.length ? [] : ['a'] });
    useAnalysisSelectionOutput('pb', 'kb', { available: bInputs.applied.length ? [] : ['b'] });
    useAnalysisSelectionOutput('pc', 'kc', { available: [] });
    return { aInputs, bInputs, chips: useAnalysisSelectionChips().chips };
  }, '&kc=c&ka=a&kb=b', CycleWrapper);
  expect(linked.current.chips.map(chip => [chip.key, chip.after, chip.available]))
    .toEqual([['ka', null, true], ['kc', 'ka', false], ['kb', 'ka', true]]);
  expect(linked.current.aInputs.applied.map(input => input.key)).toEqual(['kb']);
  expect(linked.current.bInputs.applied.map(input => input.key)).toEqual(['ka']);
  expect([...search().values()]).toEqual(['1', 'c', 'a', 'b']);
});

it('skips rejected keys when building chips', () => {
  const result = mount(useAnalysisSelectionChips, '&moduleSet=mod&timeRange=malformed&sort=name', ChipWrapper);
  expect(result.current.chips).toMatchObject([{ key: middleKey, label: null, after: null }]);
});

it('keeps the model reference while parsed values are equal', () => {
  const result = mount(() => ({ model: useAnalysisSelectionChips(), platform: usePlatform() }), chainQuery, ChipWrapper);
  const { model } = result.current;
  act(() => result.current.platform.setPage({ sort: 'date', [setKey]: ['A', 'A'] }));
  expect(result.current.model).toBe(model);
  act(() => result.current.platform.setPage({ [setKey]: 'B' }));
  expect(result.current.model.chips).not.toBe(model.chips);
});

it('clears only the middle chip and leaves the later analysis selection', () => {
  const result = mount(useAnalysisSelectionChips, chainQuery, ChipWrapper);
  act(() => {
    expect(result.current.clear('sort')).toBe(false);
    expect(result.current.clear(middleKey)).toBe(true);
    expect(result.current.clear(middleKey)).toBe(false);
  });
  expect(search().get(lastKey)).toBe('op');
  expect(result.current.chips.find(chip => chip.key === lastKey)?.after).toBeNull();
  expect(search().get('sort')).toBe('name');
});

it('clears all analysis selection keys in one history entry and restores them on Back', async () => {
  window.history.pushState(null, '', window.location.href);
  const from = '2026-09-19T00:00:00';
  const to = '2026-09-20T00:00:00';
  const result = mount(useAnalysisSelectionChips, `${chainQuery}&from=${from}&to=${to}`, ChipWrapper);
  const before = result.current.chips;
  const start = window.history.length;
  act(() => expect(result.current.clearAll()).toBe(true));
  expect(window.history.length).toBe(start + 1);
  expect(Object.fromEntries(search())).toEqual({ v: '1', sort: 'name', from, to });
  expect(result.current.clearAll()).toBe(false);
  window.history.back();
  await waitFor(() => expect(result.current.chips).toEqual(before));
});

it.each(['clear', 'clearAll'] as const)('proposes a single board pane write for %s', action => {
  const propose = vi.fn<(screen: PaneScreen, how: 'push' | 'replace') => void>();
  const Board = ({ children }: { children: ReactNode }) => <ChipWrapper><PaneScreenProvider paneId="one"
    screen={{ menuId: 'analysis', params: {}, query: '?v=1' + chainQuery }} onChange={propose} onLeave={() => {}}>{children}</PaneScreenProvider></ChipWrapper>;
  const result = mount(useAnalysisSelectionChips, '&equipmentSet=main', Board);
  expect(result.current.chips.map(chip => chip.key)).toEqual([setKey, middleKey, lastKey, rangeKey]);
  act(() => expect(result.current[action](middleKey)).toBe(true));
  expect(propose).toHaveBeenCalledTimes(1);
  const [[next, how]] = propose.mock.calls;
  expect(how).toBe('push');
  const page = new URLSearchParams(next.query);
  expect(page.has(middleKey)).toBe(false);
  expect(chipKeys.filter(key => page.has(key))).toEqual(action === 'clear' ? [lastKey, setKey, rangeKey] : []);
  expect(page.get('sort')).toBe('name');
  expect(search().get(setKey)).toBe('main');
});

it('clears a rejected raw value as part of clearing all keys', () => {
  const result = mount(useAnalysisSelectionChips, '&timeRange=malformed', ChipWrapper);
  expect(result.current.chips).toEqual([]);
  act(() => expect(result.current.clearAll()).toBe(true));
  expect(search().has(rangeKey)).toBe(false);
});

it('edits just the selected key and clears it when the set becomes empty', () => {
  const cleared = vi.fn();
  const committed = vi.fn();
  const result = mount(() => useAnalysisSelectionChips(cleared), chainQuery, ChipWrapper);
  act(() => expect(result.current.editor?.replace(setKey, b, committed)).toBe(true));
  expect(search().getAll(setKey)).toEqual(['B']);
  expect(search().get('sort')).toBe('name');
  expect(search().get(middleKey)).toBe('mod');
  expect(committed).toHaveBeenCalledOnce();
  expect(cleared).not.toHaveBeenCalled();
  act(() => expect(result.current.editor?.replace(setKey, { shape: 'set', values: [] })).toBe(true));
  expect(search().has(setKey)).toBe(false);
  expect(cleared).toHaveBeenCalledOnce();
});

it('completes a chip edit only after the address guard approves it', () => {
  const guard: { request?: ReturnType<typeof useLeaveRequest> } = {};
  function Guarded() {
    useUnsavedGuard(true, { leaves: 'address' });
    const request = useLeaveRequest();
    useLayoutEffect(() => { guard.request = request; }, [request]);
    return null;
  }
  const result = mount(useAnalysisSelectionChips, initialA, ({ children }) => <Wrapper><Guarded />{children}</Wrapper>);
  const committed = vi.fn();
  act(() => { result.current.editor?.replace(setKey, b, committed); });
  expect(guard.request).toBeTruthy();
  act(() => guard.request!.cancel());
  expect(search().getAll(setKey)).toEqual(['A']);
  expect(committed).not.toHaveBeenCalled();
  act(() => { result.current.editor?.replace(setKey, b, committed); });
  act(() => guard.request!.confirm());
  expect(search().getAll(setKey)).toEqual(['B']);
  expect(committed).toHaveBeenCalledOnce();
});

it('edits only the proposing board pane', () => {
  const propose = vi.fn<(screen: PaneScreen, how: 'push' | 'replace') => void>();
  const sibling = vi.fn();
  const pane = { menuId: 'analysis', params: {}, query: '?v=1' + chainQuery };
  const Board = ({ children }: { children: ReactNode }) => <ChipWrapper>
    <PaneScreenProvider paneId="one" screen={pane} onChange={propose} onLeave={() => {}}>{children}</PaneScreenProvider>
    <PaneScreenProvider paneId="two" screen={pane} onChange={sibling} onLeave={() => {}}><span /></PaneScreenProvider>
  </ChipWrapper>;
  const result = mount(useAnalysisSelectionChips, '&equipmentSet=main', Board);
  act(() => expect(result.current.editor?.replace(setKey, b)).toBe(true));
  expect(propose).toHaveBeenCalledOnce();
  expect(new URLSearchParams(propose.mock.calls[0][0].query).getAll(setKey)).toEqual(['B']);
  expect(sibling).not.toHaveBeenCalled();
  expect(search().get(setKey)).toBe('main');
});

it('resends an empty set edit while the board still renders the chip', () => {
  const propose = vi.fn();
  const Board = ({ children }: { children: ReactNode }) => <ChipWrapper><PaneScreenProvider paneId="one"
    screen={{ menuId: 'analysis', params: {}, query: '?v=1' + chainQuery }} onChange={propose} onLeave={() => {}}>{children}</PaneScreenProvider></ChipWrapper>;
  const result = mount(useAnalysisSelectionChips, '', Board);
  const empty = { shape: 'set', values: [] } as const;
  act(() => {
    expect(result.current.editor?.replace(setKey, empty)).toBe(true);
    expect(result.current.editor?.replace(setKey, empty)).toBe(true);
  });
  expect(propose).toHaveBeenCalledTimes(2);
});

it.each([
  ['string order', undefined, '15:00', '16:00', true],
  ['reversed string order', undefined, '17:00', '16:00', false],
  ['malformed endpoint', undefined, '', '16:00', false],
  ['numeric order', (a: string, b: string) => Number(a) - Number(b), '2', '10', true],
  ['numeric comparator rejecting malformed input', (a: string, b: string) => Number(BigInt(a) - BigInt(b)), 'invalid', '10', false],
] as const)('validates chip range edits with %s', (_, compare, from, to, valid) => {
  const initial = compare ? '14/16' : '14:00/16:00';
  const result = mount(() => {
    useAnalysisSelectionOutput('source', rangeKey, { available: compare && { from: '0', to: '20', compare } });
    return useAnalysisSelectionChips();
  }, `&timeRange=${initial}`);
  act(() => expect(result.current.editor?.replace(rangeKey, { shape: 'range', from, to })).toBe(valid));
  expect(search().get(rangeKey)).toBe(valid ? `${from}/${to}` : initial);
});

it('returns empty chips and refuses writes in a lent panel', () => {
  const result = mount(useAnalysisSelectionChips, chainQuery, ({ children }) => <ChipWrapper><Lent>{children}</Lent></ChipWrapper>);
  expect(result.current.chips).toEqual([]);
  expect(result.current.clear(setKey)).toBe(false);
  expect(result.current.clearAll()).toBe(false);
  expect(search().get(setKey)).toBe('A');
});

it.each([
  ['time', undefined, false],
  ['category with timestamp labels', [{ value: '2026-09-01T14:00:00', label: 'First' }, { value: '2026-09-01T16:00:00', label: 'Last' }], true],
] as const)('validates equal chip range endpoints on a %s axis', (_, candidates, valid) => {
  const from = '2026-09-01T14:00:00';
  const to = '2026-09-01T16:00:00';
  const result = mount(() => {
    useAnalysisSelectionOutput('source', rangeKey, { available: { from, to, candidates } });
    return useAnalysisSelectionChips();
  }, `&timeRange=${from}/${to}`);

  act(() => expect(result.current.editor?.replace(rangeKey, { shape: 'range', from, to: from })).toBe(valid));
  expect(search().get(rangeKey)).toBe(`${from}/${valid ? from : to}`);
});

it('refuses a stale clear after leaving the screen in the same event', () => {
  const { current: { model, platform } } = mount(() => ({ model: useAnalysisSelectionChips(), platform: usePlatform() }), chainQuery, ChipWrapper);
  act(() => {
    expect(platform.navigate('/mars')).toBe(true);
    expect(model.clear(setKey)).toBe(false);
    expect(model.clearAll()).toBe(false);
  });
});

it('returns empty chips and refuses writes on a route without menu state', () => {
  window.history.replaceState(null, '', '/board');
  const { result } = renderHook(useAnalysisSelectionChips, { wrapper: ChipWrapper });
  expect(result.current.chips).toEqual([]);
  expect(result.current.clear(setKey)).toBe(false);
  expect(result.current.clearAll()).toBe(false);
});

it('refuses retained clear actions after the screen unmounts', () => {
  window.history.replaceState(null, '', `/mars/analysis?v=1${chainQuery}`);
  const { result, unmount } = renderHook(useAnalysisSelectionChips, { wrapper: ChipWrapper });
  const { clear, clearAll } = result.current;
  unmount();
  expect(clear(setKey)).toBe(false);
  expect(clearAll()).toBe(false);
  expect(search().get(setKey)).toBe('A');
});

it.each([
  ['unknown', undefined, true],
  ['none present', ['C'], false],
  ['partly present', ['A', 'C'], true],
] as const)('models a set with %s availability', (_, available, expected) => {
  const result = mount(() => {
    useAnalysisSelectionOutput('source', setKey, { available });
    return { chips: useAnalysisSelectionChips().chips, inputs: useAnalysisSelectionInputs('receiver') };
  }, '&equipmentSet=A&equipmentSet=B');
  expect(result.current.chips[0]?.available).toBe(expected);
  expect(result.current.inputs.filtered).toBe(expected);
  expect(result.current.inputs.applied.map(input => input.key)).toEqual(expected ? [setKey] : []);
  expect(result.current.inputs.unavailable).toEqual(expected ? [] : [setKey]);
});

it.each([['16:01', false], ['16:00', true]] as const)('models a range with an extent starting at %s', (from, expected) => {
  const result = mount(() => {
    useAnalysisSelectionOutput('source', rangeKey, { available: { from, to: '18:00' } });
    return { chips: useAnalysisSelectionChips().chips, inputs: useAnalysisSelectionInputs('receiver') };
  }, '&timeRange=14:00/16:00');
  expect(result.current.chips[0]?.available).toBe(expected);
  expect(result.current.inputs.unavailable).toEqual(expected ? [] : [rangeKey]);
});

it('applies a numeric range overlapping a shorter-width extent', () => {
  const available = { from: '3', to: '8', compare: (a: string, b: string) => Number(a) - Number(b) };
  const result = mount(() => {
    useAnalysisSelectionOutput('source', rangeKey, { available });
    return { chips: useAnalysisSelectionChips().chips, inputs: useAnalysisSelectionInputs('receiver') };
  }, '&timeRange=2/10');
  expect(result.current.chips[0]?.available).toBe(true);
  expect(result.current.inputs.applied.map(input => input.key)).toEqual([rangeKey]);
});

it('releases a range filter when a late comparator rejects the edited value', () => {
  const filterPanel: PanelDeclaration = { ...panel, id: 'range-filter', queryInputs: { page: [{ key: rangeKey, selection: 'filter' }] } };
  const filterRegistry = createRegistry({
    spaces: [testSpace()],
    groups: [{ id: home.group, label: title, icon: House, space: spaceId('mars') }],
    menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false, panels: [...panels, filterPanel],
      pageKeys: [setKey, rangeKey], repeatedPageKeys: [setKey], contextResetKeys: [setKey, rangeKey] }],
  });
  const extent = { from: '0', to: '20', compare: (a: string, b: string) => Number(BigInt(a) - BigInt(b)) };
  const result = mount(() => {
    const [reported, report] = useState(false);
    useAnalysisSelectionOutput('source', rangeKey, { available: reported ? extent : undefined });
    return { report, model: useAnalysisSelectionChips(), inputs: useAnalysisSelectionInputs('range-filter') };
  }, '&timeRange=2/10', ({ children }) => <I18nProvider><PlatformProvider adapter={adapter} registry={filterRegistry}>{children}</PlatformProvider></I18nProvider>);
  const selection = { shape: 'range', from: '2', to: 'not-a-number' } as const;
  act(() => expect(result.current.model.editor?.replace(rangeKey, selection)).toBe(true));
  expect(result.current.inputs.filtered).toBe(true);
  expect(result.current.inputs.applied[0]?.selection).toEqual(selection);

  act(() => result.current.report(true));
  expect(result.current.model.chips).toMatchObject([{ key: rangeKey, selection, available: false }]);
  expect(result.current.inputs).toMatchObject({ filtered: false, applied: [], unavailable: [rangeKey], rejected: [] });
  expect(search().get(rangeKey)).toBe('2/not-a-number');
});

it.each(['older', 'newer'] as const)('keeps a shared report when the %s reporter unmounts', removed => {
  const available: readonly string[] = [];
  function Reporter() {
    useAnalysisSelectionOutput('source', setKey, { available });
    return null;
  }
  window.history.replaceState(null, '', '/mars/analysis?v=1' + initialA);
  const { result } = renderHook(useAnalysisSelectionChips, {
    wrapper: function Reporters({ children }: { children: ReactNode }) {
      const [hidden, hide] = useState(false);
      return <Wrapper>{(!hidden || removed === 'newer') && <Reporter key="older" />}
        {(!hidden || removed === 'older') && <Reporter key="newer" />}
        <button onClick={() => hide(true)}>Unmount reporter</button>{children}</Wrapper>;
    },
  });
  expect(result.current.chips[0]?.available).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Unmount reporter' }));
  expect(result.current.chips[0]?.available).toBe(false);
});

it('keeps reports separate for the main screen and each board pane', () => {
  const pane = { menuId: 'analysis', params: {}, query: '?v=1' + initialA };
  const checks: Record<string, boolean | undefined> = {};
  function Probe({ id, available }: { id: string; available?: readonly string[] }) {
    useAnalysisSelectionOutput('source', setKey, { available });
    const value = useAnalysisSelectionChips().chips[0]?.available;
    useLayoutEffect(() => { checks[id] = value; }, [id, value]);
    return null;
  }
  function Board({ children }: { children: ReactNode }) {
    return <Wrapper>
      <Probe id="main" available={[]} />
      <PaneScreenProvider paneId="one" screen={pane} onChange={() => {}} onLeave={() => {}}><Probe id="one" available={['A']} /></PaneScreenProvider>
      <PaneScreenProvider paneId="two" screen={pane} onChange={() => {}} onLeave={() => {}}><Probe id="two" available={[]} /></PaneScreenProvider>
      {children}
    </Wrapper>;
  }
  const result = mount(useAnalysisSelectionChips, initialA, Board);
  expect(checks).toEqual({ main: false, one: true, two: false });
  expect(result.current.chips[0]?.available).toBe(false);
});

it('shares a transient hover with the first writer in the same board pane', () => {
  window.history.replaceState(null, '', '/mars/analysis?v=1' + initialA);
  const pane = { menuId: 'analysis', params: {}, query: '?v=1' + initialA };
  const paneProps = { screen: pane, onChange: vi.fn(), onLeave: vi.fn() };
  function Editor() {
    const begin = useAnalysisSelectionHoverTarget(setKey);
    useLayoutEffect(() => begin(), [begin]);
    return null;
  }
  function Board({ children }: { children: ReactNode }) {
    const [editing, setEditing] = useState(false);
    return <Wrapper><PaneQueryDraftProvider screens={{ one: pane, two: pane }}>
      <button onClick={() => setEditing(value => !value)}>Toggle editor</button>
      {editing && <PaneScreenProvider paneId="one" {...paneProps}><Editor /></PaneScreenProvider>}
      <PaneScreenProvider paneId="one" {...paneProps}>{children}</PaneScreenProvider>
      <PaneScreenProvider paneId="two" {...paneProps}><Source label="other pane" /></PaneScreenProvider>
      <Source label="main screen" />
    </PaneQueryDraftProvider></Wrapper>;
  }
  function Source({ label }: { label: string }) {
    const { highlighted } = useAnalysisSelectionOutput('source', setKey);
    return <output aria-label={label}>{String(highlighted)}</output>;
  }
  const { result } = renderHook(() => ({
    source: useAnalysisSelectionOutput('source', setKey).highlighted,
    alternate: useAnalysisSelectionOutput('alternate', setKey).highlighted,
  }), { wrapper: Board });
  expect(result.current).toEqual({ source: false, alternate: false });
  const address = window.location.href;
  const toggle = screen.getByRole('button', { name: 'Toggle editor' });
  fireEvent.click(toggle);
  expect(result.current).toEqual({ source: true, alternate: false });
  expect(screen.getByLabelText('other pane')).toHaveTextContent('false');
  expect(screen.getByLabelText('main screen')).toHaveTextContent('false');
  fireEvent.click(toggle);
  expect(result.current.source).toBe(false);
  expect(window.location.href).toBe(address);
  expect(paneProps.onChange).not.toHaveBeenCalled();
});

it('drops reported availability after leaving and returning to the screen', async () => {
  const result = mount(() => {
    const platform = usePlatform();
    const [report, setReport] = useState(true);
    useAnalysisSelectionOutput('source', setKey, { available: report ? [] : undefined });
    return { platform, setReport, chips: useAnalysisSelectionChips().chips };
  }, initialA);
  expect(result.current.chips[0]?.available).toBe(false);
  act(() => { result.current.platform.navigate('/mars'); });
  expect(result.current.chips).toEqual([]);
  act(() => result.current.setReport(false));
  window.history.back();
  await waitFor(() => expect(result.current.chips[0]?.available).toBe(true));
});

it('re-evaluates the later chip when Back restores a cleared middle chip', async () => {
  const result = mount(() => {
    const { pageParam } = usePlatform();
    useAnalysisSelectionOutput('last', lastKey, { available: pageParam(middleKey) === 'mod' ? ['op'] : ['other'] });
    return useAnalysisSelectionChips();
  }, chainQuery, ChipWrapper);
  const last = () => result.current.chips.find(chip => chip.key === lastKey);
  expect(last()?.available).toBe(true);
  act(() => { result.current.clear(middleKey); });
  expect(search().get(lastKey)).toBe('op');
  expect(last()?.available).toBe(false);
  window.history.back();
  await waitFor(() => expect(last()).toMatchObject({ after: middleKey, available: true }));
});

it.each(['metaKey', 'ctrlKey'] as const)('undoes only consecutive selection steps with %s and preserves native editing', async modifier => {
  const result = mount(useWriter);
  const go = vi.spyOn(window.history, 'go');
  try {
    act(() => result.current.platform.setPage({ sort: 'name' }));
    act(() => result.current.output.select({ shape: 'set', values: ['A'] }));
    act(() => result.current.output.select({ shape: 'set', values: ['B'] }));
    const { unmount } = render(<><input aria-label="local edit" /><div role="dialog" hidden><button type="button">dialog</button></div></>);
    const undo = (target: HTMLElement = document.body) => fireEvent.keyDown(target, { key: 'z', [modifier]: true });
    screen.getByRole('textbox').focus();
    undo(screen.getByRole('textbox'));
    expect(go).not.toHaveBeenCalled();
    screen.getByRole('textbox').blur();
    const dialog = screen.getByRole('dialog', { hidden: true });
    dialog.removeAttribute('hidden');
    undo();
    expect(go).not.toHaveBeenCalled();
    unmount();
    undo();
    await waitFor(() => expect(search().get(setKey)).toBe('A'));
    undo();
    await waitFor(() => expect(search().has(setKey)).toBe(false));
    undo();
    expect(go.mock.calls).toEqual([[-1], [-1]]);
    expect(search().get('sort')).toBe('name');
  } finally { go.mockRestore(); }
});

it('runs undo through the Back guard and waits for discard confirmation', async () => {
  const result = mount(() => {
    const writer = useWriter();
    const [dirty, setDirty] = useState(false);
    useUnsavedGuard(dirty, { leaves: 'address' });
    return { ...writer, setDirty, request: useLeaveRequest() };
  }, initialA);
  act(() => result.current.output.select(b));
  act(() => result.current.setDirty(true));
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  await waitFor(() => expect(result.current.request).toBeTruthy());
  await waitFor(() => expect(search().get(setKey)).toBe('B'));
  expect(result.current.output.selection).toEqual(b);
  act(() => result.current.request!.confirm());
  await waitFor(() => expect(result.current.output.selection).toEqual({ shape: 'set', values: ['A'] }));
});

it.each(['metaKey', 'ctrlKey'] as const)('ignores %s undo in the board and uses guarded Back on the main screen', async modifier => {
  const result = mount(() => {
    const writer = useWriter();
    const [dirty, setDirty] = useState(false);
    useUnsavedGuard(dirty, { leaves: 'address' });
    return { ...writer, setDirty, request: useLeaveRequest() };
  }, initialA);
  render(<>
    <main><button type="button">Main action</button></main>
    <div data-floating-mode="window">
      <button type="button">Window action</button>
      <div data-pane-id="p1"><button type="button">Pane action</button></div>
    </div>
  </>);
  const go = vi.spyOn(window.history, 'go');
  const undoOn = (name: string) => {
    const button = screen.getByRole('button', { name });
    button.focus();
    fireEvent.keyDown(button, { key: 'z', [modifier]: true });
  };
  try {
    act(() => result.current.output.select(b));
    act(() => result.current.setDirty(true));
    undoOn('Pane action');
    undoOn('Window action');
    expect(go).not.toHaveBeenCalled();
    expect(result.current.request).toBeNull();
    expect(search().get(setKey)).toBe('B');

    undoOn('Main action');
    await waitFor(() => expect(result.current.request).toBeTruthy());
    expect(search().get(setKey)).toBe('B');
    act(() => result.current.request!.confirm());
    await waitFor(() => expect(search().get(setKey)).toBe('A'));
  } finally { go.mockRestore(); }
});
