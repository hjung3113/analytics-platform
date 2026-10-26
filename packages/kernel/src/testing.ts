// Test-only public entry `@ap/kernel/testing` (ADR-0040, #381): adapter, session and space fixtures.
// Import only from test files (*.test.ts(x), test-support.ts, test-setup.ts); the boundary lint rejects production imports.
// Deliberately not exported from src/index.ts.
import { act, createElement, type ReactElement } from 'react';
import { useToastList, type Toast } from './platform/platform';
import { contextCapabilities, type ActionResponse, type ApiResponse, type Capability, type ContextKey, type ModuleScopedId, type Permission, type PlatformAdapter, type ScopeOption, type Session, type SessionUser, type SpaceDef, spaceId } from '@ap/contracts';

/** Every Context key 'unsupported': the no-op Global Context capability record (06 §6). */
export const noContext: Record<ContextKey, Capability> = contextCapabilities();

/** analytics space fixture. Pass the fields the test means (id · homeMenuId · permission · label); the rest are filler. */
export function testSpace(over: Partial<SpaceDef> = {}): SpaceDef {
  return { id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'home', ...over };
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
  return {
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    listAxisOptions: async () => ({ items: [], nextCursor: null }),
    searchEquipment: async () => ({ items: [], nextCursor: null }),
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
    auditTrail: async () => refused,
    entityAudit: async () => refused,
    accessDirectory: async () => refused,
    listAnnotations: async () => empty,
    saveAnnotation: async () => refused,
    deleteAnnotation: async () => refused,
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
