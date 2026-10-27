// @vitest-environment jsdom
import { Suspense } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { useHostPlatform, useSavedViews, type SavedViews } from '@ap/kernel/host';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, menuPermission, parseQuery, spaceId, type ApiResponse, type SavedView, type SavedViewDraft, type SavedViewEntry, type SavedViewStore } from '@ap/contracts';
import { manifests } from '@ap/menu-analytics';
import { EQUIPMENT_AXES } from './equipmentAxes';

// The app assembles the menu; the page registers its real `useSavedViewSupport` declaration; the kernel host hook captures from and restores into it.
// A declaration that forgot a key, or a key the page does not carry, shows up here as a value that does not come back.
const CycleTimeDrilldown = manifests.find(m => m.id === 'cycle-time')!.component!;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter = testAdapter({ session: () => session, menuQuery: async () => empty, saveAnnotation: async () => empty, usageSummary: async () => empty, auditTrail: async () => empty, entityAudit: async () => empty, accessDirectory: async () => empty });

const ALL = { canView: true, canCopy: true, canEdit: true, canShare: true, canApprove: false, canRevoke: false };
/** Holds saved views in memory; only the calls `useSavedViews` makes are real. */
function memoryViews() {
  const rows = new Map<string, SavedView>();
  const entry = (view: SavedView): SavedViewEntry => ({ view, capabilities: ALL });
  const store = {
    list: async () => [...rows.values()].map(entry),
    get: async (id: string) => { const view = rows.get(id); return view ? entry(view) : null; },
    getDefaultId: async () => null,
    save: async (draft: SavedViewDraft) => { const view = { ...draft, id: `v${rows.size + 1}`, ownerId: 'analyst-a', version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none' } as SavedView; rows.set(view.id, view); return { ok: true as const, value: entry(view) }; },
  } as unknown as SavedViewStore;
  return { rows, store };
}

const URL_WITH_EVERYTHING = '/analytics/cycle-time?v=1&scopeId=MEM&roomNames=PHOTO&roomNames=ETCH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&lineNames=L1&prcGroups=G1&equipmentGroup=%7B%22maker%22%3A%5B%22TEL%22%5D%2C%22model%22%3A%5B%22M1%22%5D%7D&selectedEquipmentIds=EQ-1&granularity=day&percentile=p50&sort=delta:desc&bin=2';
const BARE = '/analytics/cycle-time?v=1&scopeId=MEM';

let views: SavedViews;
let host: ReturnType<typeof useHostPlatform>;
function Probe() { views = useSavedViews(); host = useHostPlatform(); return null; }
function mount(path: string, savedViews: SavedViewStore) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider equipmentAxes={EQUIPMENT_AXES} adapter={adapter} registry={registry} savedViews={savedViews}><Probe /><Suspense fallback={null}><CycleTimeDrilldown params={{}} /></Suspense></PlatformProvider></I18nProvider>);
}
const queryOf = (path: string) => [...new URLSearchParams(path.split('?')[1] ?? '').entries()].sort(([a, x], [b, y]) => (a + x < b + y ? -1 : 1)).map(pair => pair.join('=')).join('&');

describe('CycleTimeDrilldown saved view declaration (06 §21)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); window.sessionStorage.clear(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

  it('captures every declared condition from the address and restores the same address from the saved view', async () => {
    const { rows, store } = memoryViews();
    mount(URL_WITH_EVERYTHING, store);
    await waitFor(() => expect(views.status).toBe('ready'), { timeout: 8000 });
    await waitFor(() => expect(views.support?.menuId).toBe('cycle-time'), { timeout: 8000 });
    const before = queryOf(host.url);

    let saved: Awaited<ReturnType<SavedViews['saveAs']>> | undefined;
    await act(async () => { saved = await views.saveAs({ name: '왕복', kind: 'menu-view' }); });
    expect(saved?.ok).toBe(true);
    const view = [...rows.values()][0] as Extract<SavedView, { kind: 'menu-view' }>;
    expect(view.context).toMatchObject({ roomNames: ['ETCH', 'PHOTO'], lineNames: ['L1'], prcGroups: ['G1'], selection: ['EQ-1'], from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' });
    expect(view.context.condition).toEqual({ maker: ['TEL'], model: ['M1'] });
    expect(JSON.stringify(view.page)).toContain('granularity');

    // Leave the conditions, then pick the view: the address comes back with every declared value.
    await act(async () => { host.navigate(BARE); });
    await waitFor(() => expect(queryOf(host.url)).toBe(queryOf(BARE)));
    let outcome: Awaited<ReturnType<SavedViews['select']>> | undefined;
    await act(async () => { outcome = await views.select(view.id); });
    expect(outcome).toMatchObject({ ok: true, unsupported: [] });
    await waitFor(() => expect(host.global.roomNames).toEqual(['ETCH', 'PHOTO']));
    expect(parseQuery(host.url.slice(host.url.indexOf('?')), ['granularity', 'percentile', 'sort', 'bin']).global).toMatchObject({ lineNames: ['L1'], prcGroups: ['G1'], selection: ['EQ-1'], condition: { maker: ['TEL'], model: ['M1'] } });
    expect(queryOf(host.url)).toBe(before);
  });
});
