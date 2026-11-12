import { beforeEach, describe, expect, it } from 'vitest';
import { emptyGlobal, type HierarchyNode, type HierarchyPage } from '@ap/contracts';
import { logLifecycleActionsMock, logLifecycleMock, PROJECT_ID, ROUND_ID, REQUEST_ID, ATTEMPT_ID, resetLifecycle, fixtureId } from './index';
import type { RequestDetail, RuleResult, RoundDetail } from '../endpoints';
import type { PageSort } from '@ap/contracts';

type Params = Record<string, unknown>;
const read = (name: string, params: Params = {}) => logLifecycleMock.find(e => e.spec.id === `logLifecycle.${name}`)?.handle({ params, context: emptyGlobal, equipment: [], actor: 'admin' });
const write = (name: string, input: Params) => logLifecycleActionsMock.find(a => a.spec.id === `logLifecycle.${name}`)?.handle({ input, actor: 'admin', scopeId: null });
beforeEach(resetLifecycle);
describe('synthetic lifecycle screen fixture', () => {
  it('serves the assembled hierarchy with four levels, two paths, unassigned models and paging', () => {
    const children = (parentId: string | null, extra: Params = {}) => read('hierarchy', { op: 'children', parentId, ...extra }) as HierarchyPage;
    const vendor = `v/${fixtureId(11)}`;
    const processes = children(vendor).nodes;
    expect(processes).toHaveLength(3);
    expect(processes.find(n => n.id === `${vendor}/p/none`)?.label).toBe('미분류');
    expect(read('projectDetail', { projectId: PROJECT_ID })).toMatchObject({ softwareLabel: '3.2.1' });
    const p = children(vendor, { limit: 1 });
    expect(children(vendor, { limit: 1, cursor: p.nextCursor }).nodes[0]?.id).not.toBe(p.nodes[0]?.id);
    const model = children(`${vendor}/p/${fixtureId(21)}`).nodes[0]!;
    expect(model.target).toEqual({ menuId: 'log-model-project', params: { projectId: PROJECT_ID }, page: { node: model.id } });
    expect(children(`${vendor}/p/${fixtureId(23)}`).nodes[0]?.id).not.toBe(model.id);
    const sw = children(model.id).nodes[0]!;
    expect(sw).toMatchObject({ kind: 'software', hasChildren: false, target: { ...model.target, page: { node: sw.id } } });
    expect((read('hierarchy', { op: 'ancestors', nodeId: sw.id }) as HierarchyNode[]).map(n => n.id)).toEqual([vendor, model.parentId, model.id]);
    expect(children(`${vendor}/p/none`).nodes[0]).toMatchObject({ label: '연마 모델', target: { menuId: 'log-models', page: { vendorId: fixtureId(11), processId: 'none', modelId: fixtureId(3) } } });
    expect((read('hierarchy', { op: 'search', query: '식각' }) as HierarchyPage).nodes.filter(n => n.kind === 'model')).toHaveLength(2);
    expect(read('hierarchy', { op: 'ancestors', nodeId: 'missing' })).toEqual({ failure: 'deleted' });
  });
  it('pages and filters rule results without exposing excerpt bodies', () => {
    const data = read('ruleResults', { attemptId: ATTEMPT_ID, results: ['ERROR'], pageSize: 1, sorting: [{ id: 'ruleId', desc: false }] satisfies PageSort[] });
    expect(data).toMatchObject({ total: 1, rows: [{ ruleId: 'TIME-001', hasExcerpt: true }] });
    expect(JSON.stringify(data)).not.toContain('SYNTHETIC FIXTURE');
  });
  it('serves evidence states per original index with both axes and no body text', () => {
    const rows = (n: number) => (read('evidenceStates', { ruleResultId: fixtureId(501 + n) }) as { rows: { evidenceIndex: number; excerptState: string; sourceState: string }[] }).rows;
    expect(rows(0).map(r => [r.evidenceIndex, r.excerptState, r.sourceState])).toEqual([[0, 'not_loaded', 'not_checked'], [1, 'not_submitted', 'not_checked']]);
    expect(rows(1).map(r => [r.excerptState, r.sourceState])).toEqual([['unknown', 'hash_mismatch']]);
    expect(rows(2).map(r => [r.excerptState, r.sourceState])).toEqual([['no_permission', 'no_permission']]);
    expect(read('evidenceStates', { ruleResultId: fixtureId(999) })).toBeNull();
    expect(JSON.stringify(rows(0))).not.toContain('SYNTHETIC FIXTURE');
  });
  it('records a human rejection independently from the machine verdict', () => {
    const saved = write('gateDecide', { roundId: ROUND_ID, targetStage: 'beta', decision: 'rejected', reason: '필수 규칙 재확인' });
    expect(saved?.version).toBe('2');
    expect(read('projectDetail', { projectId: PROJECT_ID })).toMatchObject({ stage: 'alpha', gate: { latest: { decision: 'rejected' } } });
    expect(read('requestDetail', { requestId: REQUEST_ID })).toMatchObject({ latestVerdict: 'incomplete' });
  });
  it('registers and cancels a queued request while preserving its reason', () => {
    const saved = write('requestCreate', { roundId: ROUND_ID, priority: 1, immediate: false });
    const id = saved?.data.requestId;
    expect(read('requestDetail', { requestId: id })).toMatchObject({ state: 'queued', attempts: [], roundId: ROUND_ID });
    write('requestCancel', { id, reason: '샘플 교체' });
    expect(read('requestDetail', { requestId: id })).toMatchObject({ state: 'cancelled', cancelReason: '샘플 교체', version: '2' });
  });
});


it('keeps the real Gate basis identities when a new queued request has no attempt', () => {
  const before = read('roundDetail', { roundId: ROUND_ID }) as RoundDetail;
  const created = write('requestCreate', { roundId: ROUND_ID, priority: 1, immediate: false });
  const after = read('roundDetail', { roundId: ROUND_ID }) as RoundDetail;
  expect(after.gateAvailability.basis).toMatchObject({
    version: 1,
    decisiveAttemptId: fixtureId(1778401),
    decisiveVerdict: 'fail',
    attempts: [
      { attemptId: ATTEMPT_ID, requestId: REQUEST_ID, attemptNo: 1, verdict: 'incomplete', ruleSetRevision: 'synthetic-v1', inputManifestDigest: 'a'.repeat(64), endedAt: '2026-11-07T00:30:00Z' },
      { attemptId: fixtureId(1778401), requestId: fixtureId(1778301), verdict: 'fail' },
    ],
    evidenceLinks: [],
  });
  expect(after.gateAvailability.basis).toEqual(before.gateAvailability.basis);
  const basis = after.gateAvailability.basis as { decisiveAttemptId: string; attempts: { attemptId: string; requestId: string }[] };
  const reference = basis.attempts.find(a => a.attemptId === basis.decisiveAttemptId)!;
  const detail = read('requestDetail', { requestId: reference.requestId }) as RequestDetail;
  expect(detail.attempts.find(a => a.id === reference.attemptId)).toMatchObject({ outcome: 'succeeded', counts: { FAIL: 1 }, ruleCount: 5 });
  const failing = read('ruleResults', { attemptId: reference.attemptId, results: ['FAIL'], page: 0, pageSize: 25 }) as { rows: RuleResult[]; total: number };
  expect(failing).toMatchObject({ total: 1, rows: [{ ruleId: 'RULE-005', result: 'FAIL' }] });
  expect(read('requestDetail', { requestId: created?.data.requestId })).toMatchObject({ state: 'queued', attempts: [] });
});
