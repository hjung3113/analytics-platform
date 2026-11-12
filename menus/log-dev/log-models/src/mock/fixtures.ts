/** Synthetic fixture only. No Validator integration or real equipment data. */
import type { Model, Project, ProjectEvent, RoundDetail, RequestDetail, RuleResult } from '../endpoints';
export const fixtureId = (n: number) => `14470000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const PROJECT_ID = fixtureId(101), ROUND_ID = fixtureId(201), REQUEST_ID = fixtureId(301), ATTEMPT_ID = fixtureId(401);
const at = '2026-11-07T00:30:00Z', sha = 'a'.repeat(64);
export const models: Model[] = [
  { id: fixtureId(1), code: 'ETCH-300', name: '식각 모델', vendorName: '한빛설비', vendorId: fixtureId(11), processes: [{ id: fixtureId(21), name: '식각' }], updatedAt: at, validation: 'incomplete', pendingRequests: 0, gateDecision: null, project: { projectId: PROJECT_ID, stage: 'alpha', latestRound: { id: ROUND_ID, seq: 3, status: 'open' } } },
  { id: fixtureId(2), code: 'CLEAN-90', name: '세정 모델', vendorName: '다온장비', vendorId: fixtureId(12), processes: [{ id: fixtureId(22), name: '세정' }], updatedAt: at, validation: 'none', pendingRequests: 0, gateDecision: null, project: null },
];
export const projects: Project[] = [{ id: PROJECT_ID, modelId: fixtureId(1), model: { code: 'ETCH-300', name: '식각 모델', vendorName: '한빛설비' }, softwareId: fixtureId(31), softwareLabel: '3.2.1', kind: 'new', stage: 'alpha', owner: { id: fixtureId(41), displayName: '김개발' }, targetDate: '2026-11-20', nextStages: ['beta', 'cancelled'], reopenTo: null, openRound: { id: ROUND_ID, seq: 3 }, version: '1', gateTarget: 'beta', gate: { latest: null } }];
export const rounds: RoundDetail[] = [{ id: ROUND_ID, projectId: PROJECT_ID, seq: 3, stage: 'alpha', status: 'open', sampleManifestDigest: sha, specPin: null, note: '합성 fixture', version: '1', createdAt: at, sampleSet: { sourceOwner: 'synthetic-team', files: [{ fileRef: 's3://synthetic/sample-01.log', order: 1, sha256: sha }] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '1', reasons: [], decisions: { approved: { allowed: false, reasons: ['verdict_not_pass'] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: { decisiveVerdict: 'incomplete', sampleManifestDigest: sha, specPin: null } } }];
export const requests: RequestDetail[] = [{ id: REQUEST_ID, roundId: ROUND_ID, projectId: PROJECT_ID, modelId: fixtureId(1), modelCode: 'ETCH-300', softwareLabel: '3.2.1', roundSeq: 3, priority: 2, immediate: true, state: 'succeeded', attemptCount: 1, maxAttempts: 3, leaseExpiresAt: null, lastHeartbeatAt: at, requestedBy: { id: fixtureId(41), displayName: '김개발' }, createdAt: at, endedAt: at, latestVerdict: 'incomplete', version: '1', cancelReason: null, attempts: [{ id: ATTEMPT_ID, attemptNo: 1, outcome: 'succeeded', workerActorId: fixtureId(51), verdict: 'incomplete', manifestMatches: true, counts: { ERROR: 1, NOT_CHECKED: 1, PASS: 1 }, requiredUnchecked: 2, ruleCount: 3, startedAt: at, endedAt: at, ruleSetRevision: 'synthetic-v1', ruleSet: { state: 'matched', ruleSetKey: 'core', revision: 'synthetic-v1', isCurrent: true, status: 'active' }, inputManifestDigest: sha, opinionCount: 0 }] }];
export const rules: RuleResult[] = ['ERROR', 'NOT_CHECKED', 'PASS'].map((result, i) => ({ id: fixtureId(501 + i), ruleId: ['TIME-001', 'SEQ-002', 'HEAD-005'][i] ?? '', result, required: true, expected: '이벤트 순서와 해석 형식 일치', observed: result === 'PASS' ? '일치' : '미검증', evidence: [{ fileRef: 's3://synthetic/sample-01.log', line: 184 + i, fileSha256: sha, hasExcerpt: true }], hasExcerpt: true, opinion: null }));
export const events: (ProjectEvent & { projectId: string })[] = [{ id: fixtureId(601), projectId: PROJECT_ID, kind: 'created', actor: { id: fixtureId(41), displayName: '김개발' }, at, before: null, after: { stage: 'registered' }, reason: null }];
models.push({ ...structuredClone(models[0]!), id: fixtureId(3), code: 'CMP-120', name: '연마 모델', processes: [], validation: 'none', pendingRequests: 0, project: { projectId: fixtureId(102), stage: 'cancelled', latestRound: null } });
models[0]!.processes.push({ id: fixtureId(23), name: '박막' });
projects.push({ ...structuredClone(projects[0]!), id: fixtureId(102), modelId: fixtureId(3), model: { code: 'CMP-120', name: '연마 모델', vendorName: '한빛설비' }, stage: 'cancelled', nextStages: [], reopenTo: 'alpha', gateTarget: null, openRound: null });
/** A second completed request exercises independent opinion reads with neutral synthetic values. */
export const OPINION_REQUEST_ID = fixtureId(1778301), OPINION_ATTEMPT_ID = fixtureId(1778401);
requests.push({ ...structuredClone(requests[0]!), id: OPINION_REQUEST_ID, createdAt: '2026-11-07T00:35:00Z', endedAt: '2026-11-07T00:35:00Z', latestVerdict: 'fail', attempts: [{ ...structuredClone(requests[0]!.attempts[0]!), id: OPINION_ATTEMPT_ID, verdict: 'fail', opinionCount: 7, endedAt: '2026-11-07T00:35:00Z', counts: { ERROR: 1, PASS: 3, FAIL: 1 }, requiredUnchecked: 1, ruleCount: 5 }] });
const initial = structuredClone({ models, projects, rounds, requests, rules, events });
export function resetLifecycle() { models.splice(0, models.length, ...structuredClone(initial.models)); projects.splice(0, projects.length, ...structuredClone(initial.projects)); rounds.splice(0, rounds.length, ...structuredClone(initial.rounds)); requests.splice(0, requests.length, ...structuredClone(initial.requests)); rules.splice(0, rules.length, ...structuredClone(initial.rules)); events.splice(0, events.length, ...structuredClone(initial.events)); }

/** Each conformance request gets independent targets; no successful write consumes another test's baseline row. */
export function stageLifecycleFixture(options: { withoutProject?: boolean; noOpenRound?: boolean; cancelled?: boolean } = {}) {
  const modelId = crypto.randomUUID(), projectId = crypto.randomUUID(), roundId = crypto.randomUUID(), requestId = crypto.randomUUID();
  const m = { ...structuredClone(models[0]!), id: modelId, code: `SYNTH-${modelId.slice(0, 8)}`, project: options.withoutProject ? null : { projectId, stage: options.cancelled ? 'cancelled' : 'alpha', latestRound: null }, validation: 'none', pendingRequests: 0 };
  models.push(m);
  if (options.withoutProject) return { modelId, projectId, roundId, requestId };
  const p: Project = { ...structuredClone(projects[0]!), id: projectId, modelId, version: '1', stage: options.cancelled ? 'cancelled' : 'alpha', nextStages: options.cancelled ? [] : ['beta', 'cancelled'], reopenTo: options.cancelled ? 'alpha' : null, gateTarget: options.cancelled ? null : 'beta', gate: { latest: null }, openRound: options.noOpenRound || options.cancelled ? null : { id: roundId, seq: 1 } };
  projects.push(p);
  if (options.noOpenRound || options.cancelled) return { modelId, projectId, roundId, requestId };
  const r = { ...structuredClone(rounds[0]!), id: roundId, projectId, seq: 1, version: '1', stage: 'alpha', status: 'open', gateDecisions: [] };
  rounds.push(r);
  requests.push({ ...structuredClone(requests[0]!), id: requestId, modelId, projectId, roundId, roundSeq: 1, version: '1', state: 'queued', attempts: [], attemptCount: 0, latestVerdict: null });
  return { modelId, projectId, roundId, requestId };
}
