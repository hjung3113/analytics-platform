// Test-only public entry `@ap/kernel/testing` (ADR-0040, #381): adapter, session and space fixtures.
// Import only from test files (*.test.ts(x), test-support.ts, test-setup.ts); the boundary lint rejects production imports.
// Deliberately not exported from src/index.ts.
import type { ActionResponse, ApiResponse, Capability, ContextKey, ModuleScopedId, Permission, PlatformAdapter, ScopeOption, Session, SessionUser, SpaceDef } from '@ap/contracts';

/** Every Context key 'unsupported': the no-op Global Context capability record (06 §6). */
export const noContext: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

/** analytics space fixture. Pass the fields the test means (id · homeMenuId · permission · label); the rest are filler. */
export function testSpace(over: Partial<SpaceDef> = {}): SpaceDef {
  return { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'home', ...over };
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
