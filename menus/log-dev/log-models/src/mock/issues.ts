/**
 * Synthetic human validation records (#1808): the server's wire shapes (cursor pages without totals, ids only,
 * reference-only evidence) for the mock app. Nothing here touches rule results, verdicts, opinions or the Gate.
 */
import type { FieldError } from '@ap/contracts';
import { MockActionInvalid, MockRequestError } from '@ap/mock-server';
import type { CursorPage, DiscussionComment, IssueHistoryEvent, IssueOccurrence, RoundDetail, RuleResult, ValidationIssueDetail, ValidationIssueRow } from '../endpoints';
import { fixtureId, ATTEMPT_ID, PROJECT_ID, ROUND_ID } from './fixtures';

type Params = Record<string, unknown>;
type Issue = Omit<ValidationIssueDetail, 'occurrences'>;
/** Stored evidence keeps its insert time so a page can apply the snapshot cutoff, as the server does; it is stripped on output. */
type StoredOccurrence = Omit<IssueOccurrence, 'evidence'> & { issueId: string; evidence: (IssueOccurrence['evidence'][number] & { createdAt: string })[] };
type Comment = DiscussionComment & { target: string };
/** Server limits (`validation-issue-limits.ts`), copied: the mock may not import the server. */
const LIMIT = { title: 200, body: 8000, comment: 4000, evidence: 20, pageDefault: 50, pageMax: 100 } as const;
const at = new Date('2026-11-07T00:40:00Z').toISOString();
const ISSUE_ID = fixtureId(1808501);
const store = { issues: [] as Issue[], occurrences: [] as StoredOccurrence[], comments: [] as Comment[], events: [] as (IssueHistoryEvent & { issueId: string })[] };
function seed() {
  store.issues = [{ id: ISSUE_ID, projectId: PROJECT_ID, firstRoundId: ROUND_ID, title: '종료 이벤트 순서 확인 필요', body: '합성 설명: 샘플 1의 종료 이벤트가 시작보다 먼저 보입니다.', expected: null, actual: null, repro: null, reporterActorId: fixtureId(41), createdAt: at }];
  store.occurrences = [{ id: fixtureId(1808601), issueId: ISSUE_ID, roundId: ROUND_ID, attemptId: ATTEMPT_ID, ruleResultId: fixtureId(501), linkerActorId: fixtureId(41), createdAt: at, evidence: [{ fileRef: 's3://synthetic/sample-01.log', line: 184, fileSha256: 'a'.repeat(64), createdAt: at }] }];
  store.comments = [{ id: fixtureId(1808701), target: `issue:${ISSUE_ID}`, authorActorId: fixtureId(41), body: '합성 댓글: 다음 Round에서 다시 확인합니다.', correctsCommentId: null, createdAt: at }, { id: fixtureId(1808702), target: `round:${ROUND_ID}`, authorActorId: fixtureId(41), body: '합성 Round 의견: 샘플 구성은 확인했습니다.', correctsCommentId: null, createdAt: at }];
  store.events = [];
}
seed();
export const resetIssues = seed;

const field = (path: string, code: string): FieldError => ({ path: path.split('.'), code });
const length = (value: unknown) => typeof value === 'string' ? [...value.trim()].length : 0;
function prose(input: Params, key: string, max: number, required: boolean): FieldError[] {
  const value = input[key];
  if (value === undefined || value === null) return required ? [field(key, 'required')] : [];
  if (typeof value !== 'string') return [field(key, 'malformed')];
  if (required && length(value) === 0) return [field(key, 'required')];
  return length(value) > max ? [field(key, 'too_long')] : [];
}
/** Strictly increasing write and snapshot times, so a write after a first page is always past that page's cutoff. */
let clock = 0;
const now = () => { clock = Math.max(Date.now(), clock + 1); return new Date(clock).toISOString(); };
const ms = (value: string) => Date.parse(value);
const CURSOR_TTL_MS = 30 * 60 * 1000;
type Key = { at: string; id: string };
const compare = (a: Key, b: Key) => ms(a.at) - ms(b.at) || a.id.localeCompare(b.id);
/**
 * The server's observable paging rules (`validation-issue-read.ts`), without its AES-GCM: the first page takes a timestamp
 * cutoff that later pages keep, so rows written after it never appear on them; pages continue after the last row's sort
 * key (keyset, not offset), so a reordered or grown list neither repeats nor skips rows; the opaque cursor binds actor,
 * target/filters and limit and expires after 30 minutes. Any mismatch is `cursor_invalid`.
 */
function pageOf<T extends { id: string; createdAt: string }>(params: Params, scope: string, actor: string, direction: 'asc' | 'desc', read: (snapshot: string) => T[], key: (row: T) => string): CursorPage<T> {
  const limit = typeof params.limit === 'number' ? params.limit : LIMIT.pageDefault;
  const binding = `${actor}|${scope}|${limit}`;
  let snapshot = '';
  let after: Key | null = null;
  let expires = 0;
  if (params.cursor !== undefined) {
    let decoded: { b?: unknown; s?: unknown; a?: { at?: unknown; id?: unknown }; e?: unknown } = {};
    try { decoded = JSON.parse(atob(String(params.cursor))) as typeof decoded; } catch { throw new MockRequestError('cursor_invalid'); }
    if (decoded.b !== binding || typeof decoded.s !== 'string' || typeof decoded.a?.at !== 'string' || typeof decoded.a.id !== 'string' || typeof decoded.e !== 'number' || decoded.e < Date.now()) throw new MockRequestError('cursor_invalid');
    snapshot = decoded.s; after = { at: decoded.a.at, id: decoded.a.id }; expires = decoded.e;
  } else { snapshot = now(); expires = Date.now() + CURSOR_TTL_MS; }
  const sign = direction === 'asc' ? 1 : -1;
  const sorted = read(snapshot).sort((a, b) => sign * compare({ at: key(a), id: a.id }, { at: key(b), id: b.id }));
  const rows = (after ? sorted.filter(row => sign * compare({ at: key(row), id: row.id }, after) > 0) : sorted).slice(0, limit + 1);
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return { rows: visible, ...(last && rows.length > limit ? { nextCursor: btoa(JSON.stringify({ b: binding, s: snapshot, a: { at: key(last), id: last.id }, e: expires })) } : {}) };
}
const until = (snapshot: string) => (value: { createdAt: string }) => ms(value.createdAt) <= ms(snapshot);
/** A list row as of the snapshot: counts and visible activity only include what existed at the cutoff. */
function row(issue: Issue, snapshot: string): ValidationIssueRow {
  const seen = until(snapshot);
  const occ = store.occurrences.filter(o => o.issueId === issue.id && seen(o));
  const comments = store.comments.filter(c => c.target === `issue:${issue.id}` && seen(c));
  const times = [issue.createdAt, ...occ.map(o => o.createdAt), ...occ.flatMap(o => o.evidence.filter(seen).map(e => e.createdAt)), ...comments.map(c => c.createdAt), ...store.events.filter(e => e.issueId === issue.id && seen(e)).map(e => e.createdAt)];
  const lastActivityAt = times.reduce((a, b) => ms(b) > ms(a) ? b : a);
  return { id: issue.id, projectId: issue.projectId, firstRoundId: issue.firstRoundId, title: issue.title, reporterActorId: issue.reporterActorId, createdAt: issue.createdAt, lastActivityAt, commentCount: comments.length, occurrenceCount: occ.length, roundCount: new Set(occ.map(o => o.roundId)).size };
}
const strip = <T extends { issueId?: string; target?: string }>(value: T) => { const { issueId: _issueId, target: _target, ...rest } = value; return rest; };

export const ISSUE_READS = new Set(['validationIssues', 'validationIssueDetail', 'validationIssueThread', 'validationIssueHistory', 'roundDiscussion']);
export function validateIssueRead(name: string, params: Params, isUuid: (v: string) => boolean): string | null {
  for (const key of ['projectId', 'roundId', 'issueId']) if (params[key] !== undefined && (typeof params[key] !== 'string' || !isUuid(params[key] as string))) return `${key} must be UUID`;
  if (name !== 'validationIssues' && params[name === 'roundDiscussion' ? 'roundId' : 'issueId'] === undefined) return 'target required';
  if (params.limit !== undefined && (!Number.isInteger(params.limit) || (params.limit as number) < 1 || (params.limit as number) > LIMIT.pageMax)) return 'limit out of range';
  if (params.cursor !== undefined && (typeof params.cursor !== 'string' || params.cursor.length === 0 || params.cursor.length > 4096)) return 'cursor malformed';
  return null;
}
export function readIssues(name: string, p: Params, actor: string, rounds: RoundDetail[]): unknown {
  const byTime = (value: { createdAt: string }) => value.createdAt;
  if (name === 'validationIssues') {
    return pageOf(p, `issues|${String(p.projectId ?? '')}|${String(p.roundId ?? '')}`, actor, 'desc', snapshot => store.issues
      .filter(i => until(snapshot)(i) && (!p.projectId || i.projectId === p.projectId) && (!p.roundId || i.firstRoundId === p.roundId || store.occurrences.some(o => o.issueId === i.id && o.roundId === p.roundId && until(snapshot)(o))))
      .map(i => row(i, snapshot)), r => r.lastActivityAt);
  }
  if (name === 'roundDiscussion') return rounds.some(r => r.id === p.roundId) ? pageOf(p, `round|${String(p.roundId)}`, actor, 'asc', snapshot => store.comments.filter(c => c.target === `round:${String(p.roundId)}` && until(snapshot)(c)).map(strip), byTime) : null;
  const issue = store.issues.find(i => i.id === p.issueId);
  if (!issue) return null;
  if (name === 'validationIssueThread') return pageOf(p, `thread|${issue.id}`, actor, 'asc', snapshot => store.comments.filter(c => c.target === `issue:${issue.id}` && until(snapshot)(c)).map(strip), byTime);
  if (name === 'validationIssueHistory') return pageOf(p, `history|${issue.id}`, actor, 'asc', snapshot => store.events.filter(e => e.issueId === issue.id && until(snapshot)(e)).map(strip), byTime);
  return { ...issue, occurrences: pageOf(p, `occurrences|${issue.id}`, actor, 'asc', snapshot => store.occurrences.filter(o => o.issueId === issue.id && until(snapshot)(o)).map(o => ({ ...strip(o), evidence: o.evidence.filter(until(snapshot)).map(({ fileRef, line, fileSha256 }) => ({ fileRef, line, fileSha256 })) })), byTime) };
}

export const ISSUE_ACTIONS = new Set(['validationIssueRegister', 'validationIssueComment', 'validationIssueCorrect', 'validationIssueLinkOccurrence', 'validationIssueLinkEvidence', 'roundDiscussionComment']);
export function validateIssueAction(name: string, input: Params): FieldError[] {
  if (name === 'validationIssueRegister') return [...prose(input, 'title', LIMIT.title, true), ...prose(input, 'body', LIMIT.body, true), ...['expected', 'actual', 'repro'].flatMap(k => prose(input, k, LIMIT.body, false))];
  if (name === 'validationIssueComment' || name === 'roundDiscussionComment') return prose(input, 'body', LIMIT.comment, true);
  if (name === 'validationIssueCorrect') return [...(['title', 'body', 'expected', 'actual', 'repro'].includes(String(input.field)) ? [] : [field('field', 'malformed')]), ...prose(input, 'body', input.field === 'title' ? LIMIT.title : LIMIT.body, input.field === 'title' || input.field === 'body')];
  if (name === 'validationIssueLinkOccurrence') return input.ruleResultId && !input.attemptId ? [field('attemptId', 'required')] : [];
  if (name === 'validationIssueLinkEvidence') return !Array.isArray(input.refs) || input.refs.length === 0 ? [field('refs', 'required')] : input.refs.length > LIMIT.evidence ? [field('refs', 'too_long')] : [];
  return [];
}
/** Body-free answers: ids and counts only, as the server's receipts. */
export function handleIssueAction(name: string, input: Params, actor: string, rounds: RoundDetail[], rules: RuleResult[]): { data: Record<string, unknown>; version: null } {
  const text = (key: string) => typeof input[key] === 'string' && (input[key] as string).trim() ? (input[key] as string).trim() : null;
  if (name === 'validationIssueRegister') {
    const round = rounds.find(r => r.id === input.firstRoundId);
    if (!round || round.projectId !== input.projectId) throw new MockActionInvalid([field('firstRoundId', 'not_found')]);
    const issue: Issue = { id: crypto.randomUUID(), projectId: round.projectId, firstRoundId: round.id, title: text('title') ?? '', body: text('body') ?? '', expected: text('expected'), actual: text('actual'), repro: text('repro'), reporterActorId: actor, createdAt: now() };
    store.issues.push(issue);
    return { data: { id: issue.id }, version: null };
  }
  if (name === 'roundDiscussionComment') {
    if (!rounds.some(r => r.id === input.roundId)) throw new MockActionInvalid([field('roundId', 'not_found')]);
    const c: Comment = { id: crypto.randomUUID(), target: `round:${String(input.roundId)}`, authorActorId: actor, body: text('body') ?? '', correctsCommentId: (input.correctsCommentId as string | undefined) ?? null, createdAt: now() };
    store.comments.push(c);
    return { data: { id: c.id }, version: null };
  }
  if (name === 'validationIssueLinkEvidence') {
    const occ = store.occurrences.find(o => o.id === input.occurrenceId);
    if (!occ) throw new MockActionInvalid([field('occurrenceId', 'not_found')]);
    const files = rounds.find(r => r.id === occ.roundId)?.sampleSet.files ?? [];
    const refs = input.refs as { fileRef: string; line: number; fileSha256: string }[];
    const errors = refs.flatMap((ref, i) => files.some(f => f.fileRef === ref.fileRef) ? [] : [field(`refs.${i}.fileRef`, 'not_in_sample')]);
    if (errors.length) throw new MockActionInvalid(errors);
    const fresh = refs.filter(ref => !occ.evidence.some(e => e.fileRef === ref.fileRef && e.line === ref.line && e.fileSha256 === ref.fileSha256));
    if (occ.evidence.length + fresh.length > LIMIT.evidence) throw new MockActionInvalid([field('refs', 'too_long')]);
    const linkedAt = now();
    occ.evidence.push(...fresh.map(({ fileRef, line, fileSha256 }) => ({ fileRef, line, fileSha256, createdAt: linkedAt })));
    return { data: { id: occ.id, issueId: occ.issueId, count: fresh.length }, version: null };
  }
  const issue = store.issues.find(i => i.id === input.issueId);
  if (!issue) throw new MockActionInvalid([field('issueId', 'not_found')]);
  if (name === 'validationIssueComment') {
    const c: Comment = { id: crypto.randomUUID(), target: `issue:${issue.id}`, authorActorId: actor, body: text('body') ?? '', correctsCommentId: (input.correctsCommentId as string | undefined) ?? null, createdAt: now() };
    store.comments.push(c);
    return { data: { id: c.id, issueId: issue.id }, version: null };
  }
  if (name === 'validationIssueCorrect') {
    if (issue.reporterActorId !== actor) throw new MockActionInvalid([field('issueId', 'forbidden')]);
    const e = { id: crypto.randomUUID(), issueId: issue.id, kind: 'field_corrected' as const, field: String(input.field), body: text('body') ?? '', correctsEventId: (input.correctsEventId as string | undefined) ?? null, actorId: actor, createdAt: now() };
    store.events.push(e);
    const key = e.field as 'title' | 'body' | 'expected' | 'actual' | 'repro';
    issue[key] = e.body;
    return { data: { id: e.id, issueId: issue.id }, version: null };
  }
  // validationIssueLinkOccurrence: the same (issue, Round, attempt, rule result) tuple answers the existing occurrence.
  const round = rounds.find(r => r.id === input.roundId);
  if (!round || round.projectId !== issue.projectId) throw new MockActionInvalid([field('roundId', 'not_found')]);
  if (input.ruleResultId && !rules.some(r => r.id === input.ruleResultId)) throw new MockActionInvalid([field('ruleResultId', 'not_found')]);
  const tuple = { attemptId: (input.attemptId as string | undefined) ?? null, ruleResultId: (input.ruleResultId as string | undefined) ?? null };
  const existing = store.occurrences.find(o => o.issueId === issue.id && o.roundId === round.id && o.attemptId === tuple.attemptId && o.ruleResultId === tuple.ruleResultId);
  if (existing) return { data: { id: existing.id, issueId: issue.id, added: false }, version: null };
  const occ: StoredOccurrence = { id: crypto.randomUUID(), issueId: issue.id, roundId: round.id, ...tuple, linkerActorId: actor, createdAt: now(), evidence: [] };
  store.occurrences.push(occ);
  return { data: { id: occ.id, issueId: issue.id, added: true }, version: null };
}
/** A fresh issue on a fresh Round per conformance request. */
export function stageValidationIssue(target: { projectId: string; roundId: string }) {
  const issue: Issue = { id: crypto.randomUUID(), projectId: target.projectId, firstRoundId: target.roundId, title: '합성 적합성 항목', body: '합성 설명', expected: null, actual: null, repro: null, reporterActorId: 'admin', createdAt: now() };
  store.issues.push(issue);
  const occurrenceId = crypto.randomUUID();
  store.occurrences.push({ id: occurrenceId, issueId: issue.id, roundId: target.roundId, attemptId: null, ruleResultId: null, linkerActorId: 'admin', createdAt: now(), evidence: [] });
  return { issueId: issue.id, occurrenceId };
}
