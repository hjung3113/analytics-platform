/**
 * In-memory knowledge items of the mock server (ADR-0109, #1197 s2): a deterministic synthetic seed of ~30 items over the
 * synthetic catalog (`store.ts`), shaped like the real `knowledge.item*` tables (item, revision + evidence, assessment
 * events, links). Module state like the catalog store; `resetItems()` restores the seed. Pure data — the reads are in
 * `index.ts`; the write actions (`itemActions.ts`, #1197 s3a) change this same store through the mutators at the end.
 */
import { all, byId } from './store';

export type ItemRec = {
  id: string; itemNo: number; ownerModelId: string | null; ownerSoftwareId: string | null;
  verificationState: string; processingState: string; publicationState: string; rowVersion: number;
  createdBy: string; createdAt: string; updatedAt: string; revisions: RevisionRec[]; assessments: AssessmentRec[];
};
export type RevisionRec = {
  revisionNo: number; title: string; typeCode: string; observation: string | null; expected: string | null;
  analysisOpinion: string | null; improvement: string | null; changeNote: string | null; publishedBy: string; publishedAt: string;
  evidence: { ordinal: number; sourceKind: string; sourceOwner: string; sourceRef: string; sourceVersion: string | null; contentHash: string | null; locator: string | null; note: string | null }[];
};
export type AssessmentRec = {
  id: string; dimension: string; priorState: string; newState: string; rationale: string; actorId: string; basedOnRevisionNo: number; observedAt: string;
};
export type LinkRec = { kind: 'derived_from' | 'related'; sourceItemId: string; targetItemId: string; sourceRevisionNo: number | null };

const itemUuid = (n: number): string => `00000005-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const assessmentUuid = (n: number): string => `00000006-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const ACTORS = ['3c9d41e0-5a7b-4c2e-9b1f-0000000000a1', '8e12f7a4-6d3c-4f0b-8a55-0000000000a2'] as const;
const day = (d: number, hour = 9): string => `2026-10-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;

let items: ItemRec[] = [];
let links: LinkRec[] = [];
let nextItemNo = 1;
let nextAssessmentNo = 1;

const TYPES = ['anomaly', 'needs_check', 'behavior_note', 'guideline'] as const;
const VERIFICATIONS = ['not_checked', 'observed', 'verified', 'disputed'] as const;
const PROCESSINGS = ['open', 'under_investigation', 'resolved'] as const;
const TOPICS = [
  '챔버 압력 로그 지연', '로트 시작 이벤트 중복', '레시피 로드 경고 반복', '웨이퍼 반입 타임아웃', '가스 유량 센서 값 튐',
  '알람 코드 0x2F 해석', '정비 후 첫 로트 지연', '인터락 해제 순서', '온도 램프 기준', '로그 파일 회전 시점',
];

export function resetItems(): void {
  const models = all('model'), software = all('software');
  const modelId = (code: string) => models.find(m => m.code === code)!.id;
  const softwareId = (code: string, parent: string) => software.find(s => s.code === code && s.parentId === modelId(parent))!.id;
  // Owners the seed cycles through: four models and four SW versions (one of them inactive).
  const owners: { model: string | null; software: string | null }[] = [
    { model: modelId('A-100'), software: null }, { model: modelId('A-200'), software: null },
    { model: modelId('B-10'), software: null }, { model: modelId('B-20'), software: null },
    { model: null, software: softwareId('v1.0', 'A-100') }, { model: null, software: softwareId('v2.0', 'A-100') },
    { model: null, software: softwareId('v1.0', 'A-200') }, { model: null, software: softwareId('v3.1', 'B-10') },
  ];
  items = []; links = [];
  let assessmentSeq = 0;
  const revision = (n: number, title: string, type: string, withEvidence: boolean, note: string | null): RevisionRec => ({
    revisionNo: n, title, typeCode: type,
    observation: `${title}: 로그에서 같은 구간이 ${n + 1}회 연속 관찰됨. 재현 조건은 정비 직후 첫 로트.`,
    expected: '해당 구간은 한 번만 기록되고 다음 이벤트가 이어져야 한다.',
    analysisOpinion: type === 'guideline' ? null : '제어기 재시작 타이밍과 겹치는 것으로 보이나 원인은 확정되지 않았다.',
    improvement: type === 'anomaly' ? '이벤트 중복 제거 규칙을 로그 수집 단계에 둔다.' : null,
    changeNote: note, publishedBy: ACTORS[n % 2]!, publishedAt: day(2 + n * 3),
    evidence: withEvidence ? [
      { ordinal: 1, sourceKind: 'log_file', sourceOwner: 'MARS', sourceRef: `logs/${title.length}-0${n}.log`, sourceVersion: `v${n}`, contentHash: 'sha256:9f2c41ab77d0', locator: 'L120-L148', note: '중복 구간 발췌' },
      { ordinal: 2, sourceKind: 'spec', sourceOwner: 'Wiki', sourceRef: 'manuals/chamber-pressure', sourceVersion: null, contentHash: null, locator: '§4.2', note: null },
    ].slice(0, 1 + (n % 2)) : [],
  });
  for (let n = 1; n <= 30; n++) {
    const owner = owners[(n - 1) % owners.length]!;
    const type = TYPES[(n - 1) % TYPES.length]!;
    const revCount = n === 1 ? 3 : n % 7 === 0 ? 2 : 1;
    const title = `${TOPICS[(n - 1) % TOPICS.length]!}${n > TOPICS.length ? ` (${Math.ceil(n / TOPICS.length)})` : ''}`;
    const evidence = n !== 4;
    const revisions = Array.from({ length: revCount }, (_, k) => revision(k + 1, k + 1 === revCount ? title : `${title} 초안 ${k + 1}`, type, evidence, k === 0 ? null : `${k + 1}차 보완`));
    const verification = n === 1 ? 'disputed' : VERIFICATIONS[(n - 1) % VERIFICATIONS.length]!;
    const processing = n === 1 ? 'under_investigation' : PROCESSINGS[(n - 1) % PROCESSINGS.length]!;
    const assessments: AssessmentRec[] = [];
    const assess = (dimension: string, prior: string, next: string, rationale: string, based: number, d: number) =>
      assessments.push({ id: assessmentUuid(++assessmentSeq), dimension, priorState: prior, newState: next, rationale, actorId: ACTORS[d % 2]!, basedOnRevisionNo: based, observedAt: day(d, 10) });
    if (n === 1) {
      assess('verification', 'not_checked', 'observed', '현장 로그에서 같은 현상을 확인', 1, 4);
      assess('verification', 'observed', 'verified', '두 번째 설비에서도 재현', 2, 8);
      assess('verification', 'verified', 'disputed', '정비 이력과 맞지 않는다는 이견', 3, 12);
      assess('processing', 'open', 'under_investigation', '원인 조사 시작', 3, 13);
    } else if (verification !== 'not_checked') {
      assess('verification', 'not_checked', verification, '로그 대조 결과', 1, 5);
    }
    const lastAssessed = assessments.at(-1)?.observedAt;
    const updatedAt = [revisions.at(-1)!.publishedAt, lastAssessed ?? ''].sort().at(-1)!;
    items.push({
      id: itemUuid(n), itemNo: n, ownerModelId: owner.model, ownerSoftwareId: owner.software,
      verificationState: verification, processingState: processing, publicationState: n === 3 ? 'archived' : 'published',
      rowVersion: 1, createdBy: ACTORS[0]!, createdAt: day(1), updatedAt, revisions, assessments,
    });
  }
  // KI-5 (SW-owned) was derived from KI-1 at its revision 2; KI-2 and KI-6 are related.
  links.push({ kind: 'derived_from', sourceItemId: itemUuid(5), targetItemId: itemUuid(1), sourceRevisionNo: 2 });
  links.push({ kind: 'related', sourceItemId: itemUuid(2), targetItemId: itemUuid(6), sourceRevisionNo: null });
  nextItemNo = items.length + 1; nextAssessmentNo = assessmentSeq + 1;
}
resetItems();

export const allItems = (): ItemRec[] => items;
export const itemById = (id: unknown): ItemRec | undefined => (typeof id === 'string' ? items.find(i => i.id === id.toLowerCase()) : undefined);
export const allLinks = (): LinkRec[] => links;
export const latestRevision = (rec: ItemRec): RevisionRec => rec.revisions[rec.revisions.length - 1]!;

/** The row's owner as the reads show it: the model (directly, or through the SW version) and the SW version when SW-owned. */
export function ownerOf(rec: ItemRec) {
  const sw = rec.ownerSoftwareId === null ? null : byId(rec.ownerSoftwareId)!;
  const model = byId(rec.ownerModelId ?? sw!.parentId)!;
  return sw === null
    ? { kind: 'model' as const, modelId: model.id, modelName: model.name }
    : { kind: 'software' as const, modelId: model.id, modelName: model.name, softwareId: sw.id, versionLabel: sw.code };
}

// ---- mutators (the write actions, #1197 s3a) ---------------------------------------------------------------------
// Plain store changes; the rules (validation, refusals, outcomes) live in `itemActions.ts`. The server writes through
// `repositories/item-write.ts`; here a bump of `rowVersion` and `updatedAt` marks every successful change.

/** The acting user of every mock write. The mock engine hands the handler a role id, not a user id, so one fixed actor stands in. */
export const MOCK_ACTOR_ID = ACTORS[0];

export type EvidenceRec = RevisionRec['evidence'][number];
/** The normalised content of one revision (blank optional texts are already null, title trimmed). */
export type RevisionContent = Pick<RevisionRec, 'title' | 'typeCode' | 'observation' | 'expected' | 'analysisOpinion' | 'improvement'>;

const now = (): string => new Date().toISOString();
const bump = (rec: ItemRec): ItemRec => { rec.rowVersion += 1; rec.updatedAt = now(); return rec; };
const revisionOf = (revisionNo: number, content: RevisionContent, changeNote: string | null, evidence: readonly Omit<EvidenceRec, 'ordinal'>[]): RevisionRec => ({
  revisionNo, ...content, changeNote, publishedBy: MOCK_ACTOR_ID, publishedAt: now(),
  evidence: evidence.map((e, i) => ({ ordinal: i + 1, ...e })),
});

/** A new published item (`not_checked`, `open`) with revision 1; the number is the next of the workspace counter. */
export function insertItem(owner: { modelId: string | null; softwareId: string | null }, content: RevisionContent, evidence: readonly Omit<EvidenceRec, 'ordinal'>[]): ItemRec {
  const itemNo = nextItemNo++;
  const at = now();
  const rec: ItemRec = {
    id: itemUuid(itemNo), itemNo, ownerModelId: owner.modelId, ownerSoftwareId: owner.softwareId,
    verificationState: 'not_checked', processingState: 'open', publicationState: 'published', rowVersion: 1,
    createdBy: MOCK_ACTOR_ID, createdAt: at, updatedAt: at, revisions: [revisionOf(1, content, null, evidence)], assessments: [],
  };
  items.push(rec);
  return rec;
}
/** Appends revision `latest + 1`; the evidence belongs to it, the earlier revisions stay as they are. */
export function appendRevision(rec: ItemRec, content: RevisionContent, changeNote: string, evidence: readonly Omit<EvidenceRec, 'ordinal'>[]): ItemRec {
  rec.revisions.push(revisionOf(latestRevision(rec).revisionNo + 1, content, changeNote, evidence));
  return bump(rec);
}
/** One assessment event (prior = the current projection, based on the latest revision) and the dimension's new projection. */
export function appendAssessment(rec: ItemRec, dimension: 'verification' | 'processing', newState: string, rationale: string): ItemRec {
  const prior = dimension === 'verification' ? rec.verificationState : rec.processingState;
  rec.assessments.push({
    id: assessmentUuid(nextAssessmentNo++), dimension, priorState: prior, newState, rationale,
    actorId: MOCK_ACTOR_ID, basedOnRevisionNo: latestRevision(rec).revisionNo, observedAt: now(),
  });
  if (dimension === 'verification') rec.verificationState = newState; else rec.processingState = newState;
  return bump(rec);
}
export function setPublicationState(rec: ItemRec, state: 'published' | 'archived'): ItemRec {
  rec.publicationState = state;
  return bump(rec);
}
/** `derived_from`: the new item (source of the link) points at the original at the revision it was derived from. */
export function insertDerivedLink(newItemId: string, originalItemId: string, originalRevisionNo: number): void {
  links.push({ kind: 'derived_from', sourceItemId: newItemId, targetItemId: originalItemId, sourceRevisionNo: originalRevisionNo });
}
