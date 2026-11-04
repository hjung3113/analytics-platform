import { EQUIPMENT_AXES } from './equipmentAxes';
/**
 * Server boundary conformance (#145): the adapter-agnostic kit judged against the mock adapter, over every menu
 * endpoint the app registers. The in-house server adapter runs the same harness shape
 * (docs/integration/real-server-checklist.md). The endpoint list is the mock assembly's own MOCK_ENDPOINTS (#153) plus its MODULE_MOCK_ENDPOINTS (#801) — lint lets exactly this test import it.
 */
import { describe, expect, it } from 'vitest';
import { createMockAdapter, defineMockAction, EQUIPMENT, MENU_ID_PATTERN, getRole, jobsForEquipmentDay, setRole, USERS, type RoleId } from '@ap/mock-server';
import { describeServerConformance, type ConformanceCase } from '@ap/server-conformance';
import { MOCK_ACTIONS, MOCK_AUDIT_EVENTS, MOCK_ENDPOINTS, MODULE_MOCK_ENDPOINTS } from './dev/mock-assembly';
import { createRegistry, type MenuEntry } from '@ap/kernel';
import { GROUPS, MENUS, PERMISSIONS, registry } from './menus';
import { modulePermissions } from './modules';
import { defineAction, emptyGlobal, menuPermission, menuPermissions, spaceId, type Permission } from '@ap/contracts';
import { ACTORS } from './saved-view-seed';
import { createLocalSavedViewStore } from './saved-view-store';

/** Exactly what the app registers: the mock assembly's lists, not a copy. */
const endpoints = [...MOCK_ENDPOINTS, ...MODULE_MOCK_ENDPOINTS];

/** A real RecordSequence from the mock: the first job of the equipment's day. */
const OCCURRENCE_EQUIPMENT = 'MEM-PHOTO-0103';
const OCCURRENCE_ANCHOR = jobsForEquipmentDay(EQUIPMENT.find(row => row.equipmentId === OCCURRENCE_EQUIPMENT)!, '2026-09-25')[0].anchor;

const page = { page: 0, pageSize: 10, sorting: [] };
// The import wizard's reads and writes need a staged job (#1195 c): the mock's own handlers stage one, so each sample is a fresh job.
const importHandler = (id: string) => MOCK_ACTIONS.find(action => action.spec.id === `logKnowledge.${id}`)!;
let importSeq = 0;
const stagedImport = (validated: boolean): { jobId: string; planVersion: number } => {
  const n = ++importSeq;
  const text = ['메이커명\t공정명\t모델명', `CF Import Co ${n}\tEtch\tCF Import Model ${n}`, 'Alpha Semicap\t\tAlpha'].join('\n');
  const { jobId } = importHandler('importPaste').handle({ input: { text }, actor: 'admin', scopeId: null }).data as { jobId: string };
  const planVersion = validated ? (importHandler('importValidate').handle({ input: { jobId }, actor: 'admin', scopeId: null }).data as { planVersion: number }).planVersion : 1;
  return { jobId, planVersion };
};
const IMPORT_READ_JOB = stagedImport(true).jobId;
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
  'equipment.master.page': { q: '', ...page },
  'equipment.master.export': { q: '', ids: null, sorting: [] },
  'home.notices': { targetScopeId: 'MEM' },
  'metrics.pair': { viewedId: null, pageVersion: null },
  'metrics.catalog.list': { lang: 'ko' },
  'metrics.catalog.export': { q: null, lang: 'ko', ids: null, sorting: [] },
  'metrics.catalog.page': { q: null, lang: 'ko', ...page },
  'metrics.definition': { metricId: 'cycle_time', version: '4' },
  'metrics.usage': { metricId: 'cycle_time', version: '4' },
  // Log knowledge catalog reads (#1194 r): the table's page + `filters` shape, no filter = every row.
  'logKnowledge.vendors': { q: null, ...page },
  'logKnowledge.processes': { q: null, ...page },
  'logKnowledge.models': { q: null, ...page },
  'logKnowledge.softwareVersions': { q: null, ...page },
  // #1197 s1: the model reads; `modelProfile` takes a seed model id (store.ts sequence 8 = A-100, see `seedId` below).
  'logKnowledge.exploreModels': { q: null, ...page },
  'logKnowledge.modelProfile': { modelId: '00000003-0000-4000-8000-000000000008' },
  // Knowledge item reads (#1197 s2): the mock seed's first item (uuid by sequence, `src/mock/items.ts`).
  'logKnowledge.items': { q: null, ...page },
  'logKnowledge.itemDetail': { itemId: '00000005-0000-4000-8000-000000000001' },
  'logKnowledge.importDetail': { jobId: IMPORT_READ_JOB, ...page },
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

// The catalog writes (#1194 r) run against the mock's own actions. Each kit check writes with a fresh key, so a create
// sample hands out a new code every time (a getter) and the others re-send values the row already has. Seed ids are the
// deterministic ones of `menus/log-dev/log-knowledge/src/mock/store.ts` (sequence order: vendors 1-3, processes 4-7, models
// 8-13, software 14-17); that package's mock test pins them.
const seedId = (kind: number, n: number) => `${String(kind).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const [ALPHA, ETCH, A100, A100_V1] = [seedId(1, 1), seedId(2, 4), seedId(3, 8), seedId(4, 14)];
let sampleSeq = 0;
const unique = (label: string) => `CF-${label}-${++sampleSeq}`;
const catalogSamples: Record<string, () => Record<string, unknown>> = {
  vendorCreate: () => ({ code: unique('V'), name: 'Conformance vendor' }),
  vendorUpdate: () => ({ id: ALPHA, code: 'ALPHA', name: 'Alpha Semicap' }),
  vendorSetActive: () => ({ id: ALPHA, active: true }),
  processCreate: () => ({ code: unique('P'), name: 'Conformance process' }),
  processUpdate: () => ({ id: ETCH, code: 'ETCH', name: 'Etch' }),
  processSetActive: () => ({ id: ETCH, active: true }),
  modelCreate: () => ({ vendorId: ALPHA, code: unique('M'), name: 'Conformance model', processIds: [ETCH] }),
  modelUpdate: () => ({ id: A100, code: 'A-100', name: 'Alpha 100', processIds: [ETCH] }),
  modelSetActive: () => ({ id: A100, active: true }),
  softwareCreate: () => ({ modelId: A100, versionLabel: unique('S'), name: '' }),
  softwareUpdate: () => ({ id: A100_V1, versionLabel: 'v1.0', name: '' }),
  softwareSetActive: () => ({ id: A100_V1, active: true }),
};
// The item writes (#1197 s3a) run on seed items (`menus/log-dev/log-knowledge/src/mock/items.ts`, ids `00000005-…-<n>`):
// 2 is published and stays so, 3 is archived (never written here). Each kit check writes with a fresh key, so every
// sample must succeed again: a revise appends a revision, a derive and a create hand out new items, a set-archived to
// `false` on a published item changes nothing, and an assess asks for the state the item does not have right now.
const itemSeedId = (n: number) => `00000005-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ITEM_PUBLISHED = itemSeedId(2);
const ITEM_ASSESSED = itemSeedId(6);
const itemDetailRead = MOCK_ENDPOINTS.find(endpoint => endpoint.spec.id === 'logKnowledge.itemDetail')!;
const verificationOf = (itemId: string) =>
  (itemDetailRead.handle({ equipment: [], context: emptyGlobal, params: { itemId }, actor: 'admin' }) as { item: { verificationState: string } }).item.verificationState;
const itemBody = { typeCode: 'anomaly', observation: '적합성 표본 관찰', expected: '적합성 표본 기대' };
const itemSamples: Record<string, () => Record<string, unknown>> = {
  itemCreate: () => ({ ownerModelId: A100, title: unique('I'), ...itemBody }),
  itemRevise: () => ({ id: ITEM_PUBLISHED, title: unique('R'), ...itemBody, changeNote: '적합성 표본 보완' }),
  itemAssess: () => ({ id: ITEM_ASSESSED, dimension: 'verification', newState: verificationOf(ITEM_ASSESSED) === 'verified' ? 'observed' : 'verified', rationale: '적합성 표본 근거' }),
  itemDerive: () => ({ sourceItemId: itemSeedId(1), sourceRevisionNo: 1, ownerModelId: A100, title: unique('D'), ...itemBody }),
  itemSetArchived: () => ({ id: ITEM_PUBLISHED, archived: false }),
};
// The import writes (#1195 c): every sample stages its own job, so it succeeds again with a fresh key. Applies use new names each time.
const importSamples: Record<string, () => Record<string, unknown>> = {
  importPaste: () => ({ text: `메이커명\t모델명\nCF Paste Co\tCF Paste ${++importSeq}` }),
  importValidate: () => ({ jobId: stagedImport(false).jobId }),
  importResolve: () => ({ jobId: stagedImport(true).jobId, resolutions: [{ rowNo: 2, resolution: 'skip' }] }),
  importCancel: () => ({ jobId: stagedImport(false).jobId }),
  importApply: () => { const staged = stagedImport(true); return { jobId: staged.jobId, expectedPlanVersion: staged.planVersion }; },
};
const writeSamples = { ...catalogSamples, ...itemSamples, ...importSamples };
const catalogActionCases = MOCK_ACTIONS.map(action => {
  const sample = writeSamples[action.spec.id.replace('logKnowledge.', '')]!;
  const currentVersion = async () => action.version!({ input: sample(), actor: 'admin', scopeId: null }) ?? '';
  return { spec: action.spec, get input() { return sample(); }, ...(action.spec.concurrency === 'version' ? { currentVersion } : {}) };
});
const GRANTED: RoleId = 'engineer';
// Only admin holds `knowledge:catalog-manage` and `knowledge:item-publish` in the mock (the server: Admin or a workspace
// grant), so these writes run as admin; the removed-permission check removes the permission from admin's list too
// (`withoutPermission` below), so it really takes the action actor's right away.
const CATALOG_PERMISSION = menuPermission('knowledge:catalog-manage');
const ITEM_PUBLISH = menuPermission('knowledge:item-publish');
const asRole = async <T,>(role: RoleId, fn: () => Promise<T>): Promise<T> => {
  const previous = getRole();
  setRole(role);
  try { return await fn(); } finally { setRole(previous); }
};
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
const adapter = createMockAdapter({ equipmentAxes: EQUIPMENT_AXES, endpoints, registry, permissions: [...registry.permissions, ...modulePermissions(registry)], auditEvents: MOCK_AUDIT_EVENTS, actions: [fixtureMockAction, ...MOCK_ACTIONS] });

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

const conformanceAdapter = Object.assign(Object.create(adapter), {
  menuAction: (req: Parameters<typeof adapter.menuAction>[0]) =>
    req.action.startsWith('logKnowledge.') ? asRole('admin', () => adapter.menuAction(req)) : adapter.menuAction(req),
}) as typeof adapter;

describeServerConformance('server boundary conformance — mock adapter', {
  adapter: conformanceAdapter,
  cases,
  actions: [{ spec: fixtureSave, input: { text: 'sample' }, currentVersion: async () => String(fixtureVersion) }, ...catalogActionCases],
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
    setRole(permission === CATALOG_PERMISSION || permission === ITEM_PUBLISH ? 'admin' : GRANTED);
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

describe('hidden Scope presentation (#1251)', () => {
  it('no Scope-requiring endpoint belongs to a menu in a space with scopePresentation "hidden"', () => {
    const offenders = endpoints
      .filter(endpoint => endpoint.spec.requiresScope)
      .filter(endpoint => {
        const menu = registry.menus.find(entry => entry.id === endpoint.spec.menuId);
        return menu !== undefined && registry.spaceOf(menu)?.scopePresentation === 'hidden';
      })
      .map(endpoint => endpoint.spec.id);
    expect(offenders).toEqual([]);
  });
});

// #605: usage `fromMenuId` is judged by MENU_ID_PATTERN (mock-server; platform-api keeps the same literal). A registered menu id it
// rejected would make every navigation out of that menu fail the whole usage batch.
describe('usage menu-id pattern (#605)', () => {
  it('every menu id the app registers matches it', () => {
    expect(registry.menus.length).toBeGreaterThan(0);
    expect(registry.menus.map(menu => menu.id).filter(id => !MENU_ID_PATTERN.test(id))).toEqual([]);
  });

  // The rule is the Registry's own id shape plus the leak shapes a usage field must not carry, so a downstream id the public Registry accepts is never dropped (R1).
  it.each(['설비목록', '_internal', '-menu', 'ops@daily', 'mars:lot.view', '가'.repeat(80)])('a real createRegistry accepts the menu id %s and the pattern matches it', id => {
    const group = GROUPS.find(g => g.space === null)!;
    const template = MENUS.find(m => m.group === group.id && m.module === undefined)!;
    const menu: MenuEntry = { ...template, id, path: '/downstream-menu', aliases: undefined, primary: true };
    expect(() => createRegistry({ spaces: [], groups: [group], menus: [menu], permissions: PERMISSIONS })).not.toThrow();
    expect(MENU_ID_PATTERN.test(id)).toBe(true);
  });
});
