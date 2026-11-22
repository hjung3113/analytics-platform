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
import userEvent from '@testing-library/user-event';

const columns = [{ id: 'a', header: 'A' }, { id: 'b', header: 'B' }];
const basis = columnGroupBasis(columns, undefined);
const groups: StoredColumnGroups = { basis, items: [{ id: 'u:known', label: 'Known', members: ['a', 'b'] }] };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('g'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('g'), primary: true, path: '/', icon: House, label: { ko: 'H', en: 'H' }, description: { ko: '', en: '' }, permission: 'platform:view', requiresScope: false, context: { ...noContext, time: 'apply' }, savedViews: 'screen', query: { mode: 'apply' }, pageType: 'analysis', pageKeys: [], features: { export: false, savedView: true, annotate: false, compare: false } }] });
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
  const store = await mount({ ...groups, items: [...groups.items, { id: 'u:hidden', label: 'Secret', members: ['hidden'] }] });
  await act(async () => { await views.select('v'); });
  expect(JSON.parse(localStorage.getItem(key)!).groups).toEqual(groups);
  expect(screen.getAllByRole('columnheader', { name: /Known/ }).length).toBeGreaterThan(0);
  expect(views.state.modified).toBe(false);
  const write = vi.spyOn(localStorage, 'setItem');
  await act(async () => { await views.select('v'); });
  expect(write).not.toHaveBeenCalled();
  expect(views.state.modified).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
  await userEvent.click(screen.getByRole('button', { name: '기본값으로' }));
  expect(views.state.modified).toBe(true);
  expect(await store.get('v')).toMatchObject({ view: { tables: { raw: { groups: { items: [...groups.items, { id: 'u:hidden', label: 'Secret', members: ['hidden'] }] } } } } });
});

it.each([{ delay: 'read', clear: false }, { delay: 'read', clear: true }, { delay: 'hash', clear: false }, { delay: 'hash', clear: true }])('holds groups until server $delay hydration (clear=$clear)', async ({ delay, clear }) => {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  const tableKey = `columns:h1_${[...new Uint8Array(await digest('SHA-256', new TextEncoder().encode('raw')))].map(b => b.toString(16).padStart(2, '0')).join('')}`;
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const seed = { sizing: { a: 177 }, visibility: { b: false }, order: ['b', 'a'], pinning: { left: ['a'], right: [] }, ...(clear && { groups }) };
  let values = { [tableKey]: seed };
  const answer = () => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-10-29T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });
  const patch = vi.fn(async (input: { set?: object }) => { values = { ...values, ...input.set }; return answer(); });
  if (delay === 'hash') vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args: Parameters<typeof digest>) => { await hold; return digest(...args); });
  const store = createFakeSavedViewStore([testSavedView({ id: 'v', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, context: {}, page: [], tables: { raw: clear ? {} : { groups } } })]);
  const adapter = testAdapter({ readPreferences: async () => { if (delay === 'read') await hold; return answer(); }, patchPreferences: patch });
  render(<I18nProvider><PlatformProvider serverPreferences registry={registry} adapter={adapter} savedViews={store}><Probe enabled /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('v'); });
  expect(patch).not.toHaveBeenCalled();
  await act(async () => { release(); });
  const { groups: _groups, ...rest } = seed;
  await waitFor(() => expect(values[tableKey]).toEqual(clear ? rest : { ...rest, groups }));
  await waitFor(() => expect(patch).toHaveBeenCalled());
  expect(views.state.modified).toBe(false);
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
