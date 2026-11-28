import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { emptyGlobal, groupId, NO_FEATURES, spaceId, type AnalysisSelection, type PanelDeclaration, type PanelInstance, type PanelInstanceInput } from '@ap/contracts';
import { House } from 'lucide-react';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi, describe } from 'vitest';
import { AnalysisSelectionInstances, analysisSelectionParam, HeldAnalysisSelections, type HeldAnalysisSelection, parseAnalysisSelection, useAnalysisSelectionChips, useAnalysisSelectionInputs, useAnalysisSelectionOutput, usePlatform } from '../../index';
import { I18nProvider } from '../../i18n';
import { LentPanelPlatformContext } from '../../platform/contexts';
import { useAnalysisSelectionHoverTarget } from '../analysisSelection';
import { useAnalysisSelectionSourceHighlighted } from '../../host';
import { useLeaveRequest, useUnsavedGuard } from '../../platform/hooks';
import { lentPanelPlatform } from '../../platform/lent-panel-platform';
import { PaneQueryDraftProvider, PaneScreenProvider, PlatformProvider, useHostPlatform, type PaneScreen } from '../../platform/platform';
import { queryMissingRequired } from '../../query/draft-state';
import { disabledReason, projectDisplayInputs, projectQueryInputs } from '../../registry/panel-inputs';
import { createRegistry, type MenuEntry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { at } from '../../test-support';

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
  ['matching origin', '/mars/analysis?v=1&scopeId=MEM&timeRange=14:00/16:00', true],
  ['no returnTo', null, false],
  ['rejected returnTo', '/mars/denied?v=1&scopeId=MEM&timeRange=14:00/16:00', false],
  ['different value', '/mars/analysis?v=1&scopeId=MEM&timeRange=14:00/15:00', false],
  ['different Scope', '/mars/analysis?v=1&scopeId=OTHER&timeRange=14:00/16:00', false],
  ['writerless origin', '/mars/receiver?v=1&scopeId=MEM&days=14:00/16:00', false],
  ['different shape', '/mars/set-origin?v=1&scopeId=MEM&timeRange=14:00/16:00', false],
] as const)('models a writerless inbound chip with %s', (_, origin, arrives) => {
  const source = registry.menuById('analysis');
  const inbound: MenuEntry = { ...home, id: 'receiver', primary: false, path: '/receiver',
    pageKeys: ['days', 'returnTo'], contextResetKeys: ['days'],
    analysisSelectionInbound: [{ key: 'days', dimension: 'time', shape: 'range' }] };
  const linked = createRegistry({ spaces: registry.spaces, groups: registry.groups,
    menus: [...registry.menus, inbound,
      { ...source, id: 'denied', path: '/denied', aliases: [], permission: 'console:access' },
      { ...source, id: 'set-origin', path: '/set-origin', aliases: [], pageKeys: [rangeKey], repeatedPageKeys: [rangeKey], contextResetKeys: [rangeKey],
        panels: [{ ...panel, outputs: [{ key: rangeKey, action: 'pick', selection: { dimension: 'time', shape: 'set' } }] }] },
    ] });
  const query = new URLSearchParams({ v: '1', scopeId: 'MEM', days: '14:00/16:00' });
  if (origin) query.set('returnTo', origin);
  window.history.replaceState(null, '', `/mars/receiver?${query}`);
  const { result } = renderHook(() => ({ model: useAnalysisSelectionChips(), setPage: usePlatform().setPage }), { wrapper: ({ children }) =>
    <I18nProvider><PlatformProvider adapter={adapter} registry={linked}>{children}</PlatformProvider></I18nProvider> });
  expect(result.current.model.chips).toMatchObject([{ key: 'days', selection: range, available: true }]);
  expect(result.current.model.chips[0]?.source).toBeUndefined();
  expect(result.current.model.chips[0]?.arrival).toEqual(arrives ? { href: origin } : undefined);
  if (arrives) {
    const updated = `${origin}&sort=desc`;
    act(() => result.current.setPage({ returnTo: updated }));
    expect(result.current.model.chips[0]?.arrival).toEqual({ href: updated });
    act(() => result.current.setPage({ returnTo: origin }));
  }
  act(() => expect(result.current.model.clear('days')).toBe(true));
  expect(search().has('days')).toBe(false);
  expect(search().get('returnTo')).toBe(origin);
});

it.each([
  ['no reader', {}, false],
  ['query reader', { queryInputs: { page: [{ key: 'days', selection: 'filter' }] } }, undefined],
  ['display reader', { displayInputs: { page: [{ key: 'days', selection: 'highlight' }] } }, undefined],
] as const)('sets applied on a writerless inbound chip with %s', (kind, inputs, applied) => {
  const receiver: MenuEntry = { ...home, id: 'receiver', primary: false, path: '/receiver',
    pageKeys: ['days'], contextResetKeys: ['days'],
    analysisSelectionInbound: [{ key: 'days', dimension: 'time', shape: 'range' }],
    panels: kind === 'no reader' ? [] : [{ ...panel, ...inputs }],
  };
  const linked = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [home, receiver] });
  window.history.replaceState(null, '', '/mars/receiver?v=1&days=14:00/16:00');
  const { result } = renderHook(useAnalysisSelectionChips, { wrapper: ({ children }) =>
    <I18nProvider><PlatformProvider adapter={adapter} registry={linked}>{children}</PlatformProvider></I18nProvider> });
  expect(result.current.chips).toHaveLength(1);
  expect(result.current.chips[0]?.source).toBeUndefined();
  expect(result.current.chips[0]?.applied).toBe(applied);
});

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
  const receiver = { ...at(panels, 1), availability: { requires: [{ anyOf: [key] }], disabledReason: title } };
  expect(disabledReason(receiver, { [rangeKey]: platform.pageParam(rangeKey), [setKey]: platform.pageParams(setKey) })).toEqual(title);
});

it.each(invalidEntries)('omits invalid URL values for %s from projections and required inputs', (key, values) => {
  const query = new URLSearchParams(values.map(value => [key, value]));
  const { current: platform } = mount(usePlatform, `&${query}`);
  const inputs = { [rangeKey]: platform.pageParam(rangeKey), [setKey]: platform.pageParams(setKey) };
  const receiver = at(panels, 1);
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
  expect(receiver).toEqual({ filtered: true, rejected: [], rejectedHeld: [], unavailable: [], applied: [
    { key: setKey, use: 'filter', selection: set, source: { panelId: 'source', title, dimension: 'equipment' } },
    { key: rangeKey, use: 'highlight', selection: range, source: { panelId: 'source', title, dimension: 'time' } },
  ] });
  expect(result.current.plain).toEqual({ applied: [], filtered: false, rejected: [], rejectedHeld: [], unavailable: [] });
  act(() => result.current.platform.setPage({ sort: 'name', [setKey]: ['B', 'A', 'B'] }));
  expect(result.current.receiver).toBe(receiver);
  act(() => result.current.platform.setPage({ [setKey]: null }));
  expect(result.current.receiver).toEqual({ filtered: false, applied: [receiver.applied[1]], rejected: [], rejectedHeld: [], unavailable: [] });
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
  expect(result.current.inputs).toEqual({ applied: [], filtered: false, rejected: [], rejectedHeld: [], unavailable: [] });
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
  at(panels, 0),
  { ...at(panels, 3), outputs: [{ key: setKey, action: 'pick', selection: { shape: 'set', dimension: 'equipment', label: equipmentLabel } }] },
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
  const [next, how] = at(propose.mock.calls, 0);
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
  expect(new URLSearchParams(at(propose.mock.calls, 0)[0].query).getAll(setKey)).toEqual(['B']);
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
  ['source without candidates (time axis or unreported categories)', undefined, true],
  ['category with timestamp labels', [{ value: '2026-09-01T14:00:00', label: 'First' }, { value: '2026-09-01T16:00:00', label: 'Last' }], true],
] as const)('accepts equal chip range endpoints from a %s', (_, candidates, valid) => {
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
    <div data-floating-window="">
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

it.each([
  ['stored highlight over declared filter', setKey, 'highlight', 'highlight'],
  ['stored filter over declared highlight', rangeKey, 'filter', 'filter'],
  ['omitted use on a declared filter', setKey, undefined, 'filter'],
  ['omitted use on a declared highlight', rangeKey, undefined, 'highlight'],
  ['omitted input', setKey, 'ignore', undefined],
] as const)('reads %s from a restored instance', (_label, key, use, expected) => {
  const inputs: PanelInstanceInput[] = use === 'ignore' ? [] : [{
    key, from: `source.${key}`, mode: 'follow', ...(use && { use }),
  }];
  const result = mount(() => useAnalysisSelectionInputs('receiver', inputs), `&${key}=${key === setKey ? 'B' : '14:00/16:00'}`);
  expect(result.current.applied.map(input => input.use)).toEqual(expected ? [expected] : []);
  expect(result.current.filtered).toBe(expected === 'filter');
});

it.each([['highlight', true], ['filter', false]] as const)('uses a restored %s connection when guarding availability reports against filter cycles', (use, expected) => {
  const cyclePanels: PanelDeclaration[] = [
    { ...panel, id: 'a', queryInputs: { page: [{ key: 'kb', selection: 'filter' }] },
      outputs: [{ key: 'ka', action: 'pick', selection: { shape: 'set', dimension: 'a' } }] },
    { ...panel, id: 'b', displayInputs: { page: [{ key: 'ka', selection: 'highlight' }] },
      outputs: [{ key: 'kb', action: 'pick', selection: { shape: 'set', dimension: 'b' } }] },
  ];
  const cycleRegistry = createRegistry({
    spaces: registry.spaces, groups: registry.groups,
    menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false, panels: cyclePanels,
      pageKeys: ['ka', 'kb'], repeatedPageKeys: ['ka', 'kb'], contextResetKeys: ['ka', 'kb'] }],
  });
  const instances: PanelInstance[] = [
    { id: 'a', source: { kind: 'declared', panel: 'a' }, inputs: [{ key: 'kb', from: 'b.kb', mode: 'follow' }],
      outputs: [{ key: 'ka', shape: 'set', dimension: 'a' }] },
    { id: 'b', source: { kind: 'declared', panel: 'b' }, inputs: [{ key: 'ka', from: 'a.ka', mode: 'follow', use }],
      outputs: [{ key: 'kb', shape: 'set', dimension: 'b' }] },
  ];
  const result = mount(() => useAnalysisSelectionOutput('a', 'ka', { available: ['a'], instanceId: 'a' }), '&ka=a', ({ children }) =>
    <I18nProvider><PlatformProvider adapter={adapter} registry={cycleRegistry}><AnalysisSelectionInstances instances={instances}>{children}</AnalysisSelectionInstances></PlatformProvider></I18nProvider>);
  expect(result.current.availabilityCurrent).toBe(expected);
});


describe('HeldAnalysisSelections (#2862)', () => {
  const held = { [setKey]: { dimension: 'equipment', selection: { shape: 'set', values: ['H'] } } } as const satisfies Record<string, HeldAnalysisSelection>;
  const wrap = (value: Record<string, HeldAnalysisSelection>) => function Held({ children }: { children: ReactNode }) {
    return <Wrapper><HeldAnalysisSelections held={value}>{children}</HeldAnalysisSelections></Wrapper>;
  };
  it('uses the held context value and the stored receiving mode for a restored hold', () => {
    const input: PanelInstanceInput = { key: setKey, from: `source.${setKey}`, mode: 'hold', use: 'highlight',
      value: { shape: 'set', values: ['serialized'] } };
    const result = mount(() => useAnalysisSelectionInputs('receiver', [input]), `&${setKey}=B`, wrap(held));
    expect(result.current.applied).toMatchObject([{ key: setKey, use: 'highlight', held: true, selection: held[setKey].selection }]);
    expect(result.current.filtered).toBe(false);
  });
  it('reads the held value for its key, marks it held and lets other keys follow the URL', () => {
    const result = mount(() => useAnalysisSelectionInputs('receiver'), `&${setKey}=B&${rangeKey}=14:00/16:00`, wrap(held));
    expect(result.current.applied.map(input => [input.key, input.selection, input.held])).toEqual([
      [setKey, { shape: 'set', values: ['H'] }, true],
      [rangeKey, range, undefined],
    ]);
    expect(result.current.filtered).toBe(true);
  });
  it('applies the held value with nothing in the URL, and the URL value outside the wrapper', () => {
    expect(mount(() => useAnalysisSelectionInputs('receiver'), '', wrap(held)).current.applied.map(input => input.key)).toEqual([setKey]);
    expect(mount(() => useAnalysisSelectionInputs('receiver'), `&${setKey}=B`).current.applied[0]?.selection).toEqual({ shape: 'set', values: ['B'] });
  });
  it.each([
    ['another shape', { dimension: 'equipment', selection: range }],
    ['another dimension now', { dimension: 'module', selection: { shape: 'set', values: ['H'] } }],
    ['an empty set', { dimension: 'equipment', selection: { shape: 'set', values: [] } }],
    ['repeated values', { dimension: 'equipment', selection: { shape: 'set', values: ['H', 'H'] } }],
  ] as const)('rejects a held value with %s as held, without falling back to a valid URL value (R C1–C3)', (_name, value) => {
    const result = mount(() => useAnalysisSelectionInputs('receiver'), `&${setKey}=B`, wrap({ [setKey]: value as HeldAnalysisSelection }));
    expect(result.current.applied).toEqual([]);
    expect(result.current.rejectedHeld).toEqual([setKey]);
    expect(result.current.rejected).toEqual([]);
  });
  it('applies a held range of date-like category keys in any order: range order belongs to the dimension (R2 C1, C6)', () => {
    const categories = { [rangeKey]: { dimension: 'time', selection: { shape: 'range', from: '2026-09-02T00:00:00', to: '2026-09-01T00:00:00' } } } as const;
    const result = mount(() => useAnalysisSelectionInputs('receiver'), '', wrap(categories));
    expect(result.current.rejectedHeld).toEqual([]);
    expect(result.current.applied.map(input => input.key)).toEqual([rangeKey]);
  });
});

it('reads both declared uses of a key when no instance inputs are supplied', () => {
  const both = createRegistry({
    spaces: registry.spaces, groups: registry.groups,
    menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false,
      panels: [panels[0]!, { ...panel, id: 'both', outputs: [], queryInputs: {}, displayInputs: { page: [
        { key: setKey, selection: 'highlight' }, { key: setKey, selection: 'filter' },
      ] } }], pageKeys: [setKey, rangeKey], repeatedPageKeys: [setKey], contextResetKeys: [setKey, rangeKey] }],
  });
  const result = mount(() => useAnalysisSelectionInputs('both'), `&${setKey}=B`, ({ children }) =>
    <I18nProvider><PlatformProvider adapter={adapter} registry={both}>{children}</PlatformProvider></I18nProvider>);
  expect(result.current.applied.map(input => input.use)).toEqual(['highlight', 'filter']);
  expect(result.current.filtered).toBe(true);
});

it.each([
  ['upstream', ['a1', 'a2', 'b'], [['ka', null], ['kb', 'ka']]],
  ['downstream', ['a2', 'a1', 'b'], [['kb', null], ['ka', 'kb']]],
] as const)('reports availability and orders chips with the %s duplicate instance first', (_first, order, expected) => {
  const chain = createRegistry({
    spaces: registry.spaces, groups: registry.groups,
    menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false,
      pageKeys: ['ka', 'kb'], repeatedPageKeys: ['ka', 'kb'], contextResetKeys: ['ka', 'kb'],
      panels: [
        { ...panel, id: 'a', queryInputs: { page: [{ key: 'kb', selection: 'filter' }] },
          outputs: [{ key: 'ka', action: 'pick', selection: { shape: 'set', dimension: 'a' } }] },
        { ...panel, id: 'b', queryInputs: { page: [{ key: 'ka', selection: 'filter' }] },
          outputs: [{ key: 'kb', action: 'pick', selection: { shape: 'set', dimension: 'b' } }] },
      ] }],
  });
  const nodes: PanelInstance[] = [
    { id: 'a1', source: { kind: 'declared', panel: 'a' }, inputs: [], outputs: [{ key: 'ka', dimension: 'a', shape: 'set' }] },
    { id: 'a2', source: { kind: 'declared', panel: 'a' }, inputs: [{ key: 'kb', from: 'b.kb', mode: 'follow' }],
      outputs: [{ key: 'ka', dimension: 'a', shape: 'set' }] },
    { id: 'b', source: { kind: 'declared', panel: 'b' }, inputs: [{ key: 'ka', from: 'a1.ka', mode: 'follow' }],
      outputs: [{ key: 'kb', dimension: 'b', shape: 'set' }] },
  ];
  const instances = order.map(id => nodes.find(node => node.id === id)!);
  const result = mount(() => ({
    a: useAnalysisSelectionOutput('a', 'ka', { available: ['A'], instanceId: order[0] }),
    b: useAnalysisSelectionOutput('b', 'kb', { available: ['B'], instanceId: 'b' }),
    chips: useAnalysisSelectionChips().chips,
  }), '&ka=A&kb=B', ({ children }) =>
    <I18nProvider><PlatformProvider adapter={adapter} registry={chain}><AnalysisSelectionInstances instances={instances}>{children}</AnalysisSelectionInstances></PlatformProvider></I18nProvider>);
  expect(result.current.a.availabilityCurrent).toBe(true);
  expect(result.current.b.availabilityCurrent).toBe(true);
  expect(result.current.chips.map(({ key, after }) => [key, after])).toEqual(expected);
});

it.each(['equipment', 'other'])('validates a stored hold against source dimension %s with an empty URL', dimension => {
  const input: PanelInstanceInput = { key: setKey, from: `saved-source.${setKey}`, mode: 'hold', value: { shape: 'set', values: ['H'] } };
  const instances: PanelInstance[] = [
    { id: 'saved-source', source: { kind: 'declared', panel: 'source' }, inputs: [], outputs: [{ key: setKey, dimension, shape: 'set' }] },
    { id: 'saved-receiver', source: { kind: 'declared', panel: 'receiver' }, inputs: [input], outputs: [] },
  ];
  const result = mount(() => useAnalysisSelectionInputs('receiver', [input]), '', ({ children }) =>
    <Wrapper><AnalysisSelectionInstances instances={instances}><HeldAnalysisSelections held={{ [setKey]: { dimension, selection: input.value } }}>{children}</HeldAnalysisSelections></AnalysisSelectionInstances></Wrapper>);
  if (dimension === 'equipment') {
    expect(result.current.applied).toMatchObject([{ key: setKey, held: true, selection: input.value }]);
  } else {
    expect(result.current.rejectedHeld).toEqual([setKey]);
    expect(result.current.applied).toEqual([]);
  }
});

const wiredKeys = ['ka', 'kb', 'kc'];
const wiredRegistry = createRegistry({
  spaces: registry.spaces, groups: registry.groups,
  menus: [home, { ...home, id: 'analysis', path: '/analysis', primary: false,
    pageKeys: wiredKeys, repeatedPageKeys: wiredKeys, contextResetKeys: wiredKeys,
    panels: wiredKeys.map((key, index) => ({
      ...panel, id: key, title: { ko: key, en: key },
      displayInputs: index === 0 ? { page: [
        { key: 'kb', selection: 'highlight' as const }, { key: 'kb', selection: 'filter' as const },
        { key: 'kc', selection: 'filter' as const },
      ] } : {},
      outputs: [{ key, action: 'pick' as const, selection: { shape: 'set' as const, dimension: 'equipment' } }],
    })) }],
});
const wiredSource = (id: string, key: string): PanelInstance => ({
  id, source: { kind: 'declared', panel: key }, inputs: [], outputs: [{ key, shape: 'set', dimension: 'equipment' }],
});
const wiredWrapper = (instances?: PanelInstance[]) => function Wired({ children }: { children: ReactNode }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={wiredRegistry}>
    <AnalysisSelectionInstances instances={instances}>{children}</AnalysisSelectionInstances>
  </PlatformProvider></I18nProvider>;
};
const followOtherKey: PanelInstanceInput = { key: 'kb', from: 'c.kc', mode: 'follow' };

it('follows the saved output key and checks that output’s availability', () => {
  const receiver = { ...wiredSource('a', 'ka'), inputs: [followOtherKey] };
  const instances = [receiver, wiredSource('b', 'kb'), wiredSource('c', 'kc')];
  const result = mount(() => {
    const [available, setAvailable] = useState(['C']);
    useAnalysisSelectionOutput('kc', 'kc', { available, instanceId: 'c' });
    return { input: useAnalysisSelectionInputs('ka', receiver.inputs), setAvailable, chips: useAnalysisSelectionChips().chips };
  }, '&ka=A&kb=B&kc=C', wiredWrapper(instances));

  expect(result.current.input.applied).toMatchObject([
    { key: 'kb', use: 'highlight', selection: { values: ['C'] }, source: { panelId: 'kc' } },
    { key: 'kb', use: 'filter', selection: { values: ['C'] }, source: { panelId: 'kc' } },
  ]);
  expect(result.current.chips.find(chip => chip.key === 'ka')?.after).toBe('kc');
  act(() => result.current.setAvailable(['D']));
  expect(result.current.input.applied).toEqual([]);
  expect(result.current.input.unavailable).toEqual(['kb']);
});

it('uses only the live publisher’s report and rejects a follow wire to the other instance', () => {
  const instances = [wiredSource('copy', 'kc'), wiredSource('c', 'kc')];
  function Reporters() {
    const owner = useAnalysisSelectionOutput('kc', 'kc', { instanceId: 'c', available: ['C'] });
    const copy = useAnalysisSelectionOutput('kc', 'kc', { instanceId: 'copy', available: ['D'] });
    const live = useAnalysisSelectionInputs('ka', [followOtherKey]);
    const inactive = useAnalysisSelectionInputs('ka', [{ ...followOtherKey, from: 'copy.kc' }]);
    return <output data-testid="reports">{JSON.stringify([owner.availabilityCurrent, copy.availabilityCurrent,
      live.applied.length, live.unavailable, inactive.applied.length, inactive.unavailable])}</output>;
  }
  function Workspace() {
    const [publisher, setPublisher] = useState('c');
    return <>
      <button type="button" onClick={() => setPublisher('copy')}>Switch publisher</button>
      <AnalysisSelectionInstances instances={instances} publishers={new Map([['kc', publisher]])}>
        <Reporters />
      </AnalysisSelectionInstances>
    </>;
  }
  window.history.replaceState(null, '', '/mars/analysis?v=1&kb=B&kc=C');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={wiredRegistry}><Workspace /></PlatformProvider></I18nProvider>);

  expect(screen.getByTestId('reports').textContent).toBe(JSON.stringify([true, false, 2, [], 0, ['kb']]));
  fireEvent.click(screen.getByRole('button', { name: 'Switch publisher' }));
  expect(screen.getByTestId('reports').textContent).toBe(JSON.stringify([false, true, 0, ['kb'], 0, ['kb']]));

});

it('updates the applied source when rewiring an equal held value', () => {
  const instances = [wiredSource('b', 'kb'), wiredSource('c', 'kc')];
  const held = { kb: { dimension: 'equipment', selection: { shape: 'set', values: ['H'] } } } as const;
  const Wired = wiredWrapper(instances);
  const result = mount(() => {
    const [from, setSource] = useState('b.kb');
    return { setSource, input: useAnalysisSelectionInputs('ka', [
      { key: 'kb', from, mode: 'hold', use: 'filter', value: held.kb.selection },
    ]) };
  }, '', ({ children }) => <Wired><HeldAnalysisSelections held={held}>{children}</HeldAnalysisSelections></Wired>);
  expect(result.current.input.applied[0]?.source?.panelId).toBe('kb');
  act(() => result.current.setSource('c.kc'));
  expect(result.current.input.applied[0]?.source?.panelId).toBe('kc');
});

it.each(['rejected', 'rejectedHeld', 'unavailable'] as const)('reports a dual-use channel once in %s', kind => {
  const key = 'kb';
  const held: Record<string, HeldAnalysisSelection> = kind === 'rejectedHeld' ? { [key]: { dimension: 'stale', selection: a } } : {};
  const Wired = wiredWrapper();
  const query = kind === 'rejected' ? Array.from({ length: 51 }, (_, index) => `&kb=${index}`).join('') : '&kb=B';
  const result = mount(() => {
    useAnalysisSelectionOutput(key, key, { available: ['OTHER'] });
    return useAnalysisSelectionInputs('ka');
  }, query,
    ({ children }) => <Wired><HeldAnalysisSelections held={held}>{children}</HeldAnalysisSelections></Wired>);

  expect(result.current[kind]).toEqual([key]);
  expect(result.current.applied).toEqual([]);
});

it.each([
  ['&ka=A&kb=B&kc=C', [['kb', null], ['ka', 'kb'], ['kc', null]]],
  ['&ka=A&kc=C', [['kc', null], ['ka', 'kc']]],
] as const)('keeps declaration-only chip ordering for %s', (query, expected) => {
  const result = mount(useAnalysisSelectionChips, query, wiredWrapper());
  expect(result.current.chips.map(({ key, after }) => [key, after])).toEqual(expected);
});

describe('runtime chart instance channels (#3087 fix round 1)', () => {
  const chartConfig = (field: string) => ({ version: 1 as const, kind: 'bar' as const, x: { field, type: 'category' as const }, measures: [{ field: 'count' }] });
  const chartOne: PanelInstance = {
    id: 'chart-1',
    source: { kind: 'chart', config: chartConfig('equipment') },
    inputs: [],
    outputs: [{ key: 'selection', dimension: 'equipment', shape: 'set' }],
  };
  const chartTwo: PanelInstance = {
    id: 'chart-2',
    source: { kind: 'chart', config: chartConfig('recipe') },
    inputs: [],
    outputs: [{ key: 'selection', dimension: 'recipe', shape: 'set' }],
  };
  const chartRange: PanelInstance = {
    id: 'chart-range',
    source: { kind: 'chart', config: chartConfig('time') },
    inputs: [],
    outputs: [{ key: 'selection', dimension: 'time', shape: 'range' }],
  };

  it('keeps a new address chart key when an instance is removed in the same commit and across back/forward', async () => {
    let nav: ReturnType<typeof usePlatform>['navigate'];
    function Workspace() {
      const platform = usePlatform();
      nav = platform.navigate;
      const hasFirst = !platform.url.includes('drop=1');
      return <AnalysisSelectionInstances instances={hasFirst ? [chartOne, chartTwo] : [chartTwo]}>{null}</AnalysisSelectionInstances>;
    }
    window.history.replaceState(null, '', '/mars/analysis?v=1&chart-1.selection=A&chart-2.selection=B');
    render(<Wrapper><Workspace /></Wrapper>);

    act(() => { expect(nav('/mars/analysis?v=1&drop=1&chart-1.selection=C&chart-2.selection=B')).toBe(true); });
    expect(search().getAll('chart-1.selection')).toEqual(['C']);
    expect(search().getAll('chart-2.selection')).toEqual(['B']);

    window.history.back();
    await waitFor(() => expect(window.location.search).toBe('?v=1&chart-1.selection=A&chart-2.selection=B'));
    window.history.forward();
    await waitFor(() => expect(window.location.search).toBe('?v=1&drop=1&chart-1.selection=C&chart-2.selection=B'));
    expect(search().getAll('chart-1.selection')).toEqual(['C']);
  });

  it('treats a duplicate single-valued (range) runtime chart key as a rejected value rather than a contract error', () => {
    const readerInput: PanelInstanceInput = { key: rangeKey, from: 'chart-range.selection', mode: 'follow' };
    let sawContractError = false;
    let snapshot: {
      contractError: ReturnType<typeof useHostPlatform>['contractError'];
      setPage: ReturnType<typeof useHostPlatform>['setPage'];
      chips: ReturnType<typeof useAnalysisSelectionChips>['chips'];
      output: ReturnType<typeof useAnalysisSelectionOutput>;
      input: ReturnType<typeof useAnalysisSelectionInputs>;
    };
    function Outlet({ children }: { children: ReactNode }) {
      const { contractError } = useHostPlatform();
      if (contractError) sawContractError = true;
      return contractError ? <p role="alert">{contractError.code}</p> : <>{children}</>;
    }
    function Probe() {
      const { contractError, setPage } = useHostPlatform();
      const chips = useAnalysisSelectionChips().chips;
      const output = useAnalysisSelectionOutput('chart-range', 'selection', { instanceId: 'chart-range' });
      const input = useAnalysisSelectionInputs('receiver', [readerInput]);
      snapshot = { contractError, setPage, chips, output, input };
      return null;
    }
    window.history.replaceState(null, '', '/mars/analysis?v=1&chart-range.selection=14:00/16:00&chart-range.selection=17:00/18:00');
    render(<Wrapper><Outlet><AnalysisSelectionInstances instances={[chartRange]}><Probe /></AnalysisSelectionInstances></Outlet></Wrapper>);

    expect(sawContractError).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(snapshot!.contractError).toBeNull();
    expect(snapshot!.chips).toEqual([]);
    expect(snapshot!.output.selection).toBeNull();
    expect(snapshot!.input).toMatchObject({ applied: [], rejected: [rangeKey] });
    expect(() => snapshot!.setPage({ 'chart-range.selection': ['14:00/16:00', '17:00/18:00'] })).toThrow(RangeError);

    act(() => expect(snapshot!.output.select({ shape: 'range', from: '10:00', to: '12:00' })).toBe(true));
    expect(search().getAll('chart-range.selection')).toEqual(['10:00/12:00']);
    expect(snapshot!.output.selection).toEqual({ shape: 'range', from: '10:00', to: '12:00' });
  });

  it('highlights the source panel of a runtime chart instance while its chip is hovered', () => {
    let highlighted = false;
    let beginHover: ReturnType<typeof useAnalysisSelectionHoverTarget>;
    function Probe() {
      highlighted = useAnalysisSelectionSourceHighlighted('chart-1');
      beginHover = useAnalysisSelectionHoverTarget('chart-1.selection');
      return null;
    }
    window.history.replaceState(null, '', '/mars/analysis?v=1&chart-1.selection=A');
    render(<Wrapper><AnalysisSelectionInstances instances={[chartOne]}><Probe /></AnalysisSelectionInstances></Wrapper>);

    expect(highlighted).toBe(false);
    let release: (() => void) | undefined;
    act(() => { release = beginHover(); });
    expect(highlighted).toBe(true);
    act(() => { release?.(); });
    expect(highlighted).toBe(false);
  });
});
