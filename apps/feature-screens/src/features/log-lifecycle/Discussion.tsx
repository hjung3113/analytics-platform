import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, Checkbox, Input, Label, Textarea } from '@ap/ui';
import { ISSUE_LIMITS, type Action, type CursorPage, type DiscussionComment, type IssueHistoryEvent, type IssueOccurrence, type LifecycleApi, type Params, type RoundDetail, type RuleResult, type ScreenProps, type ValidationIssueDetail, type ValidationIssueRow, type WriteResult } from './contracts';
import { ReadView, Section, time, writeFailure, WriteError } from './presentation';

/**
 * Human validation records (#1808 N3). Issues, their threads and the Round discussion are separate targets with
 * separate reads; nothing here reads or writes a verdict, opinion, Gate or rule result. Prose is plain text and
 * evidence is shown as locations only: Source text stays behind the audited excerpt read.
 */
const length = (value: string) => [...value].length;
export const actorLabel = (id: string, me: string) => id === me ? '나' : `사용자 ${id.slice(0, 8)}`;

type Draft = Record<string, string>;
type EvidencePointer = { fileRef: string; line: number; fileSha256: string };
/** The finished rule-result link, kept with the Round so a retry or a drawer swap still reports it. */
export type LinkDone = { issueId: string; added: boolean; count: number | null };
type Slot = { draft: Draft; result: WriteResult | null; action?: string; linked?: LinkDone | null };
const EMPTY: Slot = { draft: {}, result: null };
/**
 * Drafts, results, write ownership and multi-step continuations live with the Round, so tab visits, drawer swaps and
 * in-flight answers keep them. Kernel joins a second call on one action hook to the request already in flight, so the
 * controller records which slot owns each action's request: another slot can neither submit nor retry into it (C3).
 */
export function useDiscussionController(api: LifecycleApi) {
  const actions: Record<string, Action> = {
    validationIssueRegister: api.useAction('validationIssueRegister'), validationIssueComment: api.useAction('validationIssueComment'), roundDiscussionComment: api.useAction('roundDiscussionComment'),
    validationIssueLinkOccurrence: api.useAction('validationIssueLinkOccurrence'), validationIssueLinkEvidence: api.useAction('validationIssueLinkEvidence'),
  };
  const actionsRef = useRef(actions);
  useLayoutEffect(() => { actionsRef.current = actions; });
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  /** Action name → slot key whose request is in flight. */
  const owners = useRef<Record<string, string>>({});
  /** Slot key → what a saved answer continues with; a same-request retry reuses it (C4). */
  const continuations = useRef<Record<string, ((result: WriteResult) => void) | undefined>>({});
  const slot = (key: string): Slot => slots[key] ?? EMPTY;
  const patch = (key: string, next: Partial<Slot>) => setSlots(all => ({ ...all, [key]: { ...(all[key] ?? EMPTY), ...next } }));
  const settle = (key: string, next: WriteResult) => {
    // A saved write clears its draft; any other answer keeps it for correction or the same-request retry.
    patch(key, next.outcome === 'ok' ? { draft: {}, result: next } : { result: next });
    if (next.outcome === 'ok') continuations.current[key]?.(next);
  };
  const fail = (key: string, cause: unknown) => { const failure = writeFailure(cause); if (failure) patch(key, { result: failure }); };
  const owned = (name: string, key: string) => { const owner = owners.current[name]; return owner === undefined || owner === key; };
  function launch(key: string, name: string, start: (action: Action) => Promise<WriteResult>): Promise<void> {
    const action = actionsRef.current[name];
    // Another slot's request of this action is in flight: joining it would hand this slot that request's answer.
    if (!action || !owned(name, key)) return Promise.resolve();
    owners.current[name] = key;
    const release = () => { if (owners.current[name] === key) delete owners.current[name]; };
    return start(action).then(next => { release(); settle(key, next); }, (cause: unknown) => { release(); fail(key, cause); });
  }
  /** One fresh idempotency key per submit (Kernel); a second submit of the same slot while one is unsettled joins it, never a new write. */
  function submit(key: string, name: string, input: Params, onOk?: (result: WriteResult) => void): Promise<void> {
    if (!owned(name, key)) return Promise.resolve();
    continuations.current[key] = onOk;
    patch(key, { action: name });
    return launch(key, name, action => action.run(input));
  }
  return {
    slot,
    edit: (key: string, field: string, value: string) => setSlots(all => { const current = all[key] ?? EMPTY; return { ...all, [key]: { ...current, draft: { ...current.draft, [field]: value }, result: current.result?.outcome === 'ok' ? null : current.result } }; }),
    pending: (name: string) => actions[name]?.pending === true,
    /** True while a request of the slot's action is in flight (this slot's or another's); its retry waits. */
    busy: (key: string) => { const name = slots[key]?.action; return !!name && actions[name]?.pending === true; },
    submit,
    /** Resends the same request (same key) after an unknown or failed answer, then continues as the first submit would have. */
    retry(key: string) {
      const current = slots[key];
      const retry = current?.result?.retry;
      if (retry && current.action) void launch(key, current.action, () => retry());
    },
    /** After a definite server error nothing was saved: the person may edit and send a new request. */
    unlock: (key: string) => patch(key, { result: null }),
    /** Links a rule result, then (by choice) its evidence locations to the saved occurrence; each step keeps its own retry. */
    link(key: string, input: { issueId: string; roundId: string; attemptId: string; ruleResultId: string }, refs: EvidencePointer[] | null): Promise<void> {
      const evidenceKey = `${key}:evidence`;
      patch(key, { linked: null });
      patch(evidenceKey, { result: null });
      return submit(key, 'validationIssueLinkOccurrence', input, next => {
        const occurrenceId = next.data?.id;
        const added = next.data?.added !== false;
        if (!refs || typeof occurrenceId !== 'string') { patch(key, { linked: { issueId: input.issueId, added, count: null } }); return; }
        void submit(evidenceKey, 'validationIssueLinkEvidence', { occurrenceId, refs }, evidence => patch(key, { linked: { issueId: input.issueId, added, count: Number(evidence.data?.count ?? 0) } }));
      });
    },
  };
}
export type DiscussionController = ReturnType<typeof useDiscussionController>;

/**
 * `validationIssues` carries no visible total (N2 contract). Page lengths are never presented as one: until the server
 * supplies an ACL-filtered count the header says the total is unavailable (C7, blocker for N2).
 */
export const ISSUE_TOTAL_UNAVAILABLE = '검증 항목 집계 불가';
export function IssueCount() { return <span>{ISSUE_TOTAL_UNAVAILABLE}</span>; }

/** Plain-text composer: limits are visible, oversize input is refused before submit (never truncated). */
function TextField({ id, label, value, limit, multiline = true, required = false, disabled, onChange }: { id: string; label: string; value: string; limit: number; multiline?: boolean; required?: boolean; disabled: boolean; onChange(value: string): void }) {
  const n = length(value);
  const over = n > limit;
  return <div className="grid gap-2"><Label htmlFor={id}>{label}{required ? ' (필수)' : ''}</Label>
    {multiline ? <Textarea id={id} value={value} disabled={disabled} aria-invalid={over} aria-describedby={`${id}-count`} onChange={e => onChange(e.target.value)} /> : <Input inputSize="toolbar" id={id} value={value} disabled={disabled} aria-invalid={over} aria-describedby={`${id}-count`} onChange={e => onChange(e.target.value)} />}
    <p id={`${id}-count`} className={over ? 'text-xs text-text-danger-label' : 'text-xs text-text-secondary'}>{n.toLocaleString('ko-KR')} / {limit.toLocaleString('ko-KR')}자{over ? ' · 상한을 넘어 저장할 수 없습니다.' : ''}</p></div>;
}
const fits = (value: string | undefined, limit: number, required: boolean) => { const v = (value ?? '').trim(); return (!required || v.length > 0) && length(value ?? '') <= limit; };
/** A pending send or an answer awaiting the same-request retry locks the draft so a new key cannot duplicate it. */
const lockedBy = (result: WriteResult | null, pending: boolean) => pending || !!result?.retry;
function WriteFeedback({ controller, slotKey }: { controller: DiscussionController; slotKey: string }) {
  const { result } = controller.slot(slotKey);
  if (!result || result.outcome === 'ok') return null;
  const busy = controller.busy(slotKey);
  return <div className="grid gap-2"><WriteError result={result} retryDisabled={busy} onRetry={() => controller.retry(slotKey)} />{result.outcome === 'error' && result.retry ? <Button type="button" variant="ghost" size="toolbar" className="justify-self-start" disabled={busy} onClick={() => controller.unlock(slotKey)}>초안 고쳐 새로 보내기</Button> : null}</div>;
}

export function CommentComposer({ controller, slotKey, action, input, label, disabled = false }: { controller: DiscussionController; slotKey: string; action: 'validationIssueComment' | 'roundDiscussionComment'; input: Params; label: string; disabled?: boolean }) {
  const { draft, result } = controller.slot(slotKey);
  const pending = controller.pending(action);
  const locked = lockedBy(result, pending) || disabled;
  const body = draft.body ?? '';
  const id = `comment-${slotKey.replace(/[^a-z0-9]/gi, '-')}`;
  return <form className="grid gap-2" aria-label={label} onSubmit={e => { e.preventDefault(); if (!locked && fits(body, ISSUE_LIMITS.comment, true)) void controller.submit(slotKey, action, { ...input, body }); }}>
    <TextField id={id} label={label} value={body} limit={ISSUE_LIMITS.comment} required disabled={locked} onChange={value => controller.edit(slotKey, 'body', value)} />
    <WriteFeedback controller={controller} slotKey={slotKey} />
    {result?.outcome === 'ok' ? <p role="status" className="text-xs text-text-secondary">댓글을 남겼습니다.</p> : null}
    <div className="flex justify-end"><Button type="submit" variant="primary" size="toolbar" disabled={locked || !fits(body, ISSUE_LIMITS.comment, true)}>{pending ? '저장 중…' : '댓글 남기기'}</Button></div>
  </form>;
}

/** Calls `onRefresh` when this read instance receives a second answer: a re-read (write refresh, retry) is a new server snapshot. */
function useRefreshed(completedAt: number | null | undefined, onRefresh: () => void) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (completedAt === null || completedAt === undefined) return;
    if (seen.current !== null && seen.current !== completedAt) onRefresh();
    seen.current = completedAt;
  }, [completedAt, onRefresh]);
}
/**
 * One cursor page. Server cursors carry the first page's timestamp cutoff, so a page that is answered again (a write
 * invalidated it) belongs to a new snapshot: the feed drops every later cursor and pages again from the fresh first page
 * (C2). A failed later page (expired or refused cursor) offers a restart from the first page instead of the same cursor.
 */
function FeedPage<T extends { id: string }, D>({ api, name, params, cursor, last, select, render, empty, onMore, onRestart }: { api: LifecycleApi; name: string; params: Params; cursor: string | undefined; last: boolean; select(data: D): CursorPage<T>; render(row: T): ReactNode; empty: string; onMore(cursor: string): void; onRestart(): void }) {
  const query = api.useRead<D>(name, { ...params, ...(cursor ? { cursor } : {}), limit: ISSUE_LIMITS.page });
  useRefreshed(query.completedAt, onRestart);
  if (cursor && query.status === 'error') return <li className="grid gap-2"><p role="alert" className="text-xs text-text-danger-label">다음 페이지를 읽지 못했습니다. 목록이 바뀌었거나 이어 읽기 시간이 지났을 수 있습니다.</p><Button variant="secondary" size="toolbar" className="justify-self-start" onClick={onRestart}>처음부터 다시 보기</Button></li>;
  return <ReadView query={query} empty="항목을 찾을 수 없거나 읽을 수 없습니다.">{data => { const page = select(data); return <>{page.rows.length === 0 && !cursor ? <li><p role="status" className="text-xs text-text-secondary">{empty}</p></li> : page.rows.map(row => <li key={row.id}>{render(row)}</li>)}{last && page.nextCursor ? <li><Button variant="secondary" size="toolbar" onClick={() => { if (page.nextCursor) onMore(page.nextCursor); }}>더 보기</Button></li> : null}</>; }}</ReadView>;
}
export function CursorFeed<T extends { id: string }, D = CursorPage<T>>({ api, name, params, label, empty, render, select = data => data as unknown as CursorPage<T> }: { api: LifecycleApi; name: string; params: Params; label: string; empty: string; render(row: T): ReactNode; select?: (data: D) => CursorPage<T> }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const restart = useCallback(() => setCursors(old => old.length ? [] : old), []);
  const pages: (string | undefined)[] = [undefined, ...cursors];
  return <ol aria-label={label} className="grid gap-3">{pages.map((cursor, i) => <FeedPage<T, D> key={cursor ?? 'first'} api={api} name={name} params={params} cursor={cursor} last={i === pages.length - 1} select={select} render={render} empty={empty} onMore={next => setCursors(old => old.includes(next) ? old : [...old, next])} onRestart={restart} />)}</ol>;
}
/** One page of the Round's issue table; a page answered again is a new snapshot, so the table returns to its first page (C2). */
export function IssueTablePage({ api, roundId, cursor, onRefresh, children }: Pick<ScreenProps, 'api'> & { roundId: string; cursor: string | undefined; onRefresh(): void; children(page: CursorPage<ValidationIssueRow>): ReactNode }) {
  const query = api.useRead<CursorPage<ValidationIssueRow>>('validationIssues', { roundId, limit: ISSUE_LIMITS.page, ...(cursor ? { cursor } : {}) });
  useRefreshed(query.completedAt, onRefresh);
  if (cursor && query.status === 'error') return <div className="grid gap-2"><p role="alert" className="text-xs text-text-danger-label">다음 페이지를 읽지 못했습니다. 목록이 바뀌었거나 이어 읽기 시간이 지났을 수 있습니다.</p><Button variant="secondary" size="toolbar" className="justify-self-start" onClick={onRefresh}>처음부터 다시 보기</Button></div>;
  return <ReadView query={query}>{children}</ReadView>;
}
function CommentItem({ comment, actorId }: { comment: DiscussionComment; actorId: string }) {
  return <article className="grid gap-1 border-b border-border-subtle pb-2 text-sm"><p className="text-xs text-text-secondary">{actorLabel(comment.authorActorId, actorId)} · {time(comment.createdAt)} KST{comment.correctsCommentId ? ' · 이전 댓글 정정' : ''}</p><p className="whitespace-pre-wrap break-words">{comment.body}</p></article>;
}

/** Round-wide conversation: its own target and list, never issue comments and never their counts. */
export function RoundDiscussion({ api, round, actorId, canContribute, controller }: { api: LifecycleApi; round: RoundDetail; actorId: string; canContribute: boolean; controller: DiscussionController }) {
  return <Section title="Round 전체 토론"><p className="text-xs text-text-secondary">Round {round.seq} 전체에 대한 대화입니다. 검증 항목별 토론은 각 항목 상세에 따로 있습니다.</p>
    <CursorFeed<DiscussionComment> api={api} name="roundDiscussion" params={{ roundId: round.id }} label="Round 전체 댓글" empty="Round 전체 댓글 없음" render={c => <CommentItem comment={c} actorId={actorId} />} />
    {canContribute ? <CommentComposer controller={controller} slotKey={`round:${round.id}`} action="roundDiscussionComment" input={{ roundId: round.id }} label="Round 전체 댓글" /> : null}
  </Section>;
}

function EvidenceLocations({ occurrence, round, onOpenSource }: { occurrence: IssueOccurrence; round: RoundDetail; onOpenSource?: ((order: number, line: number) => void) | undefined }) {
  if (occurrence.evidence.length === 0) return <p className="text-xs text-text-secondary">연결된 근거 위치 없음</p>;
  return <ul className="grid gap-1 text-xs">{occurrence.evidence.map(e => {
    const file = occurrence.roundId === round.id ? round.sampleSet.files.find(f => f.fileRef === e.fileRef) : undefined;
    const mismatch = !!file && file.sha256 !== e.fileSha256;
    return <li key={`${e.fileRef}:${e.line}:${e.fileSha256}`} className="flex flex-wrap items-center gap-2"><span className="break-all font-mono">{e.fileRef}:{e.line}</span>{mismatch ? <span className="text-text-warning-label">해시 불일치</span> : null}{onOpenSource && file && !mismatch ? <Button variant="link" size="toolbar" onClick={() => onOpenSource(file.order, e.line)}>원본에서 보기</Button> : <span className="text-text-muted">{occurrence.roundId === round.id ? '원본 확인 불가' : '다른 Round 근거'}</span>}</li>;
  })}</ul>;
}
const FIELD_LABEL: Record<string, string> = { title: '제목', body: '설명', expected: '기대', actual: '실제', repro: '재현 절차' };
/** The issue drawer body: description, reference-only occurrences, its own thread and correction history. */
export function IssueDetailBody({ api, round, issue, actorId, canContribute, controller, onOpenSource }: { api: LifecycleApi; round: RoundDetail; issue: ValidationIssueDetail; actorId: string; canContribute: boolean; controller: DiscussionController; onOpenSource?: ((order: number, line: number) => void) | undefined }) {
  return <div className="grid min-w-0 gap-4 break-keep">
    <p className="text-xs text-text-secondary">등록 {actorLabel(issue.reporterActorId, actorId)} · {time(issue.createdAt)} KST{issue.firstRoundId === round.id ? ' · 이 Round에서 등록' : ' · 다른 Round에서 등록'}</p>
    <dl className="grid gap-2 text-sm"><dt className="font-semibold">설명</dt><dd className="whitespace-pre-wrap break-words">{issue.body}</dd>{(['expected', 'actual', 'repro'] as const).map(key => issue[key] ? <div key={key} className="contents"><dt className="font-semibold">{FIELD_LABEL[key]}</dt><dd className="whitespace-pre-wrap break-words">{issue[key]}</dd></div> : null)}</dl>
    <Section title="발생·연결 근거"><p className="text-xs text-text-secondary">근거는 위치 참조만 보여 줍니다. 로그 발췌는 규칙 상세의 발췌 보기 권한으로만 엽니다.</p>
      <CursorFeed<IssueOccurrence, ValidationIssueDetail> api={api} name="validationIssueDetail" params={{ issueId: issue.id }} label="발생·연결 근거" empty="연결된 규칙 결과·근거 없음" select={data => data.occurrences} render={o => <div className="grid gap-1 text-xs"><p>{o.roundId === round.id ? `Round ${round.seq}` : '다른 Round'} · {o.ruleResultId ? '규칙 결과 연결' : '규칙 없음'} · {actorLabel(o.linkerActorId, actorId)} · {time(o.createdAt)} KST</p><EvidenceLocations occurrence={o} round={round} onOpenSource={onOpenSource} /></div>} />
    </Section>
    <Section title="항목 토론"><CursorFeed<DiscussionComment> api={api} name="validationIssueThread" params={{ issueId: issue.id }} label="항목 댓글" empty="항목 댓글 없음" render={c => <CommentItem comment={c} actorId={actorId} />} />
      {canContribute ? <CommentComposer controller={controller} slotKey={`issue:${issue.id}`} action="validationIssueComment" input={{ issueId: issue.id }} label="항목 댓글" /> : null}</Section>
    <Section title="정정 이력"><CursorFeed<IssueHistoryEvent> api={api} name="validationIssueHistory" params={{ issueId: issue.id }} label="정정 이력" empty="정정 이력 없음" render={e => <div className="grid gap-1 text-xs"><p className="text-text-secondary">{FIELD_LABEL[e.field] ?? e.field} 정정 · {actorLabel(e.actorId, actorId)} · {time(e.createdAt)} KST</p><p className="whitespace-pre-wrap break-words text-sm">{e.body}</p></div>} /></Section>
  </div>;
}
export function IssueDrawer({ api, ui, round, issueId, actorId, canContribute, controller, returnFocusRef, onClose, onOpenSource }: Pick<ScreenProps, 'api' | 'ui'> & { round: RoundDetail; issueId: string; actorId: string; canContribute: boolean; controller: DiscussionController; returnFocusRef: RefObject<HTMLElement | null>; onClose(): void; onOpenSource?: ((order: number, line: number) => void) | undefined }) {
  const detail = api.useRead<ValidationIssueDetail>('validationIssueDetail', { issueId, limit: ISSUE_LIMITS.page });
  const title = detail.status === 'done' && detail.data ? detail.data.title : '검증 항목 상세';
  return ui.drawer({ title, subtitle: `검증 항목 · Round ${round.seq}`, returnFocusRef, requestClose: onClose, body: <ReadView query={detail} empty="선택한 검증 항목을 찾을 수 없거나 읽을 수 없습니다.">{issue => <IssueDetailBody api={api} round={round} issue={issue} actorId={actorId} canContribute={canContribute} controller={controller} onOpenSource={onOpenSource} />}</ReadView> });
}

/** Registration without a rule: title and free description (optional expected/actual/repro). Saved → its thread opens. */
export function IssueRegister({ ui, round, controller, onClose, onSaved }: Pick<ScreenProps, 'ui'> & { round: RoundDetail; controller: DiscussionController; onClose(): void; onSaved(issueId: string): void }) {
  const key = `register:${round.id}`;
  const { draft, result } = controller.slot(key);
  const pending = controller.pending('validationIssueRegister');
  const locked = lockedBy(result, pending);
  const valid = fits(draft.title, ISSUE_LIMITS.title, true) && fits(draft.body, ISSUE_LIMITS.body, true) && (['expected', 'actual', 'repro'] as const).every(f => fits(draft[f], ISSUE_LIMITS.body, false));
  const saved = (next: WriteResult) => { const id = next.data?.id; if (typeof id === 'string') onSaved(id); };
  const submit = () => {
    if (locked || !valid) return;
    const optional = Object.fromEntries((['expected', 'actual', 'repro'] as const).flatMap(f => draft[f]?.trim() ? [[f, draft[f]]] : []));
    void controller.submit(key, 'validationIssueRegister', { projectId: round.projectId, firstRoundId: round.id, title: draft.title ?? '', body: draft.body ?? '', ...optional }, saved);
  };
  const field = (name: string, label: string, limit: number, required = false, multiline = true) => <TextField key={name} id={`issue-${name}`} label={label} value={draft[name] ?? ''} limit={limit} required={required} multiline={multiline} disabled={locked} onChange={value => controller.edit(key, name, value)} />;
  const body = <form className="grid gap-4 break-keep" onSubmit={e => { e.preventDefault(); submit(); }}>
    <p className="text-xs text-text-secondary">규칙이 없어도 등록할 수 있습니다. 로그 원문은 붙여 넣지 말고, 등록 뒤 규칙 상세에서 근거 위치로 연결해 주세요. 등록은 규칙 결과·판정·Gate를 바꾸지 않습니다.</p>
    {field('title', '제목', ISSUE_LIMITS.title, true, false)}{field('body', '설명', ISSUE_LIMITS.body, true)}{field('expected', '기대', ISSUE_LIMITS.body)}{field('actual', '실제', ISSUE_LIMITS.body)}{field('repro', '재현 절차', ISSUE_LIMITS.body)}
    <WriteFeedback controller={controller} slotKey={key} />
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="toolbar" onClick={onClose}>닫기</Button><Button type="submit" variant="primary" size="toolbar" disabled={locked || !valid}>{pending ? '저장 중…' : '검증 항목 등록'}</Button></div>
  </form>;
  return ui.drawer({ title: '검증 항목 등록', subtitle: `Round ${round.seq}`, body, requestClose: onClose });
}

/**
 * Links the selected rule result (and, by choice, its evidence locations) to an existing issue: references only, no text
 * copy. Candidates are every readable issue of the development project, paged by cursor, so an issue first registered in
 * an earlier Round can recur here (C5); the table and header stay Round-scoped.
 */
export function IssueLink({ api, round, attemptId, rule, controller, onOpenIssue }: { api: LifecycleApi; round: RoundDetail; attemptId: string; rule: RuleResult; controller: DiscussionController; onOpenIssue(issueId: string): void }) {
  const key = `link:${rule.id}`;
  const evidenceKey = `${key}:evidence`;
  const { draft, result, linked } = controller.slot(key);
  const pending = controller.pending('validationIssueLinkOccurrence') || controller.pending('validationIssueLinkEvidence');
  const locked = lockedBy(result, pending) || lockedBy(controller.slot(evidenceKey).result, false);
  const refs = rule.evidence.slice(0, ISSUE_LIMITS.evidence).map(({ fileRef, line, fileSha256 }) => ({ fileRef, line, fileSha256 }));
  const withEvidence = draft.evidence !== 'false' && refs.length > 0;
  const issueId = draft.issueId ?? '';
  const link = () => { if (!locked && issueId) void controller.link(key, { issueId, roundId: round.id, attemptId, ruleResultId: rule.id }, withEvidence ? refs : null); };
  // The candidate list stays outside the form: its «더 보기» and retry buttons must never submit a link.
  return <Section title="검증 항목 연결"><CursorFeed<ValidationIssueRow> api={api} name="validationIssues" params={{ projectId: round.projectId }} label="연결할 검증 항목" empty="이 개발 건에 연결할 검증 항목이 없습니다. 먼저 검증 항목을 등록해 주세요." render={row => <Button type="button" variant={row.id === issueId ? 'secondary' : 'ghost'} size="toolbar" className="h-auto max-w-full justify-start whitespace-normal text-left" aria-pressed={row.id === issueId} disabled={locked} onClick={() => controller.edit(key, 'issueId', row.id)}><span className="grid gap-0.5"><span className="text-sm">{row.title}</span><span className="text-xs text-text-secondary">{row.firstRoundId === round.id ? '이 Round에서 등록' : '다른 Round에서 등록'} · 연결 {row.occurrenceCount}건 · Round {row.roundCount}개</span></span></Button>} />
    <form className="grid gap-3" onSubmit={e => { e.preventDefault(); link(); }}>
    {refs.length ? <label htmlFor={`link-evidence-${rule.id}`} className="flex items-center gap-2 text-xs"><Checkbox id={`link-evidence-${rule.id}`} checked={withEvidence} disabled={locked} onCheckedChange={value => controller.edit(key, 'evidence', String(value === true))} />근거 위치 {refs.length}개도 연결 (위치 참조만, 원문 복사 없음)</label> : <p className="text-xs text-text-secondary">이 규칙 결과에는 근거 위치가 없어 규칙 결과만 연결합니다.</p>}
    <WriteFeedback controller={controller} slotKey={key} />
    <WriteFeedback controller={controller} slotKey={evidenceKey} />
    {linked ? <div role="status" className="flex flex-wrap items-center gap-2 text-xs"><span>{linked.added ? '규칙 결과를 연결했습니다.' : '이미 연결된 규칙 결과입니다.'}{linked.count !== null ? ` 근거 위치 ${linked.count}개 추가.` : ''}</span><Button type="button" variant="link" size="toolbar" onClick={() => onOpenIssue(linked.issueId)}>항목 열기</Button></div> : null}
    <div className="flex justify-end"><Button type="submit" variant="secondary" size="toolbar" disabled={locked || !issueId}>{pending ? '연결 중…' : '규칙 결과 연결'}</Button></div>
  </form></Section>;
}
