import type { FieldError } from '@ap/contracts';
import type { ModelTopViewData } from '../../endpoints';

/** `sha256:<64 hex>` → the first 8 hex digits, enough to tell two Revisions apart in a line. */
export const shortRevision = (revision: string): string => revision.replace(/^sha256:/, '').slice(0, 8);

export const START_DEFAULT = '__default__';
export const startLabel = (version: string | null): string => (version === null ? '모델 기본' : version);

type Resolved = NonNullable<ModelTopViewData['resolved']>;
/** The header line naming what is shown. */
export const appliedLine = (resolved: Resolved): string =>
  `적용: ${startLabel(resolved.fromSoftwareVersion)} · Layout ${resolved.layoutId} · Revision ${shortRevision(resolved.revision)}`;

const FIELD_TEXT: Record<string, string> = {
  'modelId:not_found': '이 모델을 찾을 수 없습니다.',
  'fromSoftwareId:software_not_of_model': '이 모델의 SW 버전이 아닙니다.',
  'revision:revision_not_found': '게시된 Revision을 찾을 수 없거나 해시가 맞지 않습니다.',
};
/** Server field errors of link by form field (`revision`, `fromSoftwareId`); anything else lands on `form`. */
export function linkFieldErrors(errors: readonly FieldError[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    const head = error.path[0] ?? '';
    const key = head === 'revision' || head === 'fromSoftwareId' ? head : 'form';
    out[key] ??= FIELD_TEXT[`${head}:${error.code}`] ?? '입력을 확인해 주세요.';
  }
  return out;
}
