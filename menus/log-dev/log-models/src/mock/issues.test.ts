import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyGlobal } from '@ap/contracts';
import { logModelsActionsMock as logLifecycleActionsMock, logLifecycleMock, ATTEMPT_ID, PROJECT_ID, ROUND_ID, REQUEST_ID, fixtureId, resetLifecycle } from './index';
import type { RoleId } from '@ap/mock-server';
import type { CursorPage, DiscussionComment, RequestDetail, RoundDetail, ValidationIssueDetail, ValidationIssueRow } from '../endpoints';

type Params = Record<string, unknown>;
const endpoint = (name: string) => logLifecycleMock.find(e => e.spec.id === `logLifecycle.${name}`)!;
const read = (name: string, params: Params, actor: RoleId = 'admin') => endpoint(name).handle({ params, context: emptyGlobal, equipment: [], actor });
const action = (name: string) => logLifecycleActionsMock.find(a => a.spec.id === `logLifecycle.${name}`)!;
const write = (name: string, input: Params, actor: RoleId = 'admin') => action(name).handle({ input, actor, scopeId: null });
beforeEach(resetLifecycle);
afterEach(() => { vi.restoreAllMocks(); });

describe('synthetic human validation records (#1808)', () => {
  it('registers without a rule, comments as another person and keeps Round and issue discussions apart', () => {
    const { id } = write('validationIssueRegister', { projectId: PROJECT_ID, firstRoundId: ROUND_ID, title: '규칙 밖 관찰', body: '설명' }).data as { id: string };
    write('validationIssueComment', { issueId: id, body: '다른 사람 댓글' }, 'engineer');
    write('roundDiscussionComment', { roundId: ROUND_ID, body: 'Round 의견' });
    const thread = read('validationIssueThread', { issueId: id }) as CursorPage<DiscussionComment>;
    expect(thread.rows).toMatchObject([{ authorActorId: 'engineer', body: '다른 사람 댓글' }]);
    const round = read('roundDiscussion', { roundId: ROUND_ID }) as CursorPage<DiscussionComment>;
    expect(round.rows.map(r => r.body)).not.toContain('다른 사람 댓글');
    expect((read('validationIssues', { roundId: ROUND_ID }) as CursorPage<ValidationIssueRow>).rows[0]).toMatchObject({ id, commentCount: 1, occurrenceCount: 0 });
    expect(read('validationIssueDetail', { issueId: id })).toMatchObject({ title: '규칙 밖 관찰', reporterActorId: 'admin', occurrences: { rows: [] } });
  });
  it('pages with bound cursors and refuses a cursor reused for another target or actor', () => {
    const issueId = fixtureId(1808501);
    for (let i = 0; i < 3; i++) write('validationIssueComment', { issueId, body: `댓글 ${i}` });
    const first = read('validationIssueThread', { issueId, limit: 2 }) as CursorPage<DiscussionComment>;
    expect(first.rows).toHaveLength(2);
    const second = read('validationIssueThread', { issueId, limit: 2, cursor: first.nextCursor }) as CursorPage<DiscussionComment>;
    expect(second.rows).toHaveLength(2);
    expect(second.nextCursor).toBeUndefined();
    expect(() => read('validationIssueHistory', { issueId, limit: 2, cursor: first.nextCursor })).toThrow('cursor_invalid');
    expect(() => read('validationIssueThread', { issueId, limit: 2, cursor: first.nextCursor }, 'engineer')).toThrow('cursor_invalid');
  });
  it('keeps the first page cutoff: a comment written after it is not on the old cursor’s pages, only on a fresh first page', () => {
    const issueId = fixtureId(1808501);
    for (let i = 0; i < 2; i++) write('validationIssueComment', { issueId, body: `댓글 ${i}` });
    const first = read('validationIssueThread', { issueId, limit: 2 }) as CursorPage<DiscussionComment>;
    write('validationIssueComment', { issueId, body: '첫 페이지 뒤 댓글' });
    const second = read('validationIssueThread', { issueId, limit: 2, cursor: first.nextCursor }) as CursorPage<DiscussionComment>;
    expect(second.rows.map(r => r.body)).toEqual(['댓글 1']);
    expect(second.nextCursor).toBeUndefined();
    const fresh = read('validationIssueThread', { issueId, limit: 2 }) as CursorPage<DiscussionComment>;
    const rest = read('validationIssueThread', { issueId, limit: 2, cursor: fresh.nextCursor }) as CursorPage<DiscussionComment>;
    expect([...fresh.rows, ...rest.rows].map(r => r.body).slice(-2)).toEqual(['댓글 1', '첫 페이지 뒤 댓글']);
  });
  it('continues the activity-ordered list by keyset at the cutoff: reordering or a new issue neither repeats nor skips rows', () => {
    const a = (write('validationIssueRegister', { projectId: PROJECT_ID, firstRoundId: ROUND_ID, title: 'A', body: '설명' }).data as { id: string }).id;
    const b = (write('validationIssueRegister', { projectId: PROJECT_ID, firstRoundId: ROUND_ID, title: 'B', body: '설명' }).data as { id: string }).id;
    const first = read('validationIssues', { roundId: ROUND_ID, limit: 1 }) as CursorPage<ValidationIssueRow>;
    expect(first.rows.map(r => r.id)).toEqual([b]);
    // A gains activity (now newest) and a new issue arrives: an offset cursor would repeat A's neighbour or skip a row.
    write('validationIssueComment', { issueId: a, body: '활동' });
    write('validationIssueRegister', { projectId: PROJECT_ID, firstRoundId: ROUND_ID, title: 'C', body: '설명' });
    const ids: string[] = [...first.rows.map(r => r.id)];
    let cursor = first.nextCursor;
    while (cursor) { const page = read('validationIssues', { roundId: ROUND_ID, limit: 1, cursor }) as CursorPage<ValidationIssueRow>; ids.push(...page.rows.map(r => r.id)); cursor = page.nextCursor; }
    expect(ids).toEqual([b, a, fixtureId(1808501)]);
    // The old snapshot's row reports its activity and counts as of the cutoff.
    const again = read('validationIssues', { roundId: ROUND_ID, limit: 1, cursor: first.nextCursor }) as CursorPage<ValidationIssueRow>;
    expect(again.rows[0]).toMatchObject({ id: a, commentCount: 0 });
    expect((read('validationIssues', { roundId: ROUND_ID }) as CursorPage<ValidationIssueRow>).rows.map(r => r.title).slice(0, 2)).toEqual(['C', 'A']);
  });
  it('expires a cursor after 30 minutes', () => {
    const issueId = fixtureId(1808501);
    for (let i = 0; i < 2; i++) write('validationIssueComment', { issueId, body: `댓글 ${i}` });
    const first = read('validationIssueThread', { issueId, limit: 1 }) as CursorPage<DiscussionComment>;
    const later = Date.now() + 31 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    expect(() => read('validationIssueThread', { issueId, limit: 1, cursor: first.nextCursor })).toThrow('cursor_invalid');
  });
  it('links a rule result once and adds only new in-sample evidence references', () => {
    const issueId = fixtureId(1808501);
    const input = { issueId, roundId: ROUND_ID, attemptId: ATTEMPT_ID, ruleResultId: fixtureId(502) };
    const first = write('validationIssueLinkOccurrence', input).data as { id: string; added: boolean };
    expect(first.added).toBe(true);
    expect(write('validationIssueLinkOccurrence', input).data).toEqual({ id: first.id, issueId, added: false });
    const ref = { fileRef: 's3://synthetic/sample-01.log', line: 185, fileSha256: 'a'.repeat(64) };
    expect(write('validationIssueLinkEvidence', { occurrenceId: first.id, refs: [ref] }).data).toEqual({ id: first.id, issueId, count: 1 });
    expect(write('validationIssueLinkEvidence', { occurrenceId: first.id, refs: [ref] }).data).toEqual({ id: first.id, issueId, count: 0 });
    expect(() => write('validationIssueLinkEvidence', { occurrenceId: first.id, refs: [{ ...ref, fileRef: 's3://synthetic/other.log' }] })).toThrow();
  });
  it('rejects oversize or empty prose instead of truncating it', () => {
    const validate = (name: string, input: Params) => action(name).validate?.(input) ?? [];
    expect(validate('validationIssueRegister', { projectId: PROJECT_ID, firstRoundId: ROUND_ID, title: '가'.repeat(201), body: '' })).toEqual([{ path: ['title'], code: 'too_long' }, { path: ['body'], code: 'required' }]);
    expect(validate('roundDiscussionComment', { roundId: ROUND_ID, body: '가'.repeat(4001) })).toEqual([{ path: ['body'], code: 'too_long' }]);
  });
  it('never changes machine results, verdicts or the Gate', () => {
    const before = JSON.stringify([read('roundDetail', { roundId: ROUND_ID }) as RoundDetail, read('requestDetail', { requestId: REQUEST_ID }) as RequestDetail, read('ruleResults', { attemptId: ATTEMPT_ID })]);
    const { id } = write('validationIssueRegister', { projectId: PROJECT_ID, firstRoundId: ROUND_ID, title: '관찰', body: '설명' }).data as { id: string };
    write('validationIssueLinkOccurrence', { issueId: id, roundId: ROUND_ID, attemptId: ATTEMPT_ID, ruleResultId: fixtureId(501) });
    write('roundDiscussionComment', { roundId: ROUND_ID, body: '의견' });
    expect(JSON.stringify([read('roundDetail', { roundId: ROUND_ID }), read('requestDetail', { requestId: REQUEST_ID }), read('ruleResults', { attemptId: ATTEMPT_ID })])).toBe(before);
    expect((read('validationIssueDetail', { issueId: id }) as ValidationIssueDetail).occurrences.rows).toHaveLength(1);
  });
});
