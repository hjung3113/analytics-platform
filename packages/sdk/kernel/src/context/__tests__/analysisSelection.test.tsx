import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { emptyGlobal, groupId, NO_FEATURES, spaceId, type AnalysisSelection, type PanelDeclaration } from '@ap/contracts';
import { House } from 'lucide-react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { analysisSelectionParam, parseAnalysisSelection, useAnalysisSelectionInputs, useAnalysisSelectionOutput, usePlatform } from '../../index';
import { I18nProvider } from '../../i18n';
import { LentPanelPlatformContext } from '../../platform/contexts';
import { lentPanelPlatform } from '../../platform/lent-panel-platform';
import { PlatformProvider, useHostPlatform } from '../../platform/platform';
import { queryMissingRequired } from '../../query/draft-state';
import { projectDisplayInputs, projectQueryInputs } from '../../registry/panel-inputs';
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

it('pushes both writes when the selection returns to its rendered value in one event', async () => {
  // Start at the history tip so the first push does not replace another test's forward entries.
  window.history.pushState(null, '', window.location.href);
  const result = mount(() => useAnalysisSelectionOutput('source', setKey), '&equipmentSet=A');
  const start = window.history.length;
  act(() => {
    result.current.select(set);
    result.current.select({ shape: 'set', values: ['A'] });
  });
  expect(search().getAll(setKey)).toEqual(['A']);
  expect(window.history.length).toBe(start + 2);
  window.history.back();
  await waitFor(() => expect(result.current.selection).toEqual(set));
});

it('applies selections from either agreeing writer with the first declared source', () => {
  const result = mount(() => ({
    first: useAnalysisSelectionOutput('source', setKey),
    second: useAnalysisSelectionOutput('alternate', setKey),
    reader: useAnalysisSelectionInputs('receiver'),
  }));
  act(() => expect(result.current.first.select(set)).toBe(true));
  expect(result.current.reader.applied).toMatchObject([{ selection: set, source: { panelId: 'source', dimension: 'equipment' } }]);
  const next = { shape: 'set', values: ['C'] } as const;
  act(() => expect(result.current.second.select(next)).toBe(true));
  expect(result.current.reader.applied).toMatchObject([{ selection: next, source: { panelId: 'source', dimension: 'equipment' } }]);
});

const invalidEntries = [
  [rangeKey, ['a/b/c']],
  [setKey, Array.from({ length: 51 }, (_, i) => String(i))],
] as const;
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

it('keeps the generic route error for a duplicate range key', () => {
  const { current } = mount(useHostPlatform, '&timeRange=a%2Fb&timeRange=c%2Fd');
  expect(current.contractError).toMatchObject({ code: 'duplicate_page_key' });
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
  expect(receiver).toEqual({ filtered: true, rejected: [], applied: [
    { key: setKey, use: 'filter', selection: set, source: { panelId: 'source', title, dimension: 'equipment' } },
    { key: rangeKey, use: 'highlight', selection: range, source: { panelId: 'source', title, dimension: 'time' } },
  ] });
  expect(result.current.plain).toEqual({ applied: [], filtered: false, rejected: [] });
  act(() => result.current.platform.setPage({ sort: 'name', [setKey]: ['B', 'A', 'B'] }));
  expect(result.current.receiver).toBe(receiver);
  act(() => result.current.platform.setPage({ [setKey]: null }));
  expect(result.current.receiver).toEqual({ filtered: false, applied: [receiver.applied[1]], rejected: [] });
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
  expect(result.current.inputs).toEqual({ applied: [], filtered: false, rejected: [] });
  expect(search().getAll(setKey)).toEqual(['B']);
});
