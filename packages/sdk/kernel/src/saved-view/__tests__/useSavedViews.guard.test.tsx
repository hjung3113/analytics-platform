import { useState } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { groupId, spaceId, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewSupport, useUnsavedGuard } from '../../index';
import { useHostPlatform, useLeaveRequest, useSavedViews, type SavedViews, type LeaveRequest } from '../../host';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSession, testSpace } from '../../testing';

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: [], pageKeys: ['filter'] };
const base = { group: groupId('g'), icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, query: { mode: 'apply' as const }, pageType: 'analysis' as const, pageKeys: ['filter'], features: { export: false, savedView: true, annotate: false, compare: false } };
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('g'), label: base.label, icon: House, space: spaceId('mars') }], menus: [{ ...base, id: 'home', path: '/', primary: true }, { ...base, id: 'other', path: '/other' }] });
const row = (id: string) => testSavedView({ id, name: id, kind: 'menu-view', menuId: 'home', menuSchemaVersion: 1, context: {}, page: [['filter', id]], chartOptions: {}, layout: null, panels: null } as never);
let views: SavedViews;
let host: ReturnType<typeof useHostPlatform>;
let request: LeaveRequest | null;
let dirty: (value: boolean) => void;
function Probe() {
  const [on, setOn] = useState(false); dirty = setOn;
  useSavedViewSupport(support); useUnsavedGuard(on, { leaves: 'address' });
  views = useSavedViews(); host = useHostPlatform(); request = useLeaveRequest();
  return null;
}
async function mount() {
  window.sessionStorage.clear(); window.history.replaceState(null, '', '/');
  const listeners = new Set<() => void>();
  let session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} savedViews={createFakeSavedViewStore([row('a'), row('b'), row('c')])}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('a'); });
  act(() => dirty(true));
  return { revise: (account = false) => { if (account) session = testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } }); listeners.forEach(l => l()); } };
}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
it.each(['confirm', 'cancel'] as const)('KER-18 holds selection silently and handles %s', async action => {
  await mount();
  let outcome: unknown;
  await act(async () => { outcome = await views.select('b'); });
  expect(outcome).toEqual({ ok: false, reason: 'held' });
  expect(views.selected?.view.id).toBe('a');
  expect(window.location.search).toBe('?v=1&filter=a');
  expect(request).not.toBeNull();
  act(() => request![action]());
  await waitFor(() => expect(views.selected?.view.id).toBe(action === 'confirm' ? 'b' : 'a'));
  expect(window.location.search).toBe(action === 'confirm' ? '?v=1&filter=b' : '?v=1&filter=a');
});
it.each(['revision', 'account', 'menu', 'newer'] as const)('KER-18 invalidates held selection after %s', async change => {
  const f = await mount();
  await act(async () => { await views.select('b'); });
  const original = request!;
  if (change === 'revision' || change === 'account') act(() => f.revise(change === 'account'));
  if (change === 'menu') act(() => { host.navigate('/other', { replace: true }); });
  if (change === 'newer') await act(async () => { await views.select('c'); });
  act(() => original.confirm());
  await act(async () => {});
  expect(window.sessionStorage.getItem('platform:saved-view:selected:u1:home')).toBe('a');
  expect(views.selected?.view.id).not.toBe('b');
  if (change === 'newer') { act(() => request!.confirm()); await waitFor(() => expect(views.selected?.view.id).toBe('c')); }
});
it('KER-18 a newer pick after cancellation can confirm independently', async () => {
  await mount();
  await act(async () => { await views.select('b'); });
  act(() => request!.cancel());
  await act(async () => { await views.select('c'); });
  act(() => request!.confirm());
  await waitFor(() => expect(views.selected?.view.id).toBe('c'));
});

it('KER-18 a superseded pending read returns silent cancelled without clearing the newer pick', async () => {
  await mount();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const store = host.savedViewStore!;
  const get = store.get.bind(store);
  store.get = async id => { if (id === 'b') await gate; return get(id); };
  let pending!: ReturnType<SavedViews['select']>;
  act(() => { pending = views.select('b'); });
  await act(async () => { await views.select('a'); });
  let outcome: unknown;
  await act(async () => { release(); outcome = await pending; });
  expect(outcome).toEqual({ ok: false, reason: 'cancelled' });
  expect(views.selected?.view.id).toBe('a');
});
