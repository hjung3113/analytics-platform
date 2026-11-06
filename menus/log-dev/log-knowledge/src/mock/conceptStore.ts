/**
 * In-memory concept mappings of the mock server (#1196 e, design v0.6 §15.4): `common_concept` and
 * `spec_concept_mapping` rows, never deleted. A deterministic seed over the two spec'd models (A-100 = `SPEC_MODEL`,
 * B-10 = `pairModelId()`): a confirmed pair, a proposed pair (the review queue), a rejected pair, and a mapping whose
 * target the current revision no longer holds (`target_gone`). Module state like the other stores; `resetConcepts()`
 * restores the seed. Pure data — the rules are in `conceptWrites.ts`, the reads in `conceptReads.ts`.
 */
import type { ConceptKind, ConceptMappingRow, ConceptRelation, ConceptReviewState } from '../endpoints';
import { all } from './store';

export type ConceptRec = { id: string; kind: ConceptKind; canonicalLabel: string; labelKey: string; description: string | null };
export type MappingRec = {
  id: string; conceptId: string; modelId: string; targetKind: ConceptKind; targetKey: string; relationKind: ConceptRelation;
  reviewState: ConceptReviewState; origin: 'human' | 'similarity'; similarityScore: number | null;
  similarityBasis: ConceptMappingRow['similarityBasis']; rejectReason: string | null; proposedBy: string; proposedAt: string;
  reviewedBy: string | null; reviewedAt: string | null; rowVersion: number;
};

const SEED_AT = '2026-11-02T00:00:00.000Z';
const REVIEWED_AT = '2026-11-03T00:00:00.000Z';
const ACTOR = '3c9d41e0-5a7b-4c2e-9b1f-0000000000a1';
const uuid = (prefix: string, n: number): string => `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const conceptUuid = (n: number): string => uuid('00000008', n);
export const mappingUuid = (n: number): string => uuid('00000009', n);

let concepts: ConceptRec[] = [];
let mappings: MappingRec[] = [];
let conceptSeq = 0;
let mappingSeq = 0;

export const allConcepts = (): ConceptRec[] => concepts;
export const allMappings = (): MappingRec[] => mappings;
export const conceptById = (id: unknown): ConceptRec | undefined => (typeof id === 'string' ? concepts.find(c => c.id === id.toLowerCase()) : undefined);
export const mappingById = (id: unknown): MappingRec | undefined => (typeof id === 'string' ? mappings.find(m => m.id === id.toLowerCase()) : undefined);
/** The row of this exact pair in any state: the unique indexes allow one open row or one rejected row per pair. */
export const pairRow = (conceptId: string, modelId: string, targetKey: string): MappingRec | undefined =>
  mappings.find(m => m.conceptId === conceptId && m.modelId === modelId && m.targetKey === targetKey);
/** Whether another row already holds the one confirmed `equivalent` place of this target. */
export const hasConfirmedEquivalent = (modelId: string, targetKey: string, exceptId: string): boolean =>
  mappings.some(m => m.id !== exceptId && m.modelId === modelId && m.targetKey === targetKey && m.reviewState === 'confirmed' && m.relationKind === 'equivalent');

/** Create-or-pick by (kind, label key): a concept row asserts nothing, so reusing one is always safe. */
export function pickOrCreateConcept(kind: ConceptKind, canonicalLabel: string, labelKey: string, description: string | null): ConceptRec {
  const found = concepts.find(c => c.kind === kind && c.labelKey === labelKey);
  if (found) return found;
  const rec: ConceptRec = { id: conceptUuid(++conceptSeq), kind, canonicalLabel, labelKey, description };
  concepts.push(rec);
  return rec;
}

export function insertMapping(v: Pick<MappingRec, 'conceptId' | 'modelId' | 'targetKind' | 'targetKey' | 'relationKind'> & { similarity: { score: number; basis: MappingRec['similarityBasis'] } | null }): MappingRec {
  const rec: MappingRec = {
    id: mappingUuid(++mappingSeq), conceptId: v.conceptId, modelId: v.modelId, targetKind: v.targetKind, targetKey: v.targetKey, relationKind: v.relationKind,
    reviewState: 'proposed', origin: v.similarity ? 'similarity' : 'human', similarityScore: v.similarity?.score ?? null, similarityBasis: v.similarity?.basis ?? null,
    rejectReason: null, proposedBy: ACTOR, proposedAt: new Date().toISOString(), reviewedBy: null, reviewedAt: null, rowVersion: 1,
  };
  mappings.push(rec);
  return rec;
}

/** proposed → confirmed or rejected, confirmed → rejected. Bumps the version. */
export function reviewMapping(rec: MappingRec, next: { state: 'confirmed' } | { state: 'rejected'; reason: string }): MappingRec {
  rec.reviewState = next.state;
  rec.rejectReason = next.state === 'rejected' ? next.reason : null;
  rec.reviewedBy = ACTOR; rec.reviewedAt = new Date().toISOString(); rec.rowVersion += 1;
  return rec;
}

export function resetConcepts(): void {
  concepts = []; mappings = []; conceptSeq = 0; mappingSeq = 0;
  const a = all('model').find(m => m.code === 'A-100')!.id, b = all('model').find(m => m.code === 'B-10')!.id;
  const concept = (kind: ConceptKind, label: string, description: string | null = null) => pickOrCreateConcept(kind, label, label.toUpperCase(), description);
  const seed = (c: ConceptRec, modelId: string, targetKind: ConceptKind, targetKey: string, patch: Partial<MappingRec> = {}) => {
    const rec: MappingRec = {
      id: mappingUuid(++mappingSeq), conceptId: c.id, modelId, targetKind, targetKey, relationKind: 'equivalent', reviewState: 'proposed', origin: 'human',
      similarityScore: null, similarityBasis: null, rejectReason: null, proposedBy: ACTOR, proposedAt: SEED_AT, reviewedBy: null, reviewedAt: null, rowVersion: 1, ...patch,
    };
    mappings.push(rec);
  };
  const confirmed = { reviewState: 'confirmed' as const, reviewedBy: ACTOR, reviewedAt: REVIEWED_AT, rowVersion: 2 };
  // Confirmed pair (the rows carry version 2: a client that still holds version 1 gets a conflict).
  const start = concept('event', '설비 시작', 'Chamber 시작 이벤트');
  seed(start, a, 'event', 'CHAMBER/START', confirmed);
  seed(start, b, 'event', 'CHAMBER/START', { ...confirmed, origin: 'similarity', similarityScore: 0.8, similarityBasis: { name_trgm: 1, field_overlap: 0.5 } });
  // Proposed pair: the review queue (a similarity proposal both sides of which wait for a person).
  const move = concept('event', '로봇 이동');
  const similar = { origin: 'similarity' as const, similarityScore: 1, similarityBasis: { name_trgm: 1 } };
  seed(move, a, 'event', 'ROBOT/MOVE', similar);
  seed(move, b, 'event', 'ROBOT/MOVE', similar);
  // Rejected pair: both sides were judged different, with a reason; the pair is not proposed or suggested again.
  const stop = concept('event', '팔 정지');
  const rejected = { reviewState: 'rejected' as const, reviewedBy: ACTOR, reviewedAt: REVIEWED_AT, rowVersion: 2, rejectReason: '이름만 같고 정지 조건이 다르다', ...similar };
  seed(stop, a, 'event', 'ARM/STOP', rejected);
  seed(stop, b, 'event', 'ARM/STOP', rejected);
  // `target_gone`: B-10's second revision removed ROBOT/CALIBRATE; the row is kept.
  seed(concept('event', '로봇 보정'), b, 'event', 'ROBOT/CALIBRATE', { relationKind: 'related' });
}
resetConcepts();
