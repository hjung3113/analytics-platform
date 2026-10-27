import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { groupId, spaceId, type SavedViewDraft, type SavedViewSupport } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, useSavedViewSupport } from '@ap/kernel';
import { useHostPlatform, useSavedViews, type SavedViews } from '@ap/kernel/host';
import { memoryStorage, noContext, testSpace } from '@ap/kernel/testing';
import { createAssembly, type Assembly } from '#platform-assembly';
import { registry as appRegistry } from './menus';
import { createLocalSavedViewStore } from './saved-view-store';

// The store must agree with the id the Kernel really passes (`session.user.id`), not with a test-made id (#1011c review C1).
const support: SavedViewSupport = { menuId: 'productivity-overview', menuSchemaVersion: 2, contextKeys: ['time'], pageKeys: [] };
const base = { group: groupId('overview'), icon: House, label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, pageKeys: [], contextResetKeys: [], query: { mode: 'apply' as const } };
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'productivity-overview' })], groups: [{ id: groupId('overview'), label: base.label, icon: House, space: spaceId('mars') }], menus: [{ ...base, id: 'productivity-overview', path: '/', primary: true, features: { export: false, savedView: true, annotate: false, compare: false, board: false } }] });

let views: SavedViews; let userId = '';
function Probe() { useSavedViewSupport(support); views = useSavedViews(); userId = useHostPlatform().user.id; return null; }
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

// The permission vocabulary is the real session's: every mock role holds `platform:view`; the engineer default lacks `console:access`.
const PERMS: Record<string, string> = { 'productivity-overview': 'platform:view', 'admin-only': 'console:access' };
async function mount() {
  const assembly = await createAssembly({ registry: appRegistry }) as Assembly;
  expect(assembly).toHaveProperty('savedViews');
  const storage = memoryStorage();
  const store = createLocalSavedViewStore({ getStorage: () => storage, locks: { request: async (_n, cb) => cb() }, now: () => 5, menuPermissionOf: id => PERMS[id], sessionPermissions: () => assembly.adapter.session().user.permissions });
  window.history.replaceState(null, '', '/');
  render(<I18nProvider><PlatformProvider registry={registry} adapter={assembly.adapter} savedViews={store}><Probe /></PlatformProvider></I18nProvider>);
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });
  return { store };
}
const draft = (menuId: string) => ({ schemaVersion: 1, kind: 'menu-view', name: 'x', menuId, menuSchemaVersion: 2, context: { relativePeriod: { hours: 24 } }, page: {}, chartOptions: {}, layout: null, panels: null }) as SavedViewDraft;
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 100)); });

it('lists the seeded views of a menu the real session may open and round-trips the personal default through the hook', async () => {
  await mount();
  expect(['engineer', 'admin', 'viewer']).toContain(userId);
  const mine = views.menuViews.find(i => !i.denied && i.view.name === '내 야간 점검');
  expect(mine).toBeDefined();
  const id = mine && !mine.denied ? mine.view.id : '';
  expect(views.defaultId).toBeNull();
  await act(async () => { expect((await views.setDefault(id)).ok).toBe(true); });
  await settle();
  expect(views.defaultId).toBe(id);
  await act(async () => { expect((await views.setDefault(null)).ok).toBe(true); });
  await settle();
  expect(views.defaultId).toBeNull();
});

it('saves for a registry menu the session holds and refuses one it lacks or that is not registered', async () => {
  const { store } = await mount();
  expect(await store.save(draft('productivity-overview'))).toMatchObject({ ok: true });
  expect(await store.save(draft('admin-only'))).toMatchObject({ ok: false, reason: 'forbidden' });
  expect(await store.save(draft('no-such-menu'))).toMatchObject({ ok: false, reason: 'invalid' });
});
