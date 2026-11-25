import { useState } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { followHeldSets, groupId, spaceId, type MenuView, type MenuViewPanels, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewPanels, useSavedViewSupport } from '../../index';
import { useSavedViews, type SavedViews } from '../../host';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSpace } from '../../testing';

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: [], pageKeys: [] };
const makeRegistry = (autoApplyDefault: boolean) => createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('g'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'home', group: groupId('g'), primary: true, path: '/', icon: House,
    label: { ko: 'H', en: 'H' }, description: { ko: '', en: '' }, permission: 'platform:view',
    requiresScope: false, context: { ...noContext, time: 'apply' }, savedViews: 'screen',
    query: { mode: 'apply', ...(autoApplyDefault ? { autoApplyDefault } : {}) }, pageType: 'analysis', pageKeys: [],
    features: { export: false, savedView: true, annotate: false, compare: false, board: false },
  }],
});
const registry = makeRegistry(false);
const panels: MenuViewPanels = {
  version: 1,
  instances: [
    { id: 'trend', source: { kind: 'declared', panel: 'trend' }, inputs: [], outputs: [{ key: 'room', dimension: 'room', shape: 'set' }] },
    { id: 'distribution', source: { kind: 'declared', panel: 'distribution' }, inputs: [{ key: 'room', from: 'trend.room', mode: 'follow' }], outputs: [] },
  ],
};
const row = (over: Partial<MenuView> = {}) => testSavedView({
  id: 'saved', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1,
  context: {}, page: [], chartOptions: {}, layout: null, panels, ...over,
});
let views: SavedViews;
let setPanels: (value: MenuViewPanels | null) => void;
let setMounted: (value: boolean) => void;
const opened = vi.fn();

function PanelSlot() {
  const [value, update] = useState<MenuViewPanels | null>(null);
  setPanels = update;
  useSavedViewPanels({
    value,
    onOpen: outcome => {
      opened(outcome);
      if (outcome !== 'unreadable') update(outcome);
    },
  });
  return null;
}

async function mount({ saved = row(), registrations = 1, store = createFakeSavedViewStore([saved]), declared = support, menus = registry } = {}) {
  function Probe() {
    const [mounted, show] = useState(true);
    setMounted = show;
    useSavedViewSupport(declared);
    views = useSavedViews();
    return <>{mounted && Array.from({ length: registrations }, (_, index) => <PanelSlot key={index} />)}</>;
  }
  render(<I18nProvider><PlatformProvider registry={menus} adapter={testAdapter()} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.status).toBe('ready'));
  return store;
}

beforeEach(() => { window.sessionStorage.clear(); opened.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

it('captures registered panels when saving a new menu view', async () => {
  await mount();
  act(() => setPanels(panels));
  await act(async () => {
    expect(await views.saveAs({ name: 'copy', kind: 'menu-view' })).toMatchObject({ ok: true, value: { view: { panels } } });
  });
});

it.each([panels, null])('captures registered panels when overwriting a menu view (%j)', async next => {
  const store = await mount({ saved: row({ panels: next === null ? panels : null }) });
  await act(async () => { await views.select('saved'); });
  act(() => setPanels(next));
  await act(async () => { await views.saveToSelected(); });
  expect(await store.get('saved')).toMatchObject({ view: { panels: next } });
});

it.each([panels, null])('delivers the opened menu view panels to its screen (%j)', async savedPanels => {
  await mount({ saved: row({ panels: savedPanels }) });
  act(() => setMounted(false));
  await act(async () => { await views.select('saved'); });
  expect(opened).not.toHaveBeenCalled();
  act(() => setMounted(true));
  expect(opened).toHaveBeenCalledExactlyOnceWith(savedPanels);
});

it('restores the selected view panels after a reload and overwrite keeps them', async () => {
  const store = await mount();
  await act(async () => { await views.select('saved'); });
  cleanup();
  opened.mockClear();
  await mount({ store });
  await waitFor(() => expect(views.selected?.view.id).toBe('saved'));
  expect(opened).toHaveBeenCalledExactlyOnceWith(panels);
  expect(views.state.modified).toBe(false);
  await act(async () => { await views.saveToSelected(); });
  expect(await store.get('saved')).toMatchObject({ view: { panels } });
});

it('does not restore panels of a kept selection the menu schema no longer opens', async () => {
  const store = await mount();
  await act(async () => { await views.select('saved'); });
  cleanup();
  opened.mockClear();
  await mount({ store, declared: { ...support, menuSchemaVersion: 2 } });
  await act(async () => {});
  expect(opened).not.toHaveBeenCalled();
});

it('delivers a reloaded personal default view once while its default lookup is still pending', async () => {
  const menus = makeRegistry(true);
  const store = createFakeSavedViewStore([row()], { 'u1:home': 'saved' });
  await mount({ store, menus });
  await waitFor(() => expect(opened).toHaveBeenCalledOnce());
  cleanup();
  opened.mockClear();
  let release!: () => void;
  store.getHold.set('saved', new Promise<void>(resolve => { release = resolve; }));
  await mount({ store, menus });
  await act(async () => { release(); await Promise.resolve(); });
  await waitFor(() => expect(views.selected?.view.id).toBe('saved'));
  await act(async () => {});
  expect(opened).toHaveBeenCalledExactlyOnceWith(panels);
});

it('reports unreadable panels and keeps the current panels available to save', async () => {
  await mount({ saved: row({ panels: null, panelsUnreadable: true }) });
  act(() => setPanels(panels));
  await act(async () => { await views.select('saved'); });
  expect(opened).toHaveBeenCalledExactlyOnceWith('unreadable');
  expect(views.state.modified).toBe(true);
  await act(async () => {
    expect(await views.saveAs({ name: 'copy', kind: 'menu-view' })).toMatchObject({ ok: true, value: { view: { panels } } });
  });
});

it('marks a differing registered value modified and clears the flag on a structural match', async () => {
  await mount();
  await act(async () => { await views.select('saved'); });
  expect(views.state.modified).toBe(false);
  act(() => setPanels(null));
  expect(views.state.modified).toBe(true);
  act(() => setPanels(structuredClone(panels)));
  expect(views.state.modified).toBe(false);
});

it('keeps the existing draft and overwrite payload with no panels registration', async () => {
  const store = await mount({ registrations: 0 });
  const update = vi.spyOn(store, 'update');
  await act(async () => { await views.select('saved'); });
  await act(async () => {
    expect(await views.saveToSelected()).toMatchObject({ ok: true });
    expect(await views.saveAs({ name: 'copy', kind: 'menu-view' })).toMatchObject({ ok: true, value: { view: { panels: null } } });
    expect(await views.saveAs({ name: 'explicit', kind: 'menu-view', panels })).toMatchObject({ ok: true, value: { view: { panels } } });
  });
  expect(update.mock.calls[0]?.[1]).not.toHaveProperty('panels');
});

it('warns about a second registration without blocking the screen', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await mount({ registrations: 2 });
  expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('panels'));
});

// #2862 (owner 2026-11-25): in another Scope a held set does not apply and follows instead; a held absolute range stays.
const held: MenuViewPanels = {
  version: 1,
  instances: [
    { id: 'trend', source: { kind: 'declared', panel: 'trend' }, inputs: [], outputs: [{ key: 'room', dimension: 'room', shape: 'set' }, { key: 'span', dimension: 'time', shape: 'range' }] },
    { id: 'distribution', source: { kind: 'declared', panel: 'distribution' }, inputs: [
      { key: 'room', from: 'trend.room', mode: 'hold', value: { shape: 'set', values: ['R1'] } },
      { key: 'span', from: 'trend.span', mode: 'hold', value: { shape: 'range', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' } },
    ], outputs: [] },
  ],
};
const followed: MenuViewPanels = { ...held, instances: [held.instances[0]!, { ...held.instances[1]!, inputs: [{ key: 'room', from: 'trend.room', mode: 'follow' }, held.instances[1]!.inputs[1]!] }] };

it('opens held sets of a view saved in another Scope as following, and lists them with the Site-bound keys (#2862)', async () => {
  await mount({ saved: row({ panels: held, savedScopeId: 'OTHER' }) });
  let excluded: readonly string[] | undefined;
  await act(async () => { const outcome = await views.select('saved'); excluded = outcome.ok ? outcome.excludedByScope : undefined; });
  expect(opened).toHaveBeenCalledExactlyOnceWith(followed);
  expect(excluded).toEqual(['room']);
  expect(views.scopeExcluded).toEqual({ savedScopeId: 'OTHER', keys: ['room'], panelKeys: ['room'] });
  expect(views.crossScopeSave?.keys).toEqual(['room']);
  // What the screen opened is the saved view as it applies here: not modified.
  expect(views.state.modified).toBe(false);
});

it('keeps held sets of a view saved in the current Scope (#2862)', async () => {
  await mount({ saved: row({ panels: held }) });
  await act(async () => { await views.select('saved'); });
  expect(opened).toHaveBeenCalledExactlyOnceWith(held);
  expect(views.scopeExcluded).toBeNull();
  expect(views.state.modified).toBe(false);
});

it('followHeldSets returns panels with no held set unchanged (#2862)', () => {
  expect(followHeldSets(panels)).toEqual({ panels, keys: [] });
  expect(followHeldSets(panels).panels).toBe(panels);
  expect(followHeldSets(held)).toEqual({ panels: followed, keys: ['room'] });
});
