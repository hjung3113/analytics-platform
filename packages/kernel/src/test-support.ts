// Package-internal test fixtures (#265). Not exported from src/index.ts — tests import it by relative path only.
import type { ApiResponse, Capability, ContextKey, Permission, PlatformAdapter, ScopeOption, Session, SessionUser, SpaceDef } from '@ap/contracts';

/** Every Context key 'unsupported': the no-op Global Context capability record (06 §6). */
export const noContext: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

/** analytics space fixture. Pass the fields the test means (id · homeMenuId · permission · label); the rest are filler. */
export function testSpace(over: Partial<SpaceDef> = {}): SpaceDef {
  return { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'home', ...over };
}

/** Session fixture with the given permissions; override the user fields or scopes the test means. */
export function testSession(permissions: readonly Permission[], over: { user?: Partial<SessionUser>; scopes?: readonly ScopeOption[] } = {}): Session {
  return {
    user: { id: 'u1', name: 'u1', title: { ko: 'u1', en: 'u1' }, permissions, ...over.user },
    scopes: over.scopes ?? [],
  };
}

const refused: ApiResponse<never> = { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };

/** Adapter fixture: every method denied/empty and `subscribe` a no-op. Pass only the methods the test means. */
export function testAdapter(over: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    session: () => testSession([]),
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => empty,
    menuQuery: async () => refused,
    defaultRangeTo: () => '2026-09-26T09:00:00',
    recordUsage: async () => ({ accepted: 0 }),
    reportClientError: async () => ({ accepted: true }),
    usageSummary: async () => refused,
    auditTrail: async () => refused,
    entityAudit: async () => refused,
    accessDirectory: async () => refused,
    listAnnotations: async () => empty,
    saveAnnotation: async () => refused,
    subscribe: () => () => {},
    ...over,
  };
}
