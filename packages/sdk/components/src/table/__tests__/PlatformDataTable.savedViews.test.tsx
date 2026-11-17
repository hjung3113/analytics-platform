import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { groupId, spaceId, type StoredColumnGroups } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useSavedViewSupport } from '@ap/kernel';
import { useSavedViews, type SavedViews } from '@ap/kernel/host';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSavedView, testSpace } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable } from '../PlatformDataTable';
import { columnGroupBasis } from '../columnGroups';

const columns = [{ id: 'a', header: 'A' }, { id: 'b', header: 'B' }];
const basis = columnGroupBasis(columns, undefined);
const groups: StoredColumnGroups = { basis, items: [{ id: 'u:known', label: 'Known', members: ['a', 'b'] }] };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('g'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('g'), primary: true, path: '/', icon: House, label: { ko: 'H', en: 'H' }, description: { ko: '', en: '' }, permission: 'platform:view', requiresScope: false, context: { ...noContext, time: 'apply' }, query: { mode: 'apply' }, pageType: 'analysis', pageKeys: [], features: { export: false, savedView: true, annotate: false, compare: false } }] });
const key = 'platform:columns:v1:u1:raw';
const support = { menuId: 'home', menuSchemaVersion: 1, contextKeys: [], pageKeys: [] };
let views: SavedViews; let restore: () => void;
function Probe({ enabled }: { enabled: boolean }) {
  useSavedViewSupport(support);
  views = useSavedViews();
  return <PlatformDataTable editableColumnGroups={enabled} title="T" ariaLabel="raw" columns={columns} rows={[{ id: 'r' }]} getRowId={r => r.id} preferenceKey="raw" height={300} rowAction={() => <button>ready</button>} />;
}
async function mount(saved: StoredColumnGroups | undefined, enabled = true) {
  const row = testSavedView({ id: 'v', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, context: {}, page: [], chartOptions: {}, layout: null, panels: null, tables: { raw: saved ? { groups: saved } : {} } });
  const store = createFakeSavedViewStore([row]);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter()} savedViews={store}><Probe enabled={enabled} /></PlatformProvider></I18nProvider>);
  await screen.findByRole('button', { name: 'ready' });
  await waitFor(() => expect(views.status).toBe('ready'));
  return store;
}
beforeEach(() => { window.history.replaceState(null, '', '/'); restore = stubCompactTableGeometry(1100); vi.stubGlobal('localStorage', memoryStorage()); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('registers an editable table, writes only known groups, and equal effective values do not write', async () => {
  await mount({ ...groups, items: [...groups.items, { id: 'u:hidden', label: 'Secret', members: ['hidden'] }] });
  await act(async () => { await views.select('v'); });
  expect(JSON.parse(localStorage.getItem(key)!).groups).toEqual(groups);
  expect(screen.getAllByRole('columnheader', { name: /Known/ }).length).toBeGreaterThan(0);
  const write = vi.spyOn(localStorage, 'setItem');
  await act(async () => { await views.select('v'); });
  expect(write).not.toHaveBeenCalled();
});
it('explicit {} clears groups and preserves unrelated preferences', async () => {
  localStorage.setItem(key, JSON.stringify({ groups, sizing: { a: 123 }, order: ['b', 'a'], visibility: {}, pinning: { left: [], right: [] } }));
  await mount(undefined);
  await act(async () => { await views.select('v'); });
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ sizing: { a: 123 }, order: ['b', 'a'], visibility: {}, pinning: { left: [], right: [] } });
});
it('ignores an incompatible basis for applying and modified comparison', async () => {
  await mount({ basis: 'old', items: groups.items });
  const write = vi.spyOn(localStorage, 'setItem');
  await act(async () => { await views.select('v'); });
  expect(write).not.toHaveBeenCalled(); expect(views.state.modified).toBe(false);
});
it('does not register when editableColumnGroups is off', async () => {
  await mount(groups, false);
  const write = vi.spyOn(localStorage, 'setItem');
  await act(async () => { await views.select('v'); });
  expect(write).not.toHaveBeenCalled(); expect(views.state.modified).toBe(false);
  await act(async () => {
    expect(await views.saveAs({ kind: 'menu-view', name: 'off' })).toMatchObject({ ok: true, value: { view: { tables: { raw: { groups } } } } });
  });
});
