/**
 * Pure model of the item write forms (#1197 s3b): form state, client checks with the server's limits (`ITEM_LIMITS`),
 * the mapping of server `invalid` paths to the form's controls, and the action inputs. No React, so it is unit-tested
 * without a DOM. Server value rules: `docs/architecture/platform-api/api/log-knowledge.md` §Item write actions.
 */
import type { FieldError } from '@ap/contracts';
import {
  EVIDENCE_SOURCE_KINDS, ITEM_LIMITS, type EvidenceInput, type EvidenceSourceKind, type ItemCreateInput, type ItemDeriveInput, type ItemDetail, type ItemOwner,
  type ItemReviseInput, type ItemTypeCode,
} from '../../endpoints';

export type EvidenceRow = { sourceKind: EvidenceSourceKind; sourceOwner: string; sourceRef: string; sourceVersion: string; contentHash: string; locator: string; note: string };
export const EVIDENCE_FIELDS = ['sourceKind', 'sourceOwner', 'sourceRef', 'sourceVersion', 'contentHash', 'locator', 'note'] as const;
export type EvidenceField = (typeof EVIDENCE_FIELDS)[number];
export const emptyEvidence = (): EvidenceRow => ({ sourceKind: 'log_file', sourceOwner: '', sourceRef: '', sourceVersion: '', contentHash: '', locator: '', note: '' });

export type WriteMode = 'create' | 'revise' | 'derive';
export type WriteForm = {
  ownerKind: 'model' | 'software'; modelId: string; softwareId: string;
  typeCode: ItemTypeCode; title: string; observation: string; expected: string; analysisOpinion: string; improvement: string;
  changeNote: string; evidence: EvidenceRow[];
};
export const emptyForm = (ownerModelId = ''): WriteForm => ({
  ownerKind: 'model', modelId: ownerModelId, softwareId: '', typeCode: 'anomaly', title: '', observation: '', expected: '', analysisOpinion: '', improvement: '', changeNote: '', evidence: [],
});

/** Revise prefill: the latest revision's text and evidence (the owner is not editable and is not part of the form). */
export function reviseForm(detail: ItemDetail): WriteForm {
  const r = detail.revision;
  return {
    ...emptyForm(), typeCode: r.typeCode, title: r.title, observation: r.observation ?? '', expected: r.expected ?? '', analysisOpinion: r.analysisOpinion ?? '', improvement: r.improvement ?? '',
    evidence: r.evidence.map(e => ({
      sourceKind: (e.sourceKind as EvidenceSourceKind), sourceOwner: e.sourceOwner, sourceRef: e.sourceRef, sourceVersion: e.sourceVersion ?? '', contentHash: e.contentHash ?? '', locator: e.locator ?? '', note: e.note ?? '',
    })),
  };
}
/** Derive prefill: type, title, opinion and improvement of the viewed revision; the facts, the owner and the evidence start empty. */
export const deriveForm = (detail: ItemDetail): WriteForm => ({
  ...emptyForm(), typeCode: detail.revision.typeCode, title: detail.revision.title, analysisOpinion: detail.revision.analysisOpinion ?? '', improvement: detail.revision.improvement ?? '',
});

export const deriveNotice = (itemNo: number, revisionNo: number): string =>
  `원본 KI-${itemNo} r${revisionNo}에서 파생합니다. 근거는 새로 등록하고 판단 상태는 미확인으로 시작합니다`;

const length = (value: string): number => [...value].length;
const FIELD_LABEL: Record<string, string> = {
  owner: '소유 대상', ownerModelId: '모델', ownerSoftwareId: 'SW 버전', typeCode: '유형', title: '제목', observation: '관찰 사실', expected: '기대·기준',
  analysisOpinion: '분석 의견', improvement: '개선 방향', changeNote: '변경 사유', evidence: '근거', id: 'Item', sourceItemId: '원본 Item', sourceRevisionNo: '원본 리비전', dimension: '판단 축', newState: '새 상태', rationale: '사유',
};

/** Message of one server/client error code. */
export function itemErrorText(code: string): string {
  switch (code) {
    case 'required': return '필수 항목입니다';
    case 'required_one': return '관찰 사실과 기대·기준 중 하나는 써야 합니다';
    case 'too_long': return '입력 길이가 너무 깁니다';
    case 'malformed': return '사용할 수 없는 문자가 들어 있습니다';
    case 'bad_kind': return '출처 종류 확인 필요. 목록에서 다시 골라 주세요';
    case 'not_found': return '찾을 수 없는 항목입니다';
    case 'inactive': return '비활성 항목에는 연결할 수 없습니다';
    case 'archived': return '보관된 Item은 바꿀 수 없습니다';
    case 'unchanged': return '현재와 같은 상태입니다';
    case 'invalid_state': return '이 판단 축에서 쓸 수 없는 상태입니다';
    default: return `입력을 확인해 주세요 (${code})`;
  }
}

export type FormErrors = Record<string, string>;
/** Control keys: a content field, `owner`, `evidenceList`, `evidence.<index>.<field>`, `form` (a visible form error for what no control owns). */
export const evidenceKey = (index: number, field: EvidenceField | string): string => `evidence.${index}.${field}`;

/**
 * Server `invalid` paths → controls. `evidence.<i>.<field>` goes to that row's control, `owner`/`ownerModelId`/`ownerSoftwareId` to the owner
 * controls, `evidence` itself (the cap) to the list; anything else lands on a visible form error naming its path. One message per key, first wins.
 * `known` lists the content fields the active form shows.
 */
export function mapItemErrors(errors: readonly FieldError[], known: readonly string[], evidenceCount: number): FormErrors {
  const out: FormErrors = {};
  const put = (key: string, code: string) => { out[key] ??= itemErrorText(code); };
  for (const { path, code } of errors) {
    const [head = '', second, third] = path;
    if (head === 'evidence' && second !== undefined) {
      const index = Number(second);
      if (Number.isInteger(index) && index >= 0 && index < evidenceCount && (EVIDENCE_FIELDS as readonly string[]).includes(third ?? '')) { put(evidenceKey(index, third!), third === 'sourceKind' && code === 'malformed' ? 'bad_kind' : code); continue; }
      if (Number.isInteger(index) && index >= 0 && index < evidenceCount) { put(`evidence.${index}`, code); continue; }
    } else if (head === 'evidence') { put('evidenceList', code); continue; }
    else if (head === 'owner' || head === 'ownerModelId' || head === 'ownerSoftwareId') { put('owner', code); continue; }
    else if (known.includes(head)) { put(head, code); continue; }
    const where = path.map((part, i) => (i === 0 ? FIELD_LABEL[part] ?? part : part)).join(' › ');
    out['form'] ??= `${where || '입력'}: ${itemErrorText(code)}`;
  }
  return out;
}

const textError = (value: string, max: number): string | null => (length(value) > max ? itemErrorText('too_long') : null);

/** The client's checks, with the server's limits; the server stays the authority (blank-only text counts as empty here as there). */
export function validateForm(form: WriteForm, mode: WriteMode): FormErrors {
  const out: FormErrors = {};
  const put = (key: string, message: string | null) => { if (message !== null) out[key] ??= message; };
  if (mode !== 'revise') {
    put('owner', form.modelId === '' ? '소유 대상을 골라 주세요' : form.ownerKind === 'software' && form.softwareId === '' ? 'SW 버전을 골라 주세요' : null);
  }
  put('title', form.title.trim() === '' ? itemErrorText('required') : textError(form.title, ITEM_LIMITS.title));
  for (const field of ['observation', 'expected', 'analysisOpinion', 'improvement'] as const) put(field, textError(form[field], ITEM_LIMITS.body));
  if (form.observation.trim() === '' && form.expected.trim() === '') put('observation', itemErrorText('required_one'));
  if (mode === 'revise') put('changeNote', form.changeNote.trim() === '' ? itemErrorText('required') : textError(form.changeNote, ITEM_LIMITS.changeNote));
  if (mode !== 'derive') {
    form.evidence.forEach((row, i) => {
      if (!(EVIDENCE_SOURCE_KINDS as readonly string[]).includes(row.sourceKind)) out[evidenceKey(i, 'sourceKind')] ??= itemErrorText('bad_kind');
      put(evidenceKey(i, 'sourceOwner'), row.sourceOwner.trim() === '' ? itemErrorText('required') : textError(row.sourceOwner, ITEM_LIMITS.evidenceField));
      put(evidenceKey(i, 'sourceRef'), row.sourceRef.trim() === '' ? itemErrorText('required') : textError(row.sourceRef, ITEM_LIMITS.evidenceField));
      for (const field of ['sourceVersion', 'contentHash', 'locator'] as const) put(evidenceKey(i, field), textError(row[field], ITEM_LIMITS.evidenceField));
      put(evidenceKey(i, 'note'), textError(row.note, ITEM_LIMITS.evidenceNote));
    });
    if (form.evidence.length > ITEM_LIMITS.evidence) put('evidenceList', itemErrorText('too_long'));
  }
  return out;
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value);
const evidenceInput = (row: EvidenceRow): EvidenceInput => ({
  sourceKind: row.sourceKind, sourceOwner: row.sourceOwner, sourceRef: row.sourceRef, sourceVersion: orNull(row.sourceVersion), contentHash: orNull(row.contentHash), locator: orNull(row.locator), note: orNull(row.note),
});
const contentInput = (form: WriteForm) => ({
  typeCode: form.typeCode, title: form.title, observation: orNull(form.observation), expected: orNull(form.expected), analysisOpinion: orNull(form.analysisOpinion), improvement: orNull(form.improvement),
});
const ownerInput = (form: WriteForm) => (form.ownerKind === 'software' ? { ownerSoftwareId: form.softwareId } : { ownerModelId: form.modelId });

export const createInput = (form: WriteForm): ItemCreateInput => ({ ...ownerInput(form), ...contentInput(form), evidence: form.evidence.map(evidenceInput) });
export const reviseInput = (id: string, form: WriteForm): ItemReviseInput => ({ id, ...contentInput(form), evidence: form.evidence.map(evidenceInput), changeNote: form.changeNote });
/** `itemDerive` accepts no evidence. */
export const deriveInput = (sourceItemId: string, sourceRevisionNo: number, form: WriteForm): ItemDeriveInput => ({ sourceItemId, sourceRevisionNo, ...ownerInput(form), ...contentInput(form) });

export const ownerLine = (owner: ItemOwner): string => (owner.kind === 'software' ? `SW 버전 · ${owner.modelName} / ${owner.versionLabel}` : `모델 · ${owner.modelName}`);
