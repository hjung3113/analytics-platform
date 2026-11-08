/** Synthetic metadata only; never imported by the production screen graph. */
export const DS = '14810000-0000-4000-8000-000000000001';
export const REV = '14810000-0000-4000-8000-000000000101';
export const BASE = '14810000-0000-4000-8000-000000000201';
export const DRAFT = '14810000-0000-4000-8000-000000000202';
export const SUITE = '14810000-0000-4000-8000-000000000301';
export const RUN = '14810000-0000-4000-8000-000000000401';
export const RUN2 = '14810000-0000-4000-8000-000000000402';
export const AT = '2026-11-07T09:00:00Z';
const owner = { id: 'admin', displayName: '김검토' };
const stale = { state: 'stale', reasons: ['spec_pin_changed'], unknown: ['rule_set', 'parser', 'engine_profile'] };
const hash = 'a'.repeat(64);
export const datasetRows = Array.from({ length: 40 }, (_, i) => ({ id: i ? `14810000-0000-4000-8000-${String(i + 1).padStart(12, '0')}` : DS, name: ['전원 복구 경계', '파일 경계 carryover', '시퀀스 정상 종료', '일부 Rule 미지원'][i % 4] + ` ${String(Math.floor(i / 4) + 1).padStart(2, '0')}`, purpose: '전원 복구와 파일 경계에서 규칙 결과가 기대와 일치하는지 반복 확인합니다.', owner, shareScope: 'workspace', modelIds: [], scenarioTags: [i % 2 ? 'exception' : 'normal', 'regression'], status: 'active', synthetic: true, revisionCount: 1, latestRevisionSeq: 3, version: '1', createdAt: AT, updatedAt: AT }));
export const baselineRows = [
  { id: DRAFT, datasetRevisionId: REV, seq: 3, status: 'draft', profilePin: { ruleSetRevision: 'rs-13', parserVersion: 'p4', engineProfileRef: 'ep-8' }, expectationCount: 6, scopeCount: 6, hasParserGolden: false, author: owner, approvedBy: null as null | typeof owner, approvedAt: null as string | null, supersededAt: null as string | null, version: '1', createdAt: AT, updatedAt: AT, stale: null as null | typeof stale },
  { id: BASE, datasetRevisionId: REV, seq: 2, status: 'approved', profilePin: { ruleSetRevision: 'rs-12', parserVersion: 'p4', engineProfileRef: 'ep-8' }, expectationCount: 6, scopeCount: 6, hasParserGolden: false, author: owner, approvedBy: owner, approvedAt: AT, supersededAt: null as string | null, version: '1', createdAt: AT, updatedAt: AT, stale },
];
export const expectations = ['PASS', 'PASS', 'FAIL', 'PASS', 'EXPECTED_UNSUPPORTED', 'PASS'].map((expected, i) => ({ ruleId: `R-0${i + 1}`, expected, evidence: [{ fileRef: 'synthetic/power-start.log', line: (i + 1) * 10 }], ...(i === 2 ? { exception: { reason: '알려진 종료 누락', scope: '합성 시나리오' } } : {}) }));
export const events: Record<string, { id: string; kind: string; before: unknown; after: unknown; reason: string | null; actor: typeof owner; selfApproved: boolean; at: string }[]> = Object.fromEntries(baselineRows.map(b => [b.id, [{ id: `${b.id}-created`, kind: 'created', before: null, after: { status: 'draft', seq: b.seq }, reason: '기대 결과 초안 작성', actor: owner, selfApproved: false, at: AT }]]));
export const revisionIdFor = (datasetId: string) => datasetId === DS ? REV : `14810001-0000-4000-8000-${datasetId.slice(-12)}`;
export function datasetDetail(id: string) {
  const row = datasetRows.find(r => r.id === id);
  return row ? { ...row, revisions: [{ id: revisionIdFor(id), seq: 3, sourceOwner: 'synthetic', fileCount: 2, digest: hash, inputMeta: { encoding: 'UTF-8', format: '표준 로그' }, note: null, createdBy: owner, createdAt: AT, availability: id === datasetRows[1]!.id ? 'unavailable' : 'available', availabilityChecked: true, files: ['power-start.log', 'carryover.log'].map((name, i) => ({ fileRef: `synthetic/${name}`, order: i + 1, sha256: hash, state: id === datasetRows[1]!.id ? 'absent' : 'match' })), baselines: { draftCount: id === DS ? baselineRows.filter(b => b.status === 'draft').length : 0, supersededCount: id === DS ? baselineRows.filter(b => b.status === 'superseded').length : 0, approved: id === DS && baselineRows.some(b => b.status === 'approved') ? { id: baselineRows.find(b => b.status === 'approved')!.id, seq: baselineRows.find(b => b.status === 'approved')!.seq, stale } : null } }] } : null;
}
export function baselineDetail(id: string) {
  const b = baselineRows.find(b => b.id === id);
  return b ? { ...b, datasetId: DS, revisionSeq: 3, expectedScope: expectations.map(e => e.ruleId), expectations, parserGoldenRef: null, events: events[id] ?? [] } : null;
}
export const suite = { id: SUITE, name: '전원 복구 회귀', itemCount: 1, engineProfileRef: 'ep-8', lastRunAt: AT, createdBy: owner, version: '1', createdAt: AT, updatedAt: AT };
export const suiteDetail = () => ({ ...suite, requiredPin: {}, items: [{ ordinal: 1, restricted: false, datasetId: DS, datasetName: datasetRows[0]!.name, datasetRevisionId: REV, baselineId: BASE, resolvesTo: { ok: true, revisionId: REV, revisionSeq: 3, baselineId: BASE, baselineSeq: 2 } }] });
export const FAILED_RUN = '14810000-0000-4000-8000-000000000403';
export const runs = [RUN, RUN2, FAILED_RUN].map(id => ({ id, suiteId: SUITE, requestedBy: owner, engineProfileRef: 'ep-8', requiredPin: {}, createdAt: AT, state: id === FAILED_RUN ? 'failed' : 'succeeded', counts: { queued: 0, claimed: 0, succeeded: id === FAILED_RUN ? 0 : 1, failed: id === FAILED_RUN ? 1 : 0, cancelled: 0, expired: 0 }, items: [{ ordinal: 1, restricted: false, datasetId: DS, datasetName: datasetRows[0]!.name, datasetRevisionId: REV, revisionSeq: 3, baselineId: BASE, baselineSeq: 2, sampleManifestDigest: hash, baselineDigest: hash, baselineStale: stale, requestId: `14810000-0000-4000-8000-000000000501`, requestState: id === FAILED_RUN ? 'failed' : 'succeeded', attemptCount: 1, latestVerdict: id === FAILED_RUN ? null : 'incomplete' }] }));
// A second Suite has a server-sized history; the confirmed default Suite stays compact.
export const suiteB = { ...suite, id: '14810000-0000-4000-8000-000000000302', name: '전원 복구 장기 회귀', engineProfileRef: 'ep-9' };
export const suiteDetailB = () => ({ ...suiteDetail(), ...suiteB });
for (let i = 0; i < 27; i++) {
  const run = structuredClone(runs[0]!);
  run.id = `14810000-0000-4000-8000-${String(700 + i).padStart(12, '0')}`;
  run.suiteId = suiteB.id;
  run.engineProfileRef = suiteB.engineProfileRef;
  run.createdAt = new Date(Date.parse(AT) - i * 60000).toISOString();
  runs.push(run);
}
export type MockLabel = { label: string; reason: string; actorId: string; at: string };
export const labels: Record<string, MockLabel[]> = {};
export function comparison(runId: string) {
  const run = runs.find(r => r.id === runId);
  if (!run) return null;
  const rows = expectations.map((e, i) => ({ ordinal: 1, ruleId: e.ruleId, expected: e.expected, observed: ['FAIL', 'WARN', 'PASS', 'NOT_CHECKED', 'NOT_CHECKED', null][i] ?? null, required: i === 3 || i === 5, classification: ['regressed', 'regressed', 'fixed', 'not_comparable', 'unchanged', 'missing'][i]!, label: labels[`${runId}:${e.ruleId}`]?.at(-1) ?? null }));
  return { run, items: [{ ordinal: 1, restricted: false, datasetId: DS, datasetName: datasetRows[0]!.name, datasetRevisionId: REV, revisionSeq: 3, baselineId: BASE, baselineSeq: 2, baselineStale: stale, requestId: run.items[0]!.requestId, requestState: run.state, observed: run.state !== 'succeeded' ? null : { attemptId: '14810000-0000-4000-8000-000000000601', attemptNo: 1, ruleSetRevision: 'rs-13' }, counts: { regressed: run.state === 'succeeded' ? 2 : 0, new: 0, fixed: run.state === 'succeeded' ? 1 : 0, not_comparable: run.state === 'succeeded' ? 1 : 0, missing: run.state === 'succeeded' ? 1 : 0, unchanged: run.state === 'succeeded' ? 1 : 0 }, coverage: run.state !== 'succeeded' ? null : { scopeCount: 6, executedCount: 3, notExecutedCount: 3, ratio: 0.5, executed: ['R-01', 'R-02', 'R-03'], notExecuted: [{ ruleId: 'R-04', reason: 'not_checked', required: true }, { ruleId: 'R-06', reason: 'missing', required: null }, { ruleId: 'R-05', reason: 'not_checked', required: false }], requiredGapCount: 1, outsideScope: [] }, labelCount: Object.entries(labels).filter(([k]) => k.startsWith(`${runId}:`)).reduce((n, [, v]) => n + v.length, 0) }], rules: { rows: run.state !== 'succeeded' ? [] : rows, total: run.state !== 'succeeded' ? 0 : rows.length }, labels: { total: Object.values(labels).reduce((n, v) => n + v.length, 0) } };
}
