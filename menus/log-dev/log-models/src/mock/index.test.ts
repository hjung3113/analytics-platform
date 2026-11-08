import { beforeEach, describe, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { logLifecycleActionsMock, logLifecycleMock, PROJECT_ID, ROUND_ID, REQUEST_ID, ATTEMPT_ID, resetLifecycle } from './index';
import type { PageSort } from '@ap/contracts';

type Params = Record<string, unknown>;
const read = (name: string, params: Params = {}) => logLifecycleMock.find(e => e.spec.id === `logLifecycle.${name}`)?.handle({ params, context: emptyGlobal, equipment: [], actor: 'admin' });
const write = (name: string, input: Params) => logLifecycleActionsMock.find(a => a.spec.id === `logLifecycle.${name}`)?.handle({ input, actor: 'admin', scopeId: null });
beforeEach(resetLifecycle);
describe('synthetic lifecycle screen fixture', () => {
  it('pages and filters rule results without exposing excerpt bodies', () => {
    const data = read('ruleResults', { attemptId: ATTEMPT_ID, results: ['ERROR'], pageSize: 1, sorting: [{ id: 'ruleId', desc: false }] satisfies PageSort[] });
    expect(data).toMatchObject({ total: 1, rows: [{ ruleId: 'TIME-001', hasExcerpt: true }] });
    expect(JSON.stringify(data)).not.toContain('SYNTHETIC FIXTURE');
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
