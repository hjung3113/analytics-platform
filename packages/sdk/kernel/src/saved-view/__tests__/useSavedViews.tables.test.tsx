import { useState } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { groupId, spaceId, type MenuViewDraft, type SavedViewSupport, type TableViewState } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, useSavedViewSupport, useUnsavedGuard } from '../../index';
import { PaneScreenProvider, useLeaveRequest, useSavedViewTableState, useSavedViews, type LeaveRequest, type SavedViews } from '../../host';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSpace } from '../../testing';

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: [], pageKeys: ['filter'] };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('g'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('g'), primary: true, path: '/', icon: House, label: { ko: 'H', en: 'H' }, description: { ko: '', en: '' }, permission: 'platform:view', requiresScope: false, context: { ...noContext, time: 'apply' }, query: { mode: 'apply' }, pageType: 'analysis', pageKeys: ['filter'], features: { export: false, savedView: true, annotate: false, compare: false, board: true } }] });
const grouped: TableViewState = { groups: { basis: '[]', items: [{ id: 'u:a', label: 'A', members: ['a'] }] } };
const row = (id: string, extra: Partial<MenuViewDraft> = {}) => testSavedView({ id, kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, context: {}, page: [], chartOptions: {}, layout: null, panels: null, ...extra });
let views: SavedViews; let setValue: (value: TableViewState) => void;
let setMounted: (on: boolean) => void; let setDirty: (on: boolean) => void; let request: LeaveRequest | null;
const applied = vi.fn(); const paneApplied = vi.fn();
function Table({ value }: { value: TableViewState }) { useSavedViewTableState('raw', { value, basis: '[]', apply: next => { applied(next); setValue(next); } }); return null; }
function PaneTable() { useSavedViewTableState('raw', { value: { groups: { basis: 'pane', items: [] } }, apply: paneApplied }); return null; }
function Probe() {
  const [value, update] = useState(grouped); setValue = update;
  const [mounted, mount] = useState(true); setMounted = mount;
  const [dirty, updateDirty] = useState(false); setDirty = updateDirty; useUnsavedGuard(dirty, { leaves: 'address' });
  useSavedViewSupport(support); views = useSavedViews(); request = useLeaveRequest();
  return <>{mounted && <Table value={value} />}<PaneScreenProvider paneId="board.1" screen={{ menuId: 'home', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}><PaneTable /></PaneScreenProvider></>;
}
async function mount(rows = [row('old'), row('clear', { tables: { raw: {} } }), row('group', { tables: { raw: grouped, hidden: {} } })], defaults?: Record<string, string>, url = '/') {
  window.history.replaceState(null, '', url);
  const store = createFakeSavedViewStore(rows, defaults);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter()} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.status).toBe('ready'));
  return store;
}
beforeEach(() => { window.sessionStorage.clear(); applied.mockClear(); paneApplied.mockClear(); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
it('collects every main-screen table, excludes the pane, and preserves hidden entries on both save paths', async () => {
  const store = await mount();
  await act(async () => { await views.select('group'); });
  expect(applied).toHaveBeenCalledWith(grouped); expect(paneApplied).not.toHaveBeenCalled();
  act(() => setValue({})); expect(views.state.modified).toBe(true);
  await act(async () => { await views.saveToSelected(); });
  expect(await store.get('group')).toMatchObject({ view: { tables: { raw: {}, hidden: {} } } });
  expect(views.state.modified).toBe(false);
  await act(async () => { expect(await views.saveAs({ kind: 'menu-view', name: 'Copy' })).toMatchObject({ ok: true, value: { view: { tables: { raw: {}, hidden: {} } } } }); });
});
it('old views leave groups untouched and unmodified; explicit {} clears; remount does not replay', async () => {
  await mount();
  await act(async () => { await views.select('old'); });
  expect(applied).not.toHaveBeenCalled(); expect(views.state.modified).toBe(false);
  await act(async () => { await views.select('clear'); });
  expect(applied).toHaveBeenCalledExactlyOnceWith({});
  act(() => setValue(grouped)); expect(views.state.modified).toBe(true);
  act(() => setMounted(false)); act(() => setMounted(true));
  expect(applied).toHaveBeenCalledOnce(); expect(views.state.modified).toBe(true);
});
it('applies a late table once and retires pending entries on clearSelection', async () => {
  await mount(); act(() => setMounted(false));
  await act(async () => { await views.select('clear'); });
  expect(applied).not.toHaveBeenCalled();
  act(() => setMounted(true)); expect(applied).toHaveBeenCalledOnce();
  act(() => setMounted(false));
  await act(async () => { await views.select('group'); });
  act(() => views.clearSelection()); act(() => setMounted(true));
  expect(applied).toHaveBeenCalledOnce();
});
it('does not apply or compare a mismatched basis', async () => {
  await mount([row('stale', { tables: { raw: { groups: { basis: 'stale', items: [] } } } })]);
  await act(async () => { await views.select('stale'); });
  expect(applied).not.toHaveBeenCalled(); expect(views.state.modified).toBe(false);
});
it.each(['cancel', 'confirm'] as const)('a held navigation writes only on confirm: %s', async decision => {
  await mount([row('move', { page: [['filter', 'x']], tables: { raw: {} } })]);
  act(() => setDirty(true));
  await act(async () => { expect(await views.select('move')).toEqual({ ok: false, reason: 'held' }); });
  expect(applied).not.toHaveBeenCalled();
  act(() => request![decision]());
  if (decision === 'confirm') await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  else expect(applied).not.toHaveBeenCalled();
});
it('a default yielding to an explicit address never writes tables', async () => {
  await mount([row('default', { tables: { raw: {} } })], { 'u1:home': 'default' }, '/?filter=explicit');
  await act(async () => {}); expect(applied).not.toHaveBeenCalled();
});

it.each([false, true])('retries a page-dependent basis after navigation (remount=%s)', async remount => {
  function DestinationTable({ basis }: { basis: string }) {
    const [value, update] = useState<TableViewState>({});
    useSavedViewTableState('raw', { value, basis, apply: next => { applied(next); update(next); } });
    return null;
  }
  function Destination() {
    const host = usePlatform();
    useSavedViewSupport(support); views = useSavedViews();
    const basis = host.page.some(([key, value]) => key === 'filter' && value === 'B') ? 'B' : 'A';
    return <DestinationTable key={remount ? basis : 'stable'} basis={basis} />;
  }
  const next = { groups: { basis: 'B', items: [] } };
  const store = createFakeSavedViewStore([row('move', { page: [['filter', 'B']], tables: { raw: next } })]);
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter()} savedViews={store}><Destination /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('move'); });
  await waitFor(() => expect(applied).toHaveBeenCalledExactlyOnceWith(next));
  expect(views.state.modified).toBe(false);
});
