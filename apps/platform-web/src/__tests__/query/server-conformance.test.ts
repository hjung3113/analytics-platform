import { EQUIPMENT_AXES } from '../../equipmentAxes';
/**
 * Server boundary conformance (#145): the adapter-agnostic kit judged against the mock adapter, over every menu
 * endpoint the app registers. The in-house server adapter runs the same harness shape
 * (docs/integration/real-server-checklist.md). The endpoint list is the mock assembly's own MOCK_ENDPOINTS (#153) — lint lets exactly this test import it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTORS, createLocalSavedViewStore, createMockAdapter, defineMockAction, EQUIPMENT, MENU_ID_PATTERN, getRole, jobsForEquipmentDay, setRole, USERS, type RoleId } from '@ap/mock-server';
import { describeServerConformance, type ConformanceCase } from '@ap/server-conformance';
import { stagedImport, specFixture, setConformanceUpload, MOCK_ACTIONS, MOCK_AUDIT_EVENTS, MOCK_ENDPOINTS, MOCK_WRITE_SAMPLES } from '../../dev/mock-assembly';
import { createRegistry, type MenuEntry } from '@ap/kernel';
import { GROUPS, MENUS, PERMISSIONS, registry } from '../../menus';
import { defineAction, emptyGlobal, menuPermission, menuPermissions, spaceId, type Permission } from '@ap/contracts';

/** Exactly what the app registers: the mock assembly's lists, not a copy. */
const endpoints = MOCK_ENDPOINTS;

/** A real RecordSequence from the mock: the first job of the equipment's day. */
const OCCURRENCE_EQUIPMENT = 'MEM-PHOTO-0103';
const OCCURRENCE_ANCHOR = jobsForEquipmentDay(EQUIPMENT.find(row => row.equipmentId === OCCURRENCE_EQUIPMENT)!, '2026-09-25')[0].anchor;

const page = { page: 0, pageSize: 10, sorting: [] };
const EXPLORER_SET = { sourceOwner: 'synthetic-ok', files: [{ fileRef: 'source-b', order: 1, sha256: 'b'.repeat(64) }] };
const SPEC_READ_DRAFT = specFixture().revisionId;
const IMPORT_READ_JOB = stagedImport(true).jobId;
// Read conformance fixtures: the seeded Layout and a published Revision and Template.
const studioAction = (id: string) => MOCK_ACTIONS.find(action => action.spec.id === `eqv.${id}`)!;
const studioRun = (id: string, input: Record<string, unknown>) => studioAction(id).handle({ input, actor: 'admin', scopeId: null }).data as Record<string, string>;
const studioRead = (id: string, params: Record<string, unknown>) => endpoints.find(({ spec }) => spec.id === `eqv.${id}`)!.handle({ equipment: [], context: emptyGlobal, params, actor: 'admin' }) as { document: Record<string, unknown> };
const STUDIO_LAYOUT = 'sample-layout';
const STUDIO_REVISION = studioRun('publishRevision', { layoutId: STUDIO_LAYOUT }).revision!;
const STUDIO_TEMPLATE = 'conformance-template';
studioRun('promoteTemplate', { layoutId: STUDIO_LAYOUT, revision: STUDIO_REVISION, templateId: STUDIO_TEMPLATE, name: 'Conformance' });
// Synthetic window and mapping hashes used by the onboarding reads.
const ONBOARDING_G1 = '23e9e214b396bfaa4539e7b30c5f8f9163fbac6c50201430231f641ff7c822ba';
const ONBOARDING_MAPPING = 'sha256:0abf3e9ff0b22cb0e7993bfe143461f44ef1b8828df2cdce8e25af3d02987aef';
const slowFilter = { tail: 'p95', granularity: 'hour', bucket: null, bin: null };
/** One request per endpoint that the granted actor (engineer at MEM) runs successfully. Endpoints with no params default to `{}`. */
const PARAMS: Record<string, Record<string, unknown>> = {
  'logExplorer.investigations': { status: 'open', page: 0, pageSize: 50 },
  'logExplorer.investigationDetail': { investigationId: '14730000-0000-4000-8000-000000000001' },
  'logExplorer.records': { sampleSet: EXPLORER_SET, query: {}, cursor: null, limit: 50 },
  'logExplorer.periods': { sampleSet: EXPLORER_SET, query: {}, cursor: null, limit: 50 },
  'logExplorer.window': { sourceOwner: 'synthetic-ok', fileRef: 'source-b', line: 1, before: 3, after: 3 },
  'logExplorer.handoffCheck': { investigationId: '14730000-0000-4000-8000-000000000008' },
  'logExplorer.handoffModels': { q: null, page: 0, pageSize: 20 },
  'logExplorer.handoffSoftware': { modelId: '14740000-0000-4000-8000-000000000010' },
  'logExplorer.parsed': { sourceOwner: 'synthetic-ok', fileRef: 'source-b', line: 1 },
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
  'logLifecycle.models': { q: null, ...page },
  'logLifecycle.projectDetail': { projectId: '14470000-0000-4000-8000-000000000101' },
  'logLifecycle.projectEvents': { projectId: '14470000-0000-4000-8000-000000000101', page: 0, pageSize: 25 },
  'logLifecycle.rounds': { projectId: '14470000-0000-4000-8000-000000000101' },
  'logLifecycle.roundDetail': { roundId: '14470000-0000-4000-8000-000000000201' },
  'logLifecycle.roundEvidence': { roundId: '14470000-0000-4000-8000-000000000201' },
  'logLifecycle.requests': { page: 0, pageSize: 25 },
  'logLifecycle.requestDetail': { requestId: '14470000-0000-4000-8000-000000000301' },
  'logLifecycle.opinions': { attemptId: '14470000-0000-4000-8000-000001778401', unlinked: true, page: 0, pageSize: 25 },
  'logLifecycle.ruleResults': { attemptId: '14470000-0000-4000-8000-000000000401', page: 0, pageSize: 25 },
  'logLifecycle.hierarchy': { op: 'children', parentId: null, limit: 50 },
  'logLifecycle.validationIssues': {},
  'logLifecycle.validationIssueDetail': { issueId: '14470000-0000-4000-8000-000000000501' },
  'logLifecycle.validationIssueThread': { issueId: '14470000-0000-4000-8000-000000000501' },
  'logLifecycle.validationIssueHistory': { issueId: '14470000-0000-4000-8000-000000000501' },
  'logLifecycle.roundDiscussion': { roundId: '14470000-0000-4000-8000-000000000501' },
  'logLifecycle.evidenceStates': { ruleResultId: '14470000-0000-4000-8000-000000000501' },
  'logLifecycle.excerpt': { ruleResultId: '14470000-0000-4000-8000-000000000501', evidenceIndex: 0 },
  // Log knowledge catalog reads (#1194 r): the table's page + `filters` shape, no filter = every row.
  // Read-only validation catalog / coverage (#1495), synthetic fixture stable ids.
  'logDataset.datasets': { ...page },
  'logDataset.datasetDetail': { datasetId: '14810000-0000-4000-8000-000000000001' },
  'logDataset.baselines': { datasetRevisionId: '14810000-0000-4000-8000-000000000101' },
  'logDataset.baselineDetail': { baselineId: '14810000-0000-4000-8000-000000000201' },
  'logDataset.suites': { datasetId: '14810000-0000-4000-8000-000000000001', ...page },
  'logDataset.suiteDetail': { suiteId: '14810000-0000-4000-8000-000000000301' },
  'logDataset.suiteRuns': { suiteId: '14810000-0000-4000-8000-000000000301', page: 0, pageSize: 25 },
  'logDataset.comparison': { suiteRunId: '14810000-0000-4000-8000-000000000401', ...page },
  'logDataset.rerunDiff': { fromRunId: '14810000-0000-4000-8000-000000000401', toRunId: '14810000-0000-4000-8000-000000000402' },
  'logRules.ruleSets': { q: null, ...page },
  'logRules.ruleSetDetail': { ruleSetKey: 'core' },
  'logRules.rules': { q: null, targetQ: null, ...page },
  'logRules.ruleDetail': { ruleSetKey: 'core', ruleKey: 'R-002' },
  'logRules.coverage': { modelId: '00000003-0000-4000-8000-000000000008', page: 0, pageSize: 50 },
  'logRules.coverageSummary': { modelIds: ['00000003-0000-4000-8000-000000000008'] },
  'logRules.modelOptions': { q: null, page: 0, pageSize: 20 },
  'logRules.softwareOptions': { modelId: '00000003-0000-4000-8000-000000000008' },
  'logKnowledge.vendors': { q: null, ...page },
  'logKnowledge.processes': { q: null, ...page },
  'logKnowledge.models': { q: null, ...page },
  'logKnowledge.softwareVersions': { q: null, ...page },
  // #1197 s1: the model reads; `modelProfile` takes a seed model id (store.ts sequence 8 = A-100, see `seedId` below).
  'logKnowledge.exploreModels': { q: null, ...page },
  'logKnowledge.modelProfile': { modelId: '00000003-0000-4000-8000-000000000008' },
  // #1656: the Top View pointer reads; Alpha 100 has the mock's default link.
  'logKnowledge.modelTopView': { modelId: '00000003-0000-4000-8000-000000000008' },
  // Knowledge item reads (#1197 s2): the mock seed's first item (uuid by sequence, `src/mock/items.ts`).
  'logKnowledge.items': { q: null, ...page },
  'logKnowledge.search': { q: 'STEP_PROCESS', limit: 10 },
  'logKnowledge.searchSuggest': { q: 'STEP' },
  'logKnowledge.itemDetail': { itemId: '00000005-0000-4000-8000-000000000001' },
  'logKnowledge.modelSpec': { modelId: '00000003-0000-4000-8000-000000000008' },
  'logKnowledge.specCoverage': { modelId: '00000003-0000-4000-8000-000000000008' },
  'logKnowledge.modelSpecRevisions': { modelId: '00000003-0000-4000-8000-000000000008', page: 0, pageSize: 10 },
  'logKnowledge.specDraft': { revisionId: SPEC_READ_DRAFT },
  'logKnowledge.specChanges': { modelId: '00000003-0000-4000-8000-000000000008', status: 'all', page: 0, pageSize: 10 },
  'logKnowledge.importDetail': { jobId: IMPORT_READ_JOB, ...page },
  // #1196 e/f: concept mappings and suggestions of the seed model pair (A-100 / B-10), and the items about one Event of A-100.
  'logKnowledge.conceptMappings': { modelId: '00000003-0000-4000-8000-000000000008', page: 0, pageSize: 10 },
  'logKnowledge.conceptSuggestions': { modelId: '00000003-0000-4000-8000-000000000008', page: 0, pageSize: 10 },
  'logKnowledge.specSubjectItems': { modelId: '00000003-0000-4000-8000-000000000008', targetKey: 'CHAMBER/START', page: 0, pageSize: 10 },
  // Improvement reads (#1328 d): the table's page shape; detail and events take a seed item id (`mock/index.ts` `itemId`, sequence 1-5). Events declare no `sorting` paramKey.
  'improvement.items': { q: null, ...page },
  'improvement.itemDetail': { itemId: '13280000-0000-4000-8000-000000000001' },
  'improvement.itemEvents': { itemId: '13280000-0000-4000-8000-000000000001', page: 0, pageSize: 10 },
  // BRAVO Quest reads (#1641): `Q-1` is a mock Quest; the search takes a page and a size only.
  'improvement.quest': { id: 'Q-1' },
  'improvement.questSearch': { page: 0, pageSize: 10 },
  // EV (#801): the synthetic fixture's equipment; `continuationToken` stays omitted (first page).
  'eqv.topview-context': { equipmentId: 'eq-synth-01' },
  'eqv.topview-events': { equipmentId: 'eq-synth-01' },
  // Studio Layouts reads (#1654): the mock's seeded Layout, a Revision and a Template staged above.
  'eqv.layoutDraft': { layoutId: STUDIO_LAYOUT },
  'eqv.layoutRevisions': { layoutId: STUDIO_LAYOUT },
  'eqv.layoutRevision': { layoutId: STUDIO_LAYOUT, revision: STUDIO_REVISION },
  'eqv.template': { templateId: STUDIO_TEMPLATE },
  // 설비 온보딩 reads (#1658): the mock's synthetic equipment, its seeded window and latest Mapping Version.
  'eqv.aliasRules': { level: 'model', vendorId: 'synth-maker', modelId: 'synth-model' },
  'eqv.typeDictionary': { level: 'model', vendorId: 'synth-maker', modelId: 'synth-model' },
  'eqv.equipmentScopes': { equipmentId: 'eq-synth-01' },
  'eqv.mappingVersions': { equipmentId: 'eq-synth-01' },
  'eqv.mappingVersion': { equipmentId: 'eq-synth-01', hash: ONBOARDING_MAPPING },
  'eqv.bindings': { equipmentId: 'eq-synth-01' },
  'eqv.baselineInventory': { equipmentId: 'eq-synth-01', mappingHash: ONBOARDING_MAPPING },
  'eqv.sampleWindows': { equipmentId: 'eq-synth-01' },
  'eqv.observedInventory': { equipmentId: 'eq-synth-01', windowHash: ONBOARDING_G1 },
};
/** The EV specs declare `limits.maxHours: 8`, so their cases run in the fixture's 30-minute window, not the harness's 24 h (naive seconds, as the URL carries them). */
const EQV_CONTEXT = { from: '2026-01-01T10:00:00', to: '2026-01-01T10:30:00' };

// No oversizeParams samples (#175): mock data sits far below the declared maxRows, so no case can exceed a cap.
// Left out, as the real-server run does (platform-conformance.integration.test.ts MENU_LEFT_OUT): the Revision picker is judged by
// `knowledge.catalog.manage` on top of `platform:view`, and the kit's granted account holds `platform:view` only, so it is answered
// `forbidden` where the kit wants `ok` or `empty`. `menus/log-dev/log-knowledge/src/mock/topview.test.ts` covers the refusal and the manager answer.
const LEFT_OUT = new Set(['logKnowledge.topViewRevisionOptions']);
const cases: ConformanceCase[] = endpoints.filter(({ spec }) => !LEFT_OUT.has(spec.id)).map(({ spec }) => ({ spec, params: PARAMS[spec.id] ?? {}, ...(spec.id.startsWith('eqv.topview-') ? { context: EQV_CONTEXT } : {}) }));
// One fixed action checks the mock write engine independently of the registered menu actions (ADR-0054).
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

// Every action input comes from its menu's generated mock registration.
const menuSamples: Record<string, () => Record<string, unknown>> = Object.assign({}, ...MOCK_WRITE_SAMPLES);
const sampleOf = (actionId: string) => menuSamples[actionId];
// An action without a sample is reported by name in the harness test below instead of crashing the suite at load.
const actionCases = MOCK_ACTIONS.flatMap(action => {
  const sample = sampleOf(action.spec.id);
  if (sample === undefined) return [];
  const currentVersion = async () => action.version!({ input: sample(), actor: 'admin', scopeId: null }) ?? '';
  return [{ spec: action.spec, get input() { return sample(); }, ...(action.spec.concurrency === 'version' ? { currentVersion } : {}) }];
});
const GRANTED: RoleId = 'engineer';
// Only admin holds `knowledge:catalog-manage`, `knowledge:item-publish` and `improvement:manage` in the mock (the
// server: Admin or a workspace grant), so these writes run as admin; the removed-permission check removes the
// permission from admin's list too (`withoutPermission` below), so it really takes the action actor's right away.
const CATALOG_PERMISSION = menuPermission('knowledge:catalog-manage');
const ITEM_PUBLISH = menuPermission('knowledge:item-publish');
const IMPROVEMENT_MANAGE = menuPermission('improvement:manage');
const SPEC_PUBLISH = menuPermission('knowledge:spec-publish');
const EXPLORER_INVESTIGATE = menuPermission('explorer:investigate');
const EXPLORER_HANDOFF = menuPermission('explorer:handoff');
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
  it('gets every registered action sample from its menu mock (#2010)', () => {
    expect(MOCK_ACTIONS.filter(action => menuSamples[action.spec.id] === undefined).map(action => action.spec.id)).toEqual([]);
  });

  it('gives a sample request to every endpoint that declares params', () => {
    const missing = endpoints.filter(({ spec }) => Object.keys(spec.paramKeys).length > 0 && !(spec.id in PARAMS)).map(({ spec }) => spec.id);
    expect(missing).toEqual([]);
  });

  it('gives a write sample to every action the app registers', () => {
    const missing = MOCK_ACTIONS.filter(action => sampleOf(action.spec.id) === undefined).map(action => action.spec.id);
    expect(missing).toEqual([]);
  });
});

// The vocabulary carries `eqv:view` (declared in PERMISSIONS for the viewer menus), so the mock roles are built from it (#801).
const adapter = createMockAdapter({ equipmentAxes: EQUIPMENT_AXES, endpoints, registry, permissions: registry.permissions, auditEvents: MOCK_AUDIT_EVENTS, actions: [fixtureMockAction, ...MOCK_ACTIONS], latency: 0 });
// Only the uploader reads an upload (ADR-0140 §6): the import sample's file belongs to the granted actor the eqv writes run as.
const onboardingBatchDir = join(process.cwd(), '../../packages/eqv/assets/observations/eq-synth-01/windows');
const onboardingBatch = readFileSync(join(onboardingBatchDir, readdirSync(onboardingBatchDir)[0]!), 'utf8');
const onboardingUploadId = (await asRole(GRANTED, () => adapter.uploadFile!({ file: new Blob([onboardingBatch], { type: 'application/json' }), name: 'conformance.batch.json', idempotencyKey: crypto.randomUUID() }))).data!.id;
setConformanceUpload(onboardingUploadId);

// The SavedViewStore conformance sample (#1131): the browser-local store judged by the same checks as the real
// server's. Both actors come from the mock directory of @ap/mock-server so the group share between them is real;
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
  menuQuery: (req: Parameters<typeof adapter.menuQuery>[0]) => {
    if (req.endpoint !== 'logKnowledge.specDraft') return adapter.menuQuery(req);
    // serveEndpoint pins the actor synchronously before its first await. Restore immediately: granted
    // conformance reads run concurrently, so an awaited global role switch would leak admin to other ports.
    const previous = getRole(); setRole('admin');
    try { return adapter.menuQuery(req); } finally { setRole(previous); }
  },
  menuAction: (req: Parameters<typeof adapter.menuAction>[0]) =>
    req.action.startsWith('logKnowledge.') || req.action.startsWith('improvement.') || req.action.startsWith('logExplorer.') || req.action.startsWith('logLifecycle.') ? asRole('admin', () => adapter.menuAction(req)) : adapter.menuAction(req),
}) as typeof adapter;

describeServerConformance('server boundary conformance — mock adapter', {
  adapter: conformanceAdapter,
  cases,
  actions: [{ spec: fixtureSave, input: { text: 'sample' }, currentVersion: async () => String(fixtureVersion) }, ...actionCases],
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
    setRole(permission === CATALOG_PERMISSION || permission === ITEM_PUBLISH || permission === IMPROVEMENT_MANAGE || permission === SPEC_PUBLISH || permission === EXPLORER_INVESTIGATE || permission === EXPLORER_HANDOFF || String(permission).startsWith('lifecycle:') ? 'admin' : GRANTED);
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
