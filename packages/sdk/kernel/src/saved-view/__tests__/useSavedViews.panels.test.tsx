import { useState } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { groupId, spaceId, type MenuView, type MenuViewPanels, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewPanels, useSavedViewSupport } from '../../index';
import { useSavedViews, type SavedViews } from '../../host';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSpace } from '../../testing';

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: [], pageKeys: [] };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('g'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'home', group: groupId('g'), primary: true, path: '/', icon: House,
    label: { ko: 'H', en: 'H' }, description: { ko: '', en: '' }, permission: 'platform:view',
    requiresScope: false, context: { ...noContext, time: 'apply' }, savedViews: 'screen',
    query: { mode: 'apply' }, pageType: 'analysis', pageKeys: [],
    features: { export: false, savedView: true, annotate: false, compare: false, board: false },
  }],
});
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

async function mount({ saved = row(), registrations = 1 } = {}) {
  function Probe() {
    const [mounted, show] = useState(true);
    setMounted = show;
    useSavedViewSupport(support);
    views = useSavedViews();
    return <>{mounted && Array.from({ length: registrations }, (_, index) => <PanelSlot key={index} />)}</>;
  }
  const store = createFakeSavedViewStore([saved]);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter()} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
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
