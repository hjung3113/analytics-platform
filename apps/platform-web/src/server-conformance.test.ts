import { EQUIPMENT_AXES } from './equipmentAxes';
/**
 * Server boundary conformance (#145): the adapter-agnostic kit judged against the mock adapter, over every menu
 * endpoint the app registers. The in-house server adapter runs the same harness shape
 * (docs/integration/real-server-checklist.md). The endpoint list is the mock assembly's own MOCK_ENDPOINTS (#153) plus its MODULE_MOCK_ENDPOINTS (#801) — lint lets exactly this test import it.
 */
import { describe, expect, it } from 'vitest';
import { createMockAdapter, defineMockAction, EQUIPMENT, getRole, jobsForEquipmentDay, setRole, USERS, type RoleId } from '@ap/mock-server';
import { describeServerConformance, type ConformanceCase } from '@ap/server-conformance';
import { MOCK_AUDIT_EVENTS, MOCK_ENDPOINTS, MODULE_MOCK_ENDPOINTS } from './dev/mock-assembly';
import { registry } from './menus';
import { modulePermissions } from './modules';
import { defineAction, menuPermission, menuPermissions, spaceId, type Permission } from '@ap/contracts';
import { ACTORS } from './saved-view-seed';
import { createLocalSavedViewStore } from './saved-view-store';

/** Exactly what the app registers: the mock assembly's lists, not a copy. */
const endpoints = [...MOCK_ENDPOINTS, ...MODULE_MOCK_ENDPOINTS];

/** A real RecordSequence from the mock: the first job of the equipment's day. */
const OCCURRENCE_EQUIPMENT = 'MEM-PHOTO-0103';
const OCCURRENCE_ANCHOR = jobsForEquipmentDay(EQUIPMENT.find(row => row.equipmentId === OCCURRENCE_EQUIPMENT)!, '2026-09-25')[0].anchor;

const page = { page: 0, pageSize: 10, sorting: [] };
const slowFilter = { tail: 'p95', granularity: 'hour', bucket: null, bin: null };
/** One request per endpoint that the granted actor (engineer at MEM) runs successfully. Endpoints with no params default to `{}`. */
const PARAMS: Record<string, Record<string, unknown>> = {
  'analytics.chartCatalog': { kind: 'line' },
  'clas.operationTime': { eqp: '' },
  'hwTime.levelRows': { drillModule: 'PM1' },
  'hwTime.trend': { rowIds: ['EQ-001.H1'] },
  'hwTime.tableRows': { drillModule: 'PM1', drillMotion: 'Chuck', ...page },
  'hwTime.exportRows': { drillModule: 'PM1', drillMotion: 'Chuck', ids: null, sorting: [] },
  'analytics.productivity.trend': { kpi: 'occupancy', granularity: 'hour' },
  'analytics.productivity.breakdown': { axis: 'room' },
  'analytics.productivity.drill': { level: 'stgroup', room: 'PHOTO', stgroup: '' },
  'analytics.execution.occurrence': { equipmentId: OCCURRENCE_EQUIPMENT, entityType: 'job', anchor: OCCURRENCE_ANCHOR, metricVersion: '3' },
  'analytics.cycle.trend': { granularity: 'hour' },
  'analytics.cycle.slow': { ...slowFilter, ...page },
  'analytics.cycle.export': { ...slowFilter, ids: null, sorting: [] },
  'equipment.master.page': { q: '', status: '', maker: '', ...page },
  'equipment.master.export': { q: '', status: '', maker: '', ids: null, sorting: [] },
  'home.notices': { targetScopeId: 'MEM' },
  'metrics.pair': { viewedId: null, pageVersion: null },
  'metrics.catalog.list': { q: null, status: null, domain: null, lang: 'ko' },
  'metrics.catalog.export': { q: null, status: null, domain: null, lang: 'ko', ids: null, sorting: [] },
  'metrics.catalog.page': { q: null, status: null, domain: null, lang: 'ko', ...page },
  'metrics.definition': { metricId: 'cycle_time', version: '4' },
  'metrics.usage': { metricId: 'cycle_time', version: '4' },
  // EV (#801): the synthetic fixture's equipment; `continuationToken` stays omitted (first page).
  'eqv.topview-context': { equipmentId: 'eq-synth-01' },
  'eqv.topview-events': { equipmentId: 'eq-synth-01' },
};
/** The EV specs declare `limits.maxHours: 8`, so their cases run in the fixture's 30-minute window, not the harness's 24 h (naive seconds, as the URL carries them). */
const EQV_CONTEXT = { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' };

// No oversizeParams samples (#175): mock data sits far below the declared maxRows, so no case can exceed a cap.
const cases: ConformanceCase[] = endpoints.map(({ spec }) => ({ spec, params: PARAMS[spec.id] ?? {}, ...(spec.id.startsWith('eqv.') ? { context: EQV_CONTEXT } : {}) }));
// No menu declares a write yet, so the write checks (ADR-0054) judge the mock engine over one fixture action on an
// existing analytics menu; the version counter is the stored row the handler bumps and `currentVersion` reads.
const trendSpec = endpoints.find(({ spec }) => spec.id === 'analytics.productivity.trend')!.spec;
const fixtureSave = defineAction<{ text: string }, { id: number }>({
  id: 'analytics.fixtureSave', menuId: trendSpec.menuId, inputKeys: { text: true }, permission: menuPermission('analytics:view'),
  requiresScope: true, concurrency: 'version', invalidates: [trendSpec],
});
let fixtureVersion = 1;
const fixtureMockAction = defineMockAction(fixtureSave, {
  version: () => String(fixtureVersion),
  handle: () => { fixtureVersion += 1; return { data: { id: fixtureVersion }, version: String(fixtureVersion) }; },
});
const GRANTED: RoleId = 'engineer';
const CONSOLE: RoleId = 'admin';
// Choose a granted group with different teams so the sample proves strict AND narrowing.
const grantedEquipment = EQUIPMENT.filter(e => e.site === 'MEM' && USERS[GRANTED].grants.MEM.includes(e.room));
const conditionSample = grantedEquipment.find(e => grantedEquipment.some(other => other.stgroup === e.stgroup && other.team !== e.team))!;
const secondGroup = grantedEquipment.find(e => e.stgroup !== conditionSample.stgroup)!;


describe('conformance harness covers what the app registers', () => {
  it('gives a sample request to every endpoint that declares params', () => {
    const missing = endpoints.filter(({ spec }) => Object.keys(spec.paramKeys).length > 0 && !(spec.id in PARAMS)).map(({ spec }) => spec.id);
    expect(missing).toEqual([]);
  });
});

// The vocabulary carries the mounted modules' permissions (`eqv:view`), so the mock roles are built from it (#801).
const adapter = createMockAdapter({ equipmentAxes: EQUIPMENT_AXES, endpoints, registry, permissions: [...registry.permissions, ...modulePermissions(registry)], auditEvents: MOCK_AUDIT_EVENTS, actions: [fixtureMockAction] });

// The SavedViewStore conformance sample (#1131): the browser-local store judged by the same checks as the real
// server's. Both actors come from the mock directory (saved-view-seed) so the group share between them is real;
// the storage is this file's own memory (this test's import allowlist is deliberately narrow, #153) and one
// queue serializes the two stores like the origin lock.
const savedViewMemory = new Map<string, string>();
const savedViewStorage = {
  getItem: (name: string) => savedViewMemory.get(name) ?? null,
  setItem: (name: string, value: string) => void savedViewMemory.set(name, value),
  removeItem: (name: string) => void savedViewMemory.delete(name),
};
let savedViewTail = Promise.resolve();
const savedViewLocks = { request: <T>(_name: string, callback: () => T | Promise<T>): Promise<T> => {
  const result = savedViewTail.then(callback); savedViewTail = result.then(() => undefined, () => undefined); return result;
} };
const savedViewStoreOf = (role: 'engineer' | 'admin') => createLocalSavedViewStore({
  getStorage: () => savedViewStorage,
  locks: savedViewLocks,
  getActor: () => ACTORS[role],
  menuPermissionsOf: menuId => { try { return menuPermissions(registry.menuById(menuId)); } catch { return undefined; } },
});

describeServerConformance('server boundary conformance — mock adapter', {
  adapter,
  cases,
  actions: [{ spec: fixtureSave, input: { text: 'sample' }, currentVersion: async () => String(fixtureVersion) }],
  context: { scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' },
  foreignScopeId: 'XIA',
  // Real mock data: the equipment sample sits in MEM/PHOTO (an engineer room), the engineer holds MEM + FDRY and
  // every permission except console:access, and the annotation/telemetry samples follow the usage wire contract.
  // DIFF is a real MEM room granted to admin only — the room re-check sample (06 §22). cycle-time-trend is a
  // time axis, so the annotation range is wall-clock (06 §16).
  ports: {
    options: {
      axisId: 'model', knownValues: ['Lithius-Pro', 'Tactras'], query: 'Lithius', queryValue: 'Lithius-Pro',
      equipment: EQUIPMENT.filter(e => e.site === 'MEM' && USERS[GRANTED].grants.MEM.includes(e.room)).map(e => ({ equipmentId: e.equipmentId, room: e.room, axes: { ...Object.fromEntries(EQUIPMENT_AXES.map(a => [a.id, [e[a.id as 'maker']]])), lineNames: [e.line], prcGroups: [e.prcGroup] } })),
      globalOptions: (['lineNames', 'prcGroups'] as const).map(axisId => ({
        axisId, values: [...new Set(grantedEquipment.map(e => axisId === 'lineNames' ? e.line : e.prcGroup))],
        parents: { roomNames: ['PHOTO'] }, parentValues: [...new Set(grantedEquipment.filter(e => e.room === 'PHOTO').map(e => axisId === 'lineNames' ? e.line : e.prcGroup))],
      })),
      deniedRoomId: EQUIPMENT.find(e => e.site === 'MEM' && e.room === 'DIFF')!.equipmentId, deniedRoom: 'DIFF',
      foreignSiteId: EQUIPMENT.find(e => e.site === 'XIA')!.equipmentId, absentId: '__absent_equipment__',
      deniedOption: { axisId: 'stgroup', value: EQUIPMENT.find(e => e.site === 'MEM' && e.room === 'DIFF')!.stgroup },
      parent: { axisId: 'maker', value: 'TEL', childValue: 'Lithius-Pro' },
    },
    condition: {
      endpoint: 'equipment.master.page',
      axisA: { id: 'stgroup', values: [conditionSample.stgroup, secondGroup.stgroup] },
      axisB: { id: 'team', value: conditionSample.team },
      nonHistoryAxisId: 'stgroup',
    },
    entity: {
      ref: { type: 'equipment', id: 'MEM-PHOTO-0103', scopeId: 'MEM' },
      permission: menuPermission('equipment:view'),
      ungrantedRoomRef: { type: 'equipment', id: 'MEM-DIFF-0176', scopeId: 'MEM' },
    },
    annotation: { chartId: 'cycle-time-trend', from: '2026-09-25T10:00:00', to: '2026-09-25T11:00:00', permission: menuPermission('analytics:view') },
    usage: { name: 'entry', menuId: 'equipment', spaceId: spaceId('mars'), path: '/equipment', at: Date.now(), sessionId: 'conformance-tab' },
    clientError: { correlationId: 'client-conformance', menuId: 'equipment', spaceId: spaceId('mars'), path: '/equipment', name: 'TypeError' },
    otherGrantedScopeId: 'FDRY',
    visiblePersonId: GRANTED,
    savedViews: { user: savedViewStoreOf('engineer'), admin: savedViewStoreOf('admin'), menuId: 'productivity-overview' },
  },
  asGranted: async fn => {
    const previous = getRole();
    setRole(GRANTED);
    try { return await fn(); } finally { setRole(previous); }
  },
  withoutPermission: async (permission: Permission, fn) => {
    const previous = getRole();
    setRole(GRANTED);
    // The adapter's world is built from the vocabulary above, not the default USERS, so the granted role's list is the session's own array.
    const permissions = adapter.session().user.permissions as Permission[];
    const kept = [...permissions];
    permissions.splice(0, permissions.length, ...kept.filter(p => p !== permission));
    try { return await fn(); } finally {
      permissions.splice(0, permissions.length, ...kept);
      setRole(previous);
    }
  },
  asConsole: async fn => {
    const previous = getRole();
    setRole(CONSOLE);
    try { return await fn(); } finally { setRole(previous); }
  },
  // admin: a different user from the granted engineer, with the chart permission and the MEM grant.
  asOtherAnnotator: async fn => {
    const previous = getRole();
    setRole(CONSOLE);
    try { return await fn(); } finally { setRole(previous); }
  },
});
