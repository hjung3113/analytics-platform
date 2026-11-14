/** Menu-owned repeatable conformance inputs (#2010); never imported by production screens. */
import { emptyGlobal } from '@ap/contracts';
import { logKnowledgeActionsMock, logKnowledgeMock } from './index';
// The import wizard's reads and writes need a staged job (#1195 c): the mock's own handlers stage one, so each sample is a fresh job.
const importHandler = (id: string) => logKnowledgeActionsMock.find(action => action.spec.id === `logKnowledge.${id}`)!;
let importSeq = 0;
export const stagedImport = (validated: boolean): { jobId: string; planVersion: number } => {
  const n = ++importSeq;
  const text = ['설비사명\t공정명\t모델명', `CF Import Co ${n}\tEtch\tCF Import Model ${n}`, 'Alpha Semicap\t\tAlpha'].join('\n');
  const { jobId } = importHandler('importPaste').handle({ input: { text }, actor: 'admin', scopeId: null }).data as { jobId: string };
  const planVersion = validated ? (importHandler('importValidate').handle({ input: { jobId }, actor: 'admin', scopeId: null }).data as { planVersion: number }).planVersion : 1;
  return { jobId, planVersion };
};
// Each spec sample owns a fresh model, so sealed drafts and append-only changes can be exercised repeatedly.
let specSequence = 0;
export const specFixture = (publish = false) => {
  const n = ++specSequence;
  const send = (id: string, input: Record<string, unknown>) => importHandler(id).handle({ input, actor: 'admin', scopeId: null }).data as Record<string, unknown>;
  const modelId = send('modelCreate', { vendorId: '00000001-0000-4000-8000-000000000001', code: `CF-SPEC-${n}`, name: `CF spec ${n}`, processIds: [] }).id as string;
  const softwareId = send('softwareCreate', { modelId, versionLabel: '1', name: '' }).id as string;
  const revisionId = send('specDraftCreate', { modelId, sourceDocRef: { docLabel: 'Conformance', docVersion: '1' } }).revisionId as string;
  send('specDraftSave', { revisionId, mode: 'append', modules: [{ name: 'Module' }], events: [{ module: 'Module', name: 'Event', triggerRule: 'first' }] });
  if (publish) send('specPublish', { revisionId });
  return { modelId, softwareId, revisionId, send };
};
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
const itemDetailRead = () => logKnowledgeMock.find(endpoint => endpoint.spec.id === 'logKnowledge.itemDetail')!;
const verificationOf = (itemId: string) =>
  (itemDetailRead().handle({ equipment: [], context: emptyGlobal, params: { itemId }, actor: 'admin' }) as { item: { verificationState: string } }).item.verificationState;
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
  importPaste: () => ({ text: `설비사명\t모델명\nCF Paste Co\tCF Paste ${++importSeq}` }),
  importValidate: () => ({ jobId: stagedImport(false).jobId }),
  importResolve: () => ({ jobId: stagedImport(true).jobId, resolutions: [{ rowNo: 2, resolution: 'skip' }] }),
  importCancel: () => ({ jobId: stagedImport(false).jobId }),
  importApply: () => { const staged = stagedImport(true); return { jobId: staged.jobId, expectedPlanVersion: staged.planVersion }; },
};
const changeFixture = (flag = false) => {
  const f = specFixture(true);
  const { changeId } = f.send('specChangeAdd', { modelId: f.modelId, softwareId: f.softwareId, targetKind: 'event', target: { module: 'Module', event: 'Event' }, changeKind: 'behavior', note: 'Conformance note' });
  if (flag) {
    const { revisionId } = f.send('specDraftCreate', { modelId: f.modelId, sourceDocRef: { docLabel: 'Conformance', docVersion: '2' } });
    f.send('specDraftSave', { revisionId, mode: 'append', modules: [{ name: 'Module' }], events: [{ module: 'Module', name: 'Event', triggerRule: 'second' }] });
    f.send('specPublish', { revisionId });
  }
  return { changeId };
};
const specSamples: Record<string, () => Record<string, unknown>> = {
  specDraftCreate: () => ({ modelId: specFixture(true).modelId, sourceDocRef: { docLabel: 'Conformance', docVersion: '2' } }),
  specDraftSave: () => ({ revisionId: specFixture().revisionId, mode: 'append', modules: [{ name: 'Extra' }] }),
  specPublish: () => ({ revisionId: specFixture().revisionId }),
  specReject: () => ({ revisionId: specFixture().revisionId, reason: 'Conformance rejection' }),
  specChangeAdd: () => { const f = specFixture(true); return { modelId: f.modelId, softwareId: f.softwareId, targetKind: 'event', target: { module: 'Module', event: 'Event' }, changeKind: 'behavior', note: 'Conformance note' }; },
  specChangeRetire: () => changeFixture(),
  specChangeConfirm: () => changeFixture(true),
};
// The concept writes (#1196 e): every sample stages its own `related` proposal on the seed model's Chamber module (a
// `related` row is exempt from the one-confirmed-equivalent rule), so confirm and reject succeed again on every call.
const stagedConcept = (): string => {
  const out = importHandler('conceptPropose').handle({ input: { modelId: A100, targetKind: 'module', target: { module: 'Chamber' }, canonicalLabel: unique('CONCEPT'), relationKind: 'related' }, actor: 'admin', scopeId: null }).data as { mappingId: string };
  return out.mappingId;
};
// The Top View pointer writes (#1656). `unlinkTopView` stages its own row once (only while none exists), so the version the harness
// reads and the version it sends agree on every call. The Revision is the mock's synthetic Layout (hash proved in @ap/menu-topview).
const TOPVIEW = { layoutId: 'sample-layout', revision: 'sha256:0cd25afbcf9beeb516b7d6c65b16d12ba648c688c70c8c0b2db994170e1ec0f5' };
const topViewSamples: Record<string, () => Record<string, unknown>> = {
  linkTopView: () => ({ modelId: A100, fromSoftwareId: null, ...TOPVIEW }),
  unlinkTopView: () => {
    const link = importHandler('linkTopView');
    const input = { modelId: A100, fromSoftwareId: A100_V1, ...TOPVIEW };
    if (link.version?.({ input, actor: 'admin', scopeId: null }) === '0') link.handle({ input, actor: 'admin', scopeId: null });
    return { modelId: A100, fromSoftwareId: A100_V1 };
  },
};
const conceptSamples: Record<string, () => Record<string, unknown>> = {
  conceptPropose: () => ({ modelId: A100, targetKind: 'module', target: { module: 'Chamber' }, canonicalLabel: unique('CONCEPT') }),
  conceptConfirm: () => ({ mappingId: stagedConcept() }),
  conceptReject: () => ({ mappingId: stagedConcept(), reason: '적합성 표본 기각' }),
};

export const logKnowledgeWriteSamples: Readonly<Record<string, () => Record<string, unknown>>> = Object.fromEntries(
  Object.entries({ ...catalogSamples, ...itemSamples, ...importSamples, ...specSamples, ...conceptSamples, ...topViewSamples }).map(([name, sample]) => [`logKnowledge.${name}`, sample]),
);
