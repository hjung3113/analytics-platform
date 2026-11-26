// Test-only public entry `@ap/kernel/testing` (ADR-0040, #381): adapter, session and space fixtures.
// Import only from test files (*.test.ts(x), test-support.ts, test-setup.ts); the boundary lint rejects production imports.
// Deliberately not exported from src/index.ts.
import { act, createElement, lazy, useContext, type ReactElement } from 'react';
import { House } from 'lucide-react';
import type { PlatformMenuEntry } from './registry/registry';
import { useToastList, type Toast } from './platform/platform';
import { AppContext } from './platform/contexts';
import { contextCapabilities, type ActionResponse, type ApiResponse, type Capability, type ContextKey, type JsonValue, type ModuleScopedId, type PreferencesSnapshot, type Permission, type PlatformAdapter, type ScopeOption, type Session, type SessionUser, type SpaceDef, groupId, spaceId } from '@ap/contracts';

export { registerLentPanel } from './registry/LentPanel';

/** Access the active screen's table slots to register a test fixture with a live getter. */
export function useTestSavedViewTableSlots(menuId: string, scopeId: string | null) {
  return useContext(AppContext)?.internal.savedViewSlots.screen(JSON.stringify([menuId, scopeId]));
}

/** Every Context key 'unsupported': the no-op Global Context capability record (06 §6). */
/** A registered screen that draws nothing: a menu entry with `component: testScreen` is not «planned» (no screen), so visits and resume record it (#1944). */
export const testScreen = lazy(async () => ({ default: () => null }));
export const noContext: Record<ContextKey, Capability> = contextCapabilities();

/** analytics space fixture. Pass the fields the test means (id · homeMenuId · permission · label); the rest are filler. */
export function testSpace(over: Partial<SpaceDef> = {}): SpaceDef {
  return { id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'home', ...over };
}

/**
 * Menu fixture: a live `management` menu `home` in group `overview` behind `platform:view`, with every feature off.
 * Pass the fields the test means; `features` merges, so `{ features: { export: true } }` keeps the rest off. An `undefined`
 * value is ignored, and every call gets its own `context` record.
 * `query` defaults to live, so `pageType: 'analysis'` registers without the Apply period it would otherwise need.
 */
export function testMenu(over: Partial<Omit<PlatformMenuEntry, 'features'>> & { features?: Partial<PlatformMenuEntry['features']> } = {}): PlatformMenuEntry {
  // An `undefined` override counts as omitted, so a required field keeps its default.
  const defined = <T extends object>(value: T | undefined) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
  const { features, ...rest } = over;
  return {
    id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House,
    permission: 'platform:view', requiresScope: false, context: contextCapabilities(), pageType: 'management', query: { mode: 'live' }, pageKeys: [], ...defined(rest),
    features: { export: false, savedView: false, annotate: false, compare: false, ...defined(features) },
  };
}

/** Session fixture with the given permissions; override the user fields or scopes the test means. */
export function testSession(permissions: readonly (Permission | ModuleScopedId)[], over: { user?: Partial<SessionUser>; scopes?: readonly ScopeOption[] } = {}): Session {
  return {
    user: { id: 'u1', name: 'u1', title: { ko: 'u1', en: 'u1' }, permissions, ...over.user },
    scopes: over.scopes ?? [],
  };
}

const refused: ApiResponse<never> = { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const refusedAction: ActionResponse<never> = { outcome: 'error', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'test', message: 'refused' };
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };

/** Adapter fixture: every method denied/empty and `subscribe` a no-op. Pass only the methods the test means. */
export function testAdapter(over: Partial<PlatformAdapter> = {}): PlatformAdapter {
  // session() is a store snapshot (adapter.ts): one default session per adapter, not per read.
  const session = testSession([]);
  // In-memory preferences for this adapter only (the default is a signed-in user with nothing stored).
  const prefs = new Map<string, JsonValue>();
  let importedAt: string | null = null;
  const snapshot = (): ApiResponse<PreferencesSnapshot> => ({ outcome: 'ok', data: { values: Object.fromEntries(prefs), importedAt }, assessments: [], trust: null, correlationId: 'fixture' });
  return {
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    listAxisOptions: async () => ({ items: [], nextCursor: null }),
    searchEquipment: async () => ({ items: [], nextCursor: null }),
    listEquipmentFacts: async () => ({ items: [], version: 'test-facts:1' }),
    resolveSelection: async ({ ids }) => ({ items: [...new Set(ids)].map(id => ({ id, status: 'not_found' as const })) }),
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => empty,
    menuQuery: async () => refused,
    menuAction: async () => refusedAction,
    defaultRangeTo: () => '2026-09-26T09:00:00',
    recordUsage: async () => ({ accepted: 0 }),
    reportClientError: async () => ({ accepted: true }),
    usageSummary: async () => refused,
    usageNextScreens: async () => refused,
    auditTrail: async () => refused,
    entityAudit: async () => refused,
    accessDirectory: async () => refused,
    listAnnotations: async () => empty,
    saveAnnotation: async () => refused,
    deleteAnnotation: async () => refused,
    readPreferences: async () => snapshot(),
    patchPreferences: async ({ set, remove }) => {
      for (const key of remove ?? []) prefs.delete(key);
      for (const [key, value] of Object.entries(set ?? {})) prefs.set(key, value);
      return snapshot();
    },
    importPreferences: async ({ values }) => {
      if (importedAt === null) {
        for (const [key, value] of Object.entries(values)) if (!prefs.has(key)) prefs.set(key, value);
        importedAt = '2026-09-26T09:00:00Z';
      }
      return snapshot();
    },
    lookupPeople: async () => [],
    listNotices: async () => refused,
    saveNotice: async () => refusedAction,
    deleteNotice: async () => refusedAction,
    subscribe: () => () => {},
    ...over,
  };
}

/** An isolated in-memory Web Storage implementation; no browser or test-runner dependency. */
export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: key => data.get(String(key)) ?? null,
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: key => { data.delete(String(key)); },
    clear: () => data.clear(),
    key: index => Array.from(data.keys())[index] ?? null,
    get length() { return data.size; },
  };
}

/** The shell toast list a test reads (the `toasts` field left `usePlatform()`, #824). Throws outside a PlatformProvider. */
export function useToastsForTest(): readonly Toast[] {
  return useToastList();
}

/** Renders the toast list as `<ul aria-label="toasts">` with one `<li data-tone>` per toast, for tests that assert on raised toasts. */
export function ToastProbe(): ReactElement {
  const toasts = useToastList();
  return createElement('ul', { 'aria-label': 'toasts' }, toasts.map(t => createElement('li', { key: t.id, 'data-tone': t.tone }, t.text)));
}

const macrotask = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

/**
 * Waits until a settled menu query is on screen (ADR-0086): TanStack tells its observers after a macrotask (notifyManager) that is
 * queued only once the reply has landed, so this waits two macrotasks inside `act`. Await it after resolving an adapter reply.
 * Like Testing Library's `act`, it marks the run as an act environment and restores the previous flag afterwards.
 */
export async function settleQueries(): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = scope.IS_REACT_ACT_ENVIRONMENT;
  scope.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => { await macrotask(); await macrotask(); });
  } finally {
    scope.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

export { createFakeSavedViewStore, testSavedView, testViewCapabilities, type FakeSavedViewStore } from './saved-view/fake-store';
export { useSavedViews, type SavedViews } from './saved-view/useSavedViews';
