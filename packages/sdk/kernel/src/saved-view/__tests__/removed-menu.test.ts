import { createElement } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildQuery, emptyGlobal, groupId, spaceId, type Result, type SavedView, type SavedViewEntry, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewSupport } from '../../index';
import { useSavedViews, type SavedViews } from '../../host';
import { createFakeSavedViewStore, noContext, testAdapter, testSavedView, testSession, testSpace, type FakeSavedViewStore } from '../../testing';

// #1702 (host-entry-contract §7): a saved view stored for a menu the registry no longer lists is never touched. Mounting the
// app, and saving or listing another menu's views, only ever reads and writes that other menu's rows: the absent menu's view
// stays in the store exactly as it was stored (deep-equal before and after), and no write reaches it.

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 1, contextKeys: ['time', 'line'], pageKeys: ['filter'] };
const base = { group: groupId('overview'), primary: true, icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, pageKeys: ['filter'], contextResetKeys: ['filter'], query: { mode: 'apply' as const } };
const menu = (id: string, path: string, savedView: boolean, primary = false) => ({ ...base, id, path, primary, features: { export: false, savedView, annotate: false, compare: false, board: false } });
// No menu `gone` exists anywhere in this registry.
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: base.label, icon: House, space: spaceId('mars') }], menus: [menu('home', '/', true, true), menu('plain', '/plain', false)] });
const period = { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' };
const query = (lineNames: string[]) => buildQuery({ ...emptyGlobal, ...period, lineNames }, []);

/** A menu-view of the removed menu, exactly as an earlier build saved it. */
const gone: SavedView = testSavedView({ id: 'gone-view', kind: 'menu-view', menuId: 'gone', name: 'Gone view', context: { ...period, lineNames: ['L1'] } });
/** This registry's own menu still has a view, so listing and saving have something real to do. */
const mine: SavedView = testSavedView({ id: 'home-view', kind: 'menu-view', menuId: 'home', name: 'Home view', context: { ...period, lineNames: ['L1'] } });
const session = testSession(['platform:view']);

/** The store's stored content (views and defaults), cloned so an in-place rewrite cannot hide behind object identity. */
type StoreContent = { rows: [string, SavedView][]; defaults: [string, string][] };
const content = (store: FakeSavedViewStore): StoreContent => ({
  rows: Array.from(store.rows.entries(), ([id, view]) => [id, structuredClone(view)] as [string, SavedView]),
  defaults: Array.from(store.defaults.entries()),
});

let views: SavedViews;
function Probe() { useSavedViewSupport(support); views = useSavedViews(); return createElement('p', null, views.status); }

beforeEach(() => window.sessionStorage.clear());
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('a saved view of a menu missing from the registry (#1702)', () => {
  it('is untouched after the app mounts and after another menu\'s views are saved and listed', async () => {
    const store = createFakeSavedViewStore([gone, mine]);
    const before = content(store);
    window.history.replaceState(null, '', `/${query(['L1'])}`);
    render(createElement(I18nProvider, null, createElement(PlatformProvider, { registry, adapter: testAdapter({ session: () => session }), savedViews: store, children: createElement(Probe) })));

    // Mounting listed this menu's views and the shared condition sets; the store was only read.
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => {});
    expect(content(store)).toEqual(before);
    expect(store.calls).toEqual([]);
    expect(views.menuViews.map(item => (item.denied ? item.id : item.view.id))).toEqual(['home-view']);

    let saved: Result<SavedViewEntry> | undefined;
    await act(async () => { saved = await views.saveAs({ name: '새 뷰', kind: 'menu-view' }); });
    expect(saved?.ok).toBe(true);
    await waitFor(() => expect(views.menuViews).toHaveLength(2));
    expect(store.rows.get('gone-view')).toEqual(before.rows.find(([id]) => id === 'gone-view')![1]);
    expect(store.calls).toEqual(['save']);
    expect(Array.from(store.defaults.entries())).toEqual(before.defaults);
  });
});
