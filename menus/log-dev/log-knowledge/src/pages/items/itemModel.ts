import { isUuid, type EvidenceSourceKind } from '../../endpoints';
/**
 * Pure model of the item screens (#1197 s2): vocabulary labels (ADR-0109), the item number and owner wording, the
 * default list filter and the `rev` page-key rule. No React, so it is unit-tested without a DOM and node s3 reuses it.
 */
import { encodeFilterParams, formatInstant, type ColumnFilter } from '@ap/contracts';
import {
  ITEM_TYPE_LABEL, PROCESSING_LABEL, PUBLICATION_LABEL, VERIFICATION_LABEL,
  type ItemOwner, type ItemRow, type ItemTypeCode, type ProcessingState, type PublicationState, type VerificationState,
} from '../../endpoints';

export { ITEM_TYPE_LABEL, PROCESSING_LABEL, PUBLICATION_LABEL, VERIFICATION_LABEL };

/** The three state axes of an item. They are never merged (ADR-0109, design §7.2): each has its own label and badge. */
export type Axis = 'publication' | 'verification' | 'processing';
export const AXIS_LABEL: Record<Axis, string> = { publication: '게시', verification: '기술 검증', processing: '처리' };
/** `dimension` of an assessment event → axis (publication changes are not assessments, but an unknown dimension reads as its raw id). */
export const AXIS_OF_DIMENSION: Record<string, Axis> = { verification: 'verification', processing: 'processing', publication: 'publication' };

export function stateLabel(axis: Axis, value: string): string {
  const table: Record<string, string> = axis === 'verification' ? VERIFICATION_LABEL : axis === 'processing' ? PROCESSING_LABEL : PUBLICATION_LABEL;
  return table[value] ?? value;
}
export const typeLabel = (code: string): string => (ITEM_TYPE_LABEL as Record<string, string>)[code] ?? code;

/** `KI-<n>`, the number users search and speak by. */
export const itemNoLabel = (itemNo: number): string => `KI-${itemNo}`;

/** 「MX-200」 for a model-owned item, 「MX-200 / v3.2.1」 for a SW-owned one. */
export const ownerText = (owner: ItemOwner): string => (owner.kind === 'software' ? `${owner.modelName} / ${owner.versionLabel}` : owner.modelName);
export const ownerKindText = (owner: Pick<ItemOwner, 'kind'>): string => (owner.kind === 'software' ? 'SW' : '모델');

/** An item the default list hides: only an explicit 게시 상태 condition shows it, so the row stays visible but muted. */
export const isRowMuted = (row: Pick<ItemRow, 'publicationState'>): boolean => row.publicationState !== 'published';

/** The pinned 게시 상태 filter the list opens with. */
export const PUBLISHED_ONLY: ColumnFilter = { id: 'publicationState', op: 'in', value: ['published'] };
export const defaultFilterParams = (): string[] => encodeFilterParams([PUBLISHED_ONLY]);

/** Model ids of the address's `ownerModelId in [...]` conditions (raw `filter` params `id:op:v1~v2`); anything else is ignored. */
export function chosenOwnerModelIds(rawFilters: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of rawFilters) {
    const [id, op, value] = raw.split(':', 3) as [string, string | undefined, string | undefined];
    if (id !== 'ownerModelId' || op !== 'in' || !value) continue;
    for (const v of value.split('~')) if (isUuid(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Page key `rev`: a positive integer revision number up to the server's inclusive bound (`REVISION_NO_MAX`, item-endpoints.ts); an absent key reads the latest. */
export const REVISION_NO_MAX = 1_000_000;
export const isRevisionParam = (raw: string): boolean => /^[1-9]\d{0,6}$/.test(raw) && Number(raw) <= REVISION_NO_MAX;
export const revisionOf = (raw: string | null): number | null => (raw !== null && isRevisionParam(raw) ? Number(raw) : null);

/** A server instant for the viewer: kernel `formatInstant` (06 kernel §6.3) in the viewer's zone, never a slice of the ISO text. */
export const instantText = (iso: string, timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string => formatInstant(iso, 'ko', timeZone);

/** Actors arrive as ids only (no cross-module name read exists yet): a short id is shown, the full id is the title. */
export const shortActor = (id: string): string => id.slice(0, 8);

export type { ItemTypeCode, ProcessingState, PublicationState, VerificationState };

/** Korean label of an evidence source kind; an unknown kind shows as sent. */
export const EVIDENCE_KIND_LABEL: Record<EvidenceSourceKind, string> = { log_file: '로그 파일', spec: '명세', image: '이미지', validation_run: '검증 실행', other: '기타' };
export const evidenceKindLabel = (kind: string): string => (EVIDENCE_KIND_LABEL as Record<string, string>)[kind] ?? kind;
