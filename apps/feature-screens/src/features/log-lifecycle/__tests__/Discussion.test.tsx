import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { Attempt, CursorPage, DiscussionComment, Presentation, Project, ReadState, RequestDetail, RoundDetail, RuleResult, ScreenProps, TableParts, ValidationIssueDetail, ValidationIssueRow, WriteResult } from '../contracts';
import { RoundScreen } from '../RoundScreen';

const ROUND = '00000000-0000-4000-8000-000000000003';
const ISSUE = '00000000-0000-4000-8000-000000000501';
const project = { id: 'project', model: { code: 'SYN-300' }, softwareLabel: '3.2.1' } as Project;
const attempt: Attempt = { id: 'attempt', attemptNo: 2, outcome: 'succeeded', verdict: 'fail', workerActorId: 'actor', manifestMatches: true, counts: { FAIL: 1 }, requiredUnchecked: 0, ruleCount: 1, startedAt: '', endedAt: '', ruleSetRevision: null, inputManifestDigest: '' };
const request = { id: 'request', roundId: ROUND, state: 'succeeded', attempts: [attempt] } as RequestDetail;
const sha = 'a'.repeat(64);
const rule: RuleResult = { id: 'rule-result', ruleId: 'SYN-R001', result: 'FAIL', required: true, expected: '종료 이벤트', observed: '종료 이벤트 없음', evidence: [{ fileRef: 'synthetic/sample-01.log', line: 7, fileSha256: sha, hasExcerpt: true }], hasExcerpt: true };
const round: RoundDetail = { id: ROUND, projectId: 'project', seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'synthetic', files: [{ fileRef: 'synthetic/sample-01.log', order: 1, sha256: sha }] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '1', reasons: [], decisions: { approved: { allowed: false, reasons: [] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: {} } };
const issueRow: ValidationIssueRow = { id: ISSUE, projectId: 'project', firstRoundId: ROUND, title: '합성 관찰 항목', reporterActorId: 'actor', createdAt: '2026-11-07T00:00:00Z', lastActivityAt: '2026-11-07T00:00:00Z', commentCount: 1, occurrenceCount: 1, roundCount: 1 };
const detail: ValidationIssueDetail = { ...issueRow, body: '합성 설명 본문', expected: null, actual: '합성 실제', repro: null, occurrences: { rows: [{ id: 'occ', roundId: ROUND, attemptId: 'attempt', ruleResultId: 'rule-result', linkerActorId: 'other-actor-id', createdAt: '2026-11-07T00:00:00Z', evidence: [{ fileRef: 'synthetic/sample-01.log', line: 7, fileSha256: sha }] }] } };
const comment = (id: string, body: string, author = 'other-actor-id'): DiscussionComment => ({ id, authorActorId: author, body, correctsCommentId: null, createdAt: '2026-11-07T00:00:00Z' });
function Table<T extends { id: string }>(p: TableParts<T>) { return <>{p.summary}<table aria-label={p.title}><tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}</tr>)}</tbody></table>{p.pagination}</>; }
const ui: Presentation = { table: Table, drawer: p => <section role="dialog" aria-label={String(p.title)}>{p.body}<button type="button" onClick={p.requestClose}>상세 닫기</button></section>, timeline: () => null, trust: () => null, sourceView: () => <p>합성 원본</p> };
type Read = unknown;
/** Marks a read state (status/denied) rather than data; RoundDetail itself has a `status` field. */
const state = (value: Partial<ReadState<unknown>>) => ({ readState: value });
type Options = { canContribute?: boolean; canLink?: boolean; reads?: Record<string, (params: Record<string, unknown>) => Read>; answers?: Record<string, (input: Record<string, unknown>) => Promise<WriteResult>> };
const ok = (data: Record<string, unknown>): WriteResult => ({ outcome: 'ok', data, version: null, fieldErrors: [] });
const page = <T,>(rows: T[], nextCursor?: string): CursorPage<T> => ({ rows, ...(nextCursor ? { nextCursor } : {}) });
const base: Record<string, (params: Record<string, unknown>) => Read> = {
  roundDetail: () => round, requests: () => ({ rows: [request], total: 1 }), requestDetail: () => request, ruleResults: () => ({ rows: [rule], total: 1 }),
  validationIssues: () => page([issueRow]), validationIssueDetail: () => detail, validationIssueThread: () => page([comment('c1', '항목 댓글 하나')]), validationIssueHistory: () => page([]),
  roundDiscussion: () => page([comment('r1', 'Round 전체 의견')]),
};
function setup(options: Options = {}) {
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const runs: { name: string; input: Record<string, unknown> }[] = [];
  function Host() {
    const [state, setState] = useState<Record<string, string>>({});
    const props: ScreenProps = {
      ui, actorId: 'actor', canProject: false, canRound: false, canGate: false, canContribute: options.canContribute ?? false, canLink: options.canLink ?? false, state, setSelection: vi.fn(),
      setState: patch => setState(previous => { const next = { ...previous }; for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete next[key]; else next[key] = value; } return next; }),
      api: {
        useRead: <T,>(name: string, params: Record<string, unknown>, enabled = true): ReadState<T> => {
          if (enabled) calls.push({ name, params });
          const value = (options.reads?.[name] ?? base[name])?.(params) ?? null;
          const shaped = value && typeof value === 'object' && 'readState' in value ? (value as { readState: Partial<ReadState<T>> }).readState : { status: 'done' as const, data: value as T };
          return { status: 'done', data: null, retry: vi.fn(), ...shaped } as ReadState<T>;
        },
        useAction: (name: string) => ({ pending: false, run: (input: Record<string, unknown>) => { runs.push({ name, input }); return options.answers?.[name]?.(input) ?? Promise.resolve(ok({ id: 'new' })); } }),
      },
    };
    return <RoundScreen {...props} project={project} roundId={ROUND} />;
  }
  return { ...render(<Host />), calls, runs };
}
afterEach(cleanup);
const tab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

it.each([
  ['a complete page', () => page([issueRow, { ...issueRow, id: 'b' }])],
  ['a page with more pages (101+ issues)', () => page(Array.from({ length: 100 }, (_, i) => ({ ...issueRow, id: `i${i}` })), 'next')],
  ['an empty page', () => page([])],
  ['a denied read', () => state({ status: 'error', denied: true, data: null })],
  ['a failed read', () => state({ status: 'error', data: null })],
  ['a loading read', () => state({ status: 'loading', data: null })],
] as const)('shows only «집계 불가» in the header for %s: page lengths are never a total (no server count yet)', (_, read) => {
  setup({ reads: { validationIssues: read } });
  expect(screen.getByRole('button', { name: '검증 항목으로 이동 · 검증 항목 집계 불가' })).toBeVisible();
  expect(screen.queryByText(/검증 항목 \d+건/)).toBeNull();
  expect(screen.queryByText(/건 이상/)).toBeNull();
});
it('moves keyboard focus to the issue table from the header', async () => {
  setup();
  screen.getByRole('button', { name: '검증 항목으로 이동 · 검증 항목 집계 불가' }).focus();
  await userEvent.setup().keyboard('{Enter}');
  expect(screen.getByRole('region', { name: '검증 항목' })).toHaveFocus();
  expect(within(screen.getByRole('table', { name: '검증 항목' })).getByText('합성 관찰 항목')).toBeVisible();
});
it('opens the issue drawer with description, reference-only evidence, its own thread and history', async () => {
  const t = setup();
  await userEvent.setup().click(screen.getByRole('button', { name: '합성 관찰 항목' }));
  const drawer = within(screen.getByRole('dialog', { name: '합성 관찰 항목' }));
  expect(drawer.getByText('합성 설명 본문')).toBeVisible();
  expect(drawer.getByText('synthetic/sample-01.log:7')).toBeVisible();
  expect(drawer.getByText('항목 댓글 하나')).toBeVisible();
  expect(drawer.getByText('정정 이력 없음')).toBeVisible();
  expect(drawer.queryByText('Round 전체 의견')).toBeNull();
  expect(t.calls.some(c => c.name === 'excerpt')).toBe(false);
  expect(drawer.queryByRole('form', { name: '항목 댓글' })).toBeNull();
});
it('pages a thread with «더 보기» using the server cursor', async () => {
  const t = setup({ reads: { validationIssueThread: p => p.cursor === 'c-2' ? page([comment('c2', '두 번째 페이지 댓글')]) : page([comment('c1', '첫 페이지 댓글')], 'c-2') } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '합성 관찰 항목' }));
  const thread = within(screen.getByRole('list', { name: '항목 댓글' }));
  await user.click(thread.getByRole('button', { name: '더 보기' }));
  expect(thread.getByText('첫 페이지 댓글')).toBeVisible();
  expect(thread.getByText('두 번째 페이지 댓글')).toBeVisible();
  expect(thread.queryByRole('button', { name: '더 보기' })).toBeNull();
  expect(t.calls.find(c => c.name === 'validationIssueThread' && c.params.cursor === 'c-2')?.params).toMatchObject({ issueId: ISSUE, limit: 50 });
});
it.each([['denied', state({ status: 'error', denied: true, data: null }), /읽기 권한이 없습니다/], ['hidden', null, /찾을 수 없거나 읽을 수 없습니다/]] as const)('shows no issue body when the detail read is %s', async (_, value, feedback) => {
  setup({ reads: { validationIssueDetail: () => value } });
  await userEvent.setup().click(screen.getByRole('button', { name: '합성 관찰 항목' }));
  const drawer = within(screen.getByRole('dialog'));
  expect(drawer.getByText(feedback)).toBeVisible();
  expect(drawer.queryByText('합성 설명 본문')).toBeNull();
});
it('keeps Round discussion separate from issue threads and offers no compose action without the capability', () => {
  const t = setup();
  tab('Round 토론');
  const list = within(screen.getByRole('list', { name: 'Round 전체 댓글' }));
  expect(list.getByText('Round 전체 의견')).toBeVisible();
  expect(screen.queryByText('항목 댓글 하나')).toBeNull();
  expect(screen.queryByRole('form', { name: 'Round 전체 댓글' })).toBeNull();
  expect(screen.queryByRole('button', { name: '검증 항목 등록' })).toBeNull();
  expect(t.calls.find(c => c.name === 'roundDiscussion')?.params).toMatchObject({ roundId: ROUND });
});
it('enforces the comment limit before submit and keeps the draft across tab visits', async () => {
  const t = setup({ canContribute: true });
  tab('Round 토론');
  const box = screen.getByLabelText('Round 전체 댓글 (필수)');
  fireEvent.change(box, { target: { value: '가'.repeat(4001) } });
  expect(screen.getByText(/4001 \/ 4000자 · 상한을 넘어/)).toBeVisible();
  expect(screen.getByRole('button', { name: '댓글 남기기' })).toBeDisabled();
  fireEvent.change(box, { target: { value: '합성 초안' } });
  tab('원본'); tab('Round 토론');
  expect(screen.getByLabelText('Round 전체 댓글 (필수)')).toHaveValue('합성 초안');
  await userEvent.setup().click(screen.getByRole('button', { name: '댓글 남기기' }));
  expect(t.runs).toEqual([{ name: 'roundDiscussionComment', input: { roundId: ROUND, body: '합성 초안' } }]);
  expect(await screen.findByText('댓글을 남겼습니다.')).toBeVisible();
  expect(screen.getByLabelText('Round 전체 댓글 (필수)')).toHaveValue('');
});
it('keeps the draft on a rejected comment and surfaces the server field error', async () => {
  setup({ canContribute: true, answers: { validationIssueComment: () => Promise.resolve({ outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['body'], code: 'secret_detected' }] }) } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '합성 관찰 항목' }));
  await user.type(screen.getByLabelText('항목 댓글 (필수)'), '토큰 같은 값');
  await user.click(screen.getByRole('button', { name: '댓글 남기기' }));
  expect(await screen.findByText('내용: 비밀 정보로 보이는 값은 저장할 수 없습니다.')).toBeVisible();
  expect(screen.getByLabelText('항목 댓글 (필수)')).toHaveValue('토큰 같은 값');
});
it('locks the draft after an unknown answer and resends the same request on retry', async () => {
  const retry = vi.fn(() => Promise.resolve(ok({ id: 'c9', issueId: ISSUE })));
  const t = setup({ canContribute: true, answers: { validationIssueComment: () => Promise.resolve({ outcome: 'unknown', data: null, version: null, fieldErrors: [], retry }) } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '합성 관찰 항목' }));
  await user.type(screen.getByLabelText('항목 댓글 (필수)'), '재시도 초안');
  await user.click(screen.getByRole('button', { name: '댓글 남기기' }));
  expect(await screen.findByText(/처리 결과를 확인하지 못했습니다/)).toBeVisible();
  expect(screen.getByLabelText('항목 댓글 (필수)')).toBeDisabled();
  expect(screen.getByRole('button', { name: '댓글 남기기' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '같은 요청 다시 확인' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(t.runs).toHaveLength(1);
  expect(await screen.findByText('댓글을 남겼습니다.')).toBeVisible();
});
it('registers an issue without a rule and opens its thread', async () => {
  const t = setup({ canContribute: true, answers: { validationIssueRegister: () => Promise.resolve(ok({ id: ISSUE })) } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '검증 항목 등록' }));
  const form = within(screen.getByRole('dialog', { name: '검증 항목 등록' }));
  expect(form.getByRole('button', { name: '검증 항목 등록' })).toBeDisabled();
  await user.type(form.getByLabelText('제목 (필수)'), '규칙 밖 관찰');
  await user.type(form.getByLabelText('설명 (필수)'), '자유 설명');
  await user.click(form.getByRole('button', { name: '검증 항목 등록' }));
  expect(t.runs).toEqual([{ name: 'validationIssueRegister', input: { projectId: 'project', firstRoundId: ROUND, title: '규칙 밖 관찰', body: '자유 설명' } }]);
  expect(await screen.findByRole('dialog', { name: '합성 관찰 항목' })).toBeVisible();
  expect(t.calls.some(c => c.name === 'validationIssueDetail' && c.params.issueId === ISSUE)).toBe(true);
});
const occurrenceOk = () => Promise.resolve(ok({ id: 'occ-new', issueId: ISSUE, added: true }));
const evidenceOk = () => Promise.resolve(ok({ id: 'occ-new', issueId: ISSUE, count: 1 }));
const occurrenceInput = { issueId: ISSUE, roundId: ROUND, attemptId: 'attempt', ruleResultId: 'rule-result' };
const evidenceInput = { occurrenceId: 'occ-new', refs: [{ fileRef: 'synthetic/sample-01.log', line: 7, fileSha256: sha }] };
async function openRuleAndPick(user: ReturnType<typeof userEvent.setup>, title = '합성 관찰 항목') {
  await user.click(screen.getByRole('button', { name: 'SYN-R001 상세 열기' }));
  const drawer = within(screen.getByRole('dialog'));
  await user.click(within(drawer.getByRole('list', { name: '연결할 검증 항목' })).getByRole('button', { name: new RegExp(title) }));
  return drawer;
}
it('links the selected rule result and its evidence locations by reference only, with the link capability', async () => {
  const t = setup({ canLink: true, answers: { validationIssueLinkOccurrence: occurrenceOk, validationIssueLinkEvidence: evidenceOk } });
  const user = userEvent.setup();
  const drawer = await openRuleAndPick(user);
  await user.click(drawer.getByRole('button', { name: '규칙 결과 연결' }));
  expect(await drawer.findByText(/규칙 결과를 연결했습니다. 근거 위치 1개 추가./)).toBeVisible();
  expect(t.runs).toEqual([{ name: 'validationIssueLinkOccurrence', input: occurrenceInput }, { name: 'validationIssueLinkEvidence', input: evidenceInput }]);
  expect(JSON.stringify(t.runs)).not.toContain('종료 이벤트 없음');
});
it('offers link candidates from the whole development project with «더 보기», including an issue only an earlier Round has', async () => {
  const earlier = { ...issueRow, id: 'earlier-issue', firstRoundId: 'earlier-round', title: '이전 Round 항목' };
  const t = setup({ canLink: true, reads: { validationIssues: p => p.projectId ? p.cursor === 'p-2' ? page([earlier]) : page(Array.from({ length: 50 }, (_, i) => ({ ...issueRow, id: `p${i}`, title: `후보 ${i}` })), 'p-2') : page([]) } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'SYN-R001 상세 열기' }));
  const drawer = within(screen.getByRole('dialog'));
  const list = within(drawer.getByRole('list', { name: '연결할 검증 항목' }));
  expect(list.queryByText('이전 Round 항목')).toBeNull();
  await user.click(list.getByRole('button', { name: '더 보기' }));
  await user.click(list.getByRole('button', { name: /이전 Round 항목/ }));
  expect(list.getByRole('button', { name: /이전 Round 항목/ })).toHaveAttribute('aria-pressed', 'true');
  expect(list.getByText(/다른 Round에서 등록/)).toBeVisible();
  await user.click(drawer.getByRole('button', { name: '규칙 결과 연결' }));
  expect(t.runs[0]).toEqual({ name: 'validationIssueLinkOccurrence', input: { ...occurrenceInput, issueId: 'earlier-issue' } });
  const reads = t.calls.filter(c => c.name === 'validationIssues' && c.params.projectId);
  expect(reads.every(c => c.params.projectId === 'project' && !('roundId' in c.params) && c.params.limit === 50)).toBe(true);
  expect(reads.some(c => c.params.cursor === 'p-2')).toBe(true);
});
it('continues to the selected evidence after the occurrence step succeeds on a same-request retry', async () => {
  const occurrenceRetry = vi.fn(occurrenceOk);
  const t = setup({ canLink: true, answers: { validationIssueLinkOccurrence: () => Promise.resolve({ outcome: 'unknown', data: null, version: null, fieldErrors: [], retry: occurrenceRetry }), validationIssueLinkEvidence: evidenceOk } });
  const user = userEvent.setup();
  const drawer = await openRuleAndPick(user);
  await user.click(drawer.getByRole('button', { name: '규칙 결과 연결' }));
  await user.click(await drawer.findByRole('button', { name: '같은 요청 다시 확인' }));
  expect(await drawer.findByText(/규칙 결과를 연결했습니다. 근거 위치 1개 추가./)).toBeVisible();
  expect(occurrenceRetry).toHaveBeenCalledTimes(1);
  expect(t.runs).toEqual([{ name: 'validationIssueLinkOccurrence', input: occurrenceInput }, { name: 'validationIssueLinkEvidence', input: evidenceInput }]);
});
it('reports the finished link after an evidence retry, even when the rule drawer was closed and reopened in between', async () => {
  const evidenceRetry = vi.fn(evidenceOk);
  const t = setup({ canLink: true, answers: { validationIssueLinkOccurrence: occurrenceOk, validationIssueLinkEvidence: () => Promise.resolve({ outcome: 'unknown', data: null, version: null, fieldErrors: [], retry: evidenceRetry }) } });
  const user = userEvent.setup();
  const drawer = await openRuleAndPick(user);
  await user.click(drawer.getByRole('button', { name: '규칙 결과 연결' }));
  await drawer.findByRole('button', { name: '같은 요청 다시 확인' });
  await user.click(drawer.getByRole('button', { name: '상세 닫기' }));
  await user.click(screen.getByRole('button', { name: 'SYN-R001 상세 열기' }));
  const reopened = within(screen.getByRole('dialog'));
  expect(reopened.getByRole('button', { name: '규칙 결과 연결' })).toBeDisabled();
  await user.click(reopened.getByRole('button', { name: '같은 요청 다시 확인' }));
  expect(await reopened.findByText(/규칙 결과를 연결했습니다. 근거 위치 1개 추가./)).toBeVisible();
  expect(evidenceRetry).toHaveBeenCalledTimes(1);
  expect(t.runs.map(r => r.name)).toEqual(['validationIssueLinkOccurrence', 'validationIssueLinkEvidence']);
});
it('drops later cursor pages when the first page is answered again after a comment, so the new comment is reachable', async () => {
  const comments = [comment('c1', '첫 댓글'), comment('c2', '둘째 댓글')];
  let generation = 1;
  // Each answer generation is a server snapshot: an old cursor never sees comments written after its first page.
  const thread = (p: Record<string, unknown>) => {
    const done = (data: CursorPage<DiscussionComment>) => state({ status: 'done', data, completedAt: generation });
    if (p.cursor === 'g1-2') return done(page(comments.slice(1, 2)));
    if (p.cursor === 'g2-2') return done(page(comments.slice(1)));
    return done(page(comments.slice(0, 1), `g${generation}-2`));
  };
  setup({ canContribute: true, reads: { validationIssueThread: thread }, answers: { validationIssueComment: input => { comments.push(comment('c3', String(input.body), 'actor')); generation = 2; return Promise.resolve(ok({ id: 'c3', issueId: ISSUE })); } } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '합성 관찰 항목' }));
  const list = () => within(screen.getByRole('list', { name: '항목 댓글' }));
  await user.click(list().getByRole('button', { name: '더 보기' }));
  expect(list().getByText('둘째 댓글')).toBeVisible();
  expect(list().queryByRole('button', { name: '더 보기' })).toBeNull();
  await user.type(screen.getByLabelText('항목 댓글 (필수)'), '셋째 댓글');
  await user.click(screen.getByRole('button', { name: '댓글 남기기' }));
  await user.click(await list().findByRole('button', { name: '더 보기' }));
  expect(list().getByText('셋째 댓글')).toBeVisible();
  expect(list().getAllByText('둘째 댓글')).toHaveLength(1);
});
it('offers a restart from the first page when a later cursor page fails', async () => {
  let failed = 0;
  setup({ reads: { validationIssueThread: p => p.cursor === 'c-2' ? (failed += 1, state({ status: 'error', data: null })) : page([comment('c1', '첫 댓글')], 'c-2') } });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '합성 관찰 항목' }));
  const list = within(screen.getByRole('list', { name: '항목 댓글' }));
  await user.click(list.getByRole('button', { name: '더 보기' }));
  expect(list.getByText(/다음 페이지를 읽지 못했습니다/)).toBeVisible();
  await user.click(list.getByRole('button', { name: '처음부터 다시 보기' }));
  expect(list.getByRole('button', { name: '더 보기' })).toBeVisible();
  expect(list.queryByText(/다음 페이지를 읽지 못했습니다/)).toBeNull();
  expect(failed).toBeGreaterThan(0);
});
it('omits the link section without the link capability', async () => {
  setup({ canContribute: true });
  await userEvent.setup().click(screen.getByRole('button', { name: 'SYN-R001 상세 열기' }));
  expect(within(screen.getByRole('dialog')).queryByText('검증 항목 연결')).toBeNull();
});
