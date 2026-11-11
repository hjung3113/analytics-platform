import { beforeEach, expect, it } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { logLifecycleMock, ATTEMPT_ID, REQUEST_ID, fixtureId, resetLifecycle } from './index';
import { endpoints } from '../endpoints';
import type { RequestDetail, RuleResult } from '../endpoints';
const read = (name: string, params: Record<string, unknown> = {}) => logLifecycleMock.find(e => e.spec.id === `logLifecycle.${name}`)?.handle({ params, context: emptyGlobal, equipment: [], actor: 'admin' });
const attemptId = fixtureId(1778401);
beforeEach(resetLifecycle);
it('declares opinion read parameters and the independent rule filter', () => {
  expect(endpoints.opinions?.paramKeys).toEqual({ attemptId: true, ruleResultId: true, itemKey: true, unlinked: true, page: true, pageSize: true });
  expect(endpoints.opinionScale?.menuId).toBe('log-validation-requests');
  expect(endpoints.ruleResults?.paramKeys).toHaveProperty('opinionGrade', true);
});
it('serves neutral ordered values and all cell states without altering the original attempt', () => {
  expect(read('opinionScale')).toEqual({ grades: [1, 2, 3, 4].map(n => ({ key: `g${n}`, label: `등급 ${n}` })), marks: [1, 2].map(n => ({ key: `m${n}`, label: `표식 ${n}` })) });
  const data = read('ruleResults', { attemptId }) as { rows: RuleResult[]; total: number };
  expect(data.total).toBe(5);
  expect(data.rows[0]?.opinion).toBeNull();
  expect(data.rows[1]?.opinion).toMatchObject({ grade: { key: 'g1' }, mark: null, hasNote: false });
  expect(data.rows[2]?.opinion).toMatchObject({ grade: { key: 'g2' }, mark: { key: 'm1' }, hasNote: true, count: 2 });
  expect(data.rows[3]?.opinion).toMatchObject({ grade: { key: 'g_retired', label: null } });
  expect(data.rows[4]).toMatchObject({ result: 'FAIL', opinion: { grade: { key: 'g4' } } });
  expect(read('requestDetail', { requestId: REQUEST_ID })).toMatchObject({ latestVerdict: 'incomplete', attempts: [{ opinionCount: 0 }] });
  expect(read('ruleResults', { attemptId: ATTEMPT_ID })).toMatchObject({ total: 3, rows: [{ opinion: null }, { opinion: null }, { opinion: null }] });
});
it.each(['g2', 'none'])('filters %s before paging without changing verdict/counts', opinionGrade => {
  const before = read('requestDetail', { requestId: fixtureId(1778301) }) as RequestDetail;
  expect(read('ruleResults', { attemptId, opinionGrade, page: 0, pageSize: 1 })).toMatchObject({ total: 1, rows: [opinionGrade === 'none' ? { opinion: null } : { opinion: { grade: { key: opinionGrade } } }] });
  expect(read('ruleResults', { attemptId, opinionGrade, results: ['ERROR'] })).toMatchObject({ total: opinionGrade === 'none' ? 1 : 0 });
  expect(read('requestDetail', { requestId: before.id })).toEqual(before);
  expect(before).toMatchObject({ latestVerdict: 'fail', attempts: [{ verdict: 'fail', ruleCount: 5, counts: { ERROR: 1, PASS: 3, FAIL: 1 } }] });
});
it('pages history newest first by either item key or rule result, keeping text out of lists', () => {
  const params = { attemptId, itemKey: 'RULE-003' };
  const data = read('opinions', params) as { rows: { at: string; note: string; id: string }[]; total: number };
  expect(data.total).toBe(2);
  expect(data.rows[0]!.at > data.rows[1]!.at).toBe(true);
  expect(data.rows[0]?.note).toContain('<sample>');
  expect(read('opinions', { attemptId, ruleResultId: fixtureId(177803) })).toEqual(data);
  expect(read('opinions', { ...params, page: 1, pageSize: 1 })).toEqual({ rows: [data.rows[1]], total: 2 });
  const unlinked = read('opinions', { attemptId, unlinked: true });
  expect(unlinked).toMatchObject({ total: 2, rows: [{ itemKey: 'ITEM-006', hasNote: true }, { itemKey: 'ITEM-007', hasNote: false }] });
  expect(JSON.stringify(unlinked)).not.toContain('note');
  expect(JSON.stringify(read('opinions', { attemptId }))).not.toContain('note');
  expect(JSON.stringify(read('ruleResults', { attemptId }))).not.toContain('<sample>');
  expect(read('opinions', { attemptId, itemKey: 'ITEM-006' })).toMatchObject({ rows: [{ ruleResultId: null, evidence: [expect.objectContaining({ line: 186 })], inputRevision: 'r12', producer: 'model-x/p3' }] });
  expect(read('opinions', { attemptId: ATTEMPT_ID, unlinked: true })).toEqual({ rows: [], total: 0 });
});
it('serves the same two shapes as the server: summary rows without an item filter, bodies only for an item history', () => {
  const keys = (rows: object[]) => rows.map(r => Object.keys(r).sort());
  const summaryKeys = ['at', 'count', 'grade', 'hasNote', 'itemKey', 'mark'];
  const general = read('opinions', { attemptId }) as { rows: object[] };
  const unlinked = read('opinions', { attemptId, unlinked: true }) as { rows: object[] };
  for (const k of [...keys(general.rows), ...keys(unlinked.rows)]) expect(k).toEqual(summaryKeys);
  const history = read('opinions', { attemptId, itemKey: 'RULE-003' }) as { rows: object[] };
  for (const k of keys(history.rows)) expect(k).toEqual(['at', 'author', 'evidence', 'grade', 'id', 'inputRevision', 'itemKey', 'mark', 'note', 'producer', 'ruleResultId']);
});
