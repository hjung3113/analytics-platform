/**
 * Pure view model of the concept mapping review (#1196 e, design v0.6 §15.4 / §15.6): grouping and sorting of mappings,
 * Korean/English words (the wire words `equivalent` / `related` are never shown), the reject-reason rule, the version
 * conflict recovery and the field-error texts. No JSX, no hooks.
 */
import type { ActionResult, FieldError } from '@ap/contracts';
import { CONCEPT_LIMITS, type ConceptKind, type ConceptMappingRow, type ConceptRelation, type ConceptReviewState, type ConceptSuggestion } from '../../endpoints';

export type Words = { ko: string; en: string };
export const CONCEPT_RELATION_LABEL: Record<ConceptRelation, Words> = { equivalent: { ko: '같은 개념', en: 'Same concept' }, related: { ko: '관련 개념', en: 'Related concept' } };
export const CONCEPT_STATE_LABEL: Record<ConceptReviewState, Words> = { proposed: { ko: '검토 대기', en: 'Awaiting review' }, confirmed: { ko: '확인됨', en: 'Confirmed' }, rejected: { ko: '기각됨', en: 'Rejected' } };
export const CONCEPT_ORIGIN_LABEL: Record<ConceptMappingRow['origin'], Words> = { human: { ko: '사람 제안', en: 'Proposed by a person' }, similarity: { ko: '유사도 제안', en: 'Proposed by similarity' } };
export const CONCEPT_TARGET_STATE_LABEL: Record<ConceptMappingRow['targetState'], Words> = { present: { ko: '현행 명세에 있음', en: 'In the current specification' }, target_gone: { ko: '대상 사라짐', en: 'Target gone' } };
export const CONCEPT_KIND_LABEL: Record<ConceptKind, Words> = { module: { ko: 'Module', en: 'Module' }, event: { ko: 'Event', en: 'Event' } };
export const REJECT_REASON_MAX = CONCEPT_LIMITS.rejectReason;

const STATE_RANK: Record<ConceptReviewState, number> = { proposed: 0, confirmed: 1, rejected: 2 };
/** Proposed queue first, then confirmed, then rejected; newest proposal first inside a state; `id` ends every tie. */
export const compareMappings = (a: ConceptMappingRow, b: ConceptMappingRow): number =>
  STATE_RANK[a.reviewState] - STATE_RANK[b.reviewState] || b.proposedAt.localeCompare(a.proposedAt) || a.id.localeCompare(b.id);
export const sortMappings = (rows: readonly ConceptMappingRow[]): ConceptMappingRow[] => [...rows].sort(compareMappings);
export const proposedQueue = (rows: readonly ConceptMappingRow[]): ConceptMappingRow[] => sortMappings(rows.filter(r => r.reviewState === 'proposed'));

export type ConceptCounts = Record<ConceptReviewState, number> & { total: number };
const emptyCounts = (): ConceptCounts => ({ proposed: 0, confirmed: 0, rejected: 0, total: 0 });
/** Rows per target (Event or Module key) by review state: the count beside each Event of the tree. */
export function countsByTarget(rows: readonly ConceptMappingRow[]): Map<string, ConceptCounts> {
  const out = new Map<string, ConceptCounts>();
  for (const r of rows) { const c = out.get(r.targetKey) ?? emptyCounts(); c[r.reviewState] += 1; c.total += 1; out.set(r.targetKey, c); }
  return out;
}
/** The Event-filtered concept tab (`event=<targetKey>`): that target's rows; no key = every row. */
export const filterByTarget = (rows: readonly ConceptMappingRow[], targetKey: string | null): ConceptMappingRow[] =>
  targetKey ? rows.filter(r => r.targetKey === targetKey) : [...rows];

export type ConceptGroup = { conceptId: string; conceptLabel: string; kind: ConceptKind; rows: ConceptMappingRow[]; counts: ConceptCounts; hasProposed: boolean; hasGone: boolean };
/** Rows grouped by concept; groups with a proposed row come first (the queue), then by label. */
export function groupByConcept(rows: readonly ConceptMappingRow[]): ConceptGroup[] {
  const map = new Map<string, ConceptGroup>();
  for (const r of sortMappings(rows)) {
    const g = map.get(r.conceptId) ?? { conceptId: r.conceptId, conceptLabel: r.conceptLabel, kind: r.kind, rows: [], counts: emptyCounts(), hasProposed: false, hasGone: false };
    g.rows.push(r); g.counts[r.reviewState] += 1; g.counts.total += 1;
    g.hasProposed ||= r.reviewState === 'proposed'; g.hasGone ||= r.targetState === 'target_gone';
    map.set(r.conceptId, g);
  }
  return [...map.values()].sort((a, b) => Number(b.hasProposed) - Number(a.hasProposed) || a.conceptLabel.localeCompare(b.conceptLabel) || a.conceptId.localeCompare(b.conceptId));
}

/** A `target_gone` row can be rejected but never confirmed (the server re-checks the key at confirm time). */
export const canConfirm = (r: ConceptMappingRow): boolean => r.reviewState === 'proposed' && r.targetState === 'present';
export const canReject = (r: ConceptMappingRow): boolean => r.reviewState !== 'rejected';

export type MappingLabels = { relation: Words; state: Words; origin: Words; targetState: Words; targetName: string; gone: boolean; score: number | null };
export function mappingLabels(r: ConceptMappingRow): MappingLabels {
  return { relation: CONCEPT_RELATION_LABEL[r.relationKind], state: CONCEPT_STATE_LABEL[r.reviewState], origin: CONCEPT_ORIGIN_LABEL[r.origin], targetState: CONCEPT_TARGET_STATE_LABEL[r.targetState], targetName: r.targetName ?? r.targetKey, gone: r.targetState === 'target_gone', score: r.origin === 'similarity' ? r.similarityScore : null };
}

export type ReviewAction = 'confirm' | 'reject';
export type ReviewDraft = { ok: true; reason: string | null } | { ok: false; error: 'required' | 'too_long' };
/** A reason is needed (≥ 1 character after trimming, ≤ 500 code points) only when rejecting; a confirm sends none. */
export function reviewDraft(action: ReviewAction, reason: string): ReviewDraft {
  if (action === 'confirm') return { ok: true, reason: null };
  const text = reason.trim();
  if (text === '') return { ok: false, error: 'required' };
  if ([...text].length > REJECT_REASON_MAX) return { ok: false, error: 'too_long' };
  return { ok: true, reason: text };
}

export type ReviewOutcome =
  | { kind: 'done' }
  | { kind: 'conflict'; keepReason: true; message: Words }
  | { kind: 'invalid'; fieldErrors: Record<string, Words> }
  | { kind: 'forbidden'; message: Words }
  | { kind: 'failed'; message: Words };
/** What the drawer does with a write answer. A conflict keeps the typed reason and asks for a re-read before retrying. */
export function reviewOutcome(result: Pick<ActionResult<unknown>, 'outcome' | 'fieldErrors'>): ReviewOutcome {
  switch (result.outcome) {
    case 'ok': return { kind: 'done' };
    case 'conflict': return { kind: 'conflict', keepReason: true, message: { ko: '다른 사람이 먼저 바꿨습니다. 최신 상태를 불러온 뒤 다시 판단해 주세요.', en: 'Someone changed this first. Reload the latest state and decide again.' } };
    case 'invalid': return { kind: 'invalid', fieldErrors: conceptFieldErrors(result.fieldErrors) };
    case 'forbidden': return { kind: 'forbidden', message: { ko: '명세 관리 권한을 관리자에게 요청하세요.', en: 'Ask an administrator for specification management permission.' } };
    default: return { kind: 'failed', message: { ko: '결과를 확인하지 못했습니다. 최신 상태를 확인해 주세요.', en: 'The result could not be confirmed. Check the latest state.' } };
  }
}

export type ConflictRecovery =
  | { status: 'row_missing' }
  | { status: 'already_decided'; row: ConceptMappingRow }
  | { status: 'retry'; row: ConceptMappingRow; version: string };
/** After a `conflict`: find the row again in the re-read list. Still proposed = retry with its new version; decided meanwhile = show that. */
export function recoverConflict(stale: Pick<ConceptMappingRow, 'id'>, fresh: readonly ConceptMappingRow[]): ConflictRecovery {
  const row = fresh.find(r => r.id === stale.id);
  if (!row) return { status: 'row_missing' };
  return row.reviewState === 'proposed' ? { status: 'retry', row, version: String(row.version) } : { status: 'already_decided', row };
}

const CODE_TEXT: Record<string, Words> = {
  required: { ko: '필수 값입니다.', en: 'This field is required.' },
  too_long: { ko: '너무 깁니다.', en: 'This value is too long.' },
  malformed: { ko: '형식을 확인해 주세요.', en: 'Check the format.' },
  required_one: { ko: '기존 개념과 새 개념 이름 중 하나만 정해 주세요.', en: 'Pick an existing concept or name a new one, not both.' },
  same_target: { ko: '같은 대상끼리는 짝지을 수 없습니다.', en: 'A target cannot be paired with itself.' },
  not_found: { ko: '찾을 수 없습니다.', en: 'Not found.' },
  none_published: { ko: '발행된 명세가 없습니다.', en: 'No published specification.' },
  kind_mismatch: { ko: '개념의 종류(Module/Event)가 대상과 다릅니다.', en: 'The concept is of another kind.' },
  already_mapped: { ko: '이 개념에 이미 연결된 대상입니다.', en: 'This target is already on the concept.' },
  already_rejected: { ko: '이미 기각된 짝 · 재제안 제외', en: 'Rejected pair · excluded from proposals' },
  already_confirmed: { ko: '이미 확인된 같은 개념이 있습니다.', en: 'A same-concept mapping is already confirmed.' },
};
/** Field errors keyed by wire path (`pairWith.target`), with texts for the closed code vocabulary. */
export function conceptFieldErrors(errors: readonly FieldError[]): Record<string, Words> {
  const out: Record<string, Words> = {};
  for (const e of errors) out[e.path.join('.')] ??= CODE_TEXT[e.code] ?? { ko: '입력을 확인해 주세요.', en: 'Check this input.' };
  return out;
}

/** Computed pairs already represented by stored mappings appear only once in the review queue. */
export function unmappedSuggestions(rows: readonly ConceptMappingRow[], suggestions: readonly ConceptSuggestion[]): ConceptSuggestion[] {
  return suggestions.filter(s => !rows.some(r => r.modelId === s.source.modelId && r.targetKey === s.source.targetKey && rows.some(p => p.conceptId === r.conceptId && p.modelId === s.candidate.modelId && p.targetKey === s.candidate.targetKey)));
}
