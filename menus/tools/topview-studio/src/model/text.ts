/** Small text helpers of the Layouts screen. */
import type { FieldError } from '@ap/contracts';

const SEOUL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** `YYYY-MM-DD HH:mm` in Seoul time for a server instant. */
export function formatPublished(iso: string): string {
  const parts = Object.fromEntries(SEOUL.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const CODE_TEXT: Record<string, string> = {
  duplicate: '이미 사용 중인 EV Template id입니다.',
  bundled_template_id: '기본 제공 EV Template id는 사용할 수 없습니다.',
  invalid: '형식이 올바르지 않습니다.',
  not_found: '찾을 수 없습니다.',
  id_mismatch: 'Layout id가 문서의 id와 다릅니다.',
  kind_not_equipment_layout: 'equipment-layout만 저장할 수 있습니다.',
  hash_mismatch: '저장된 Revision이 해시와 맞지 않습니다.',
};

export const fieldErrorCode = (code: string): string => CODE_TEXT[code] ?? code;

/** `path: message` of one server field error, for the first-error line of a refused write. */
export const fieldErrorLine = (error: FieldError): string => `${error.path.join('.') || '(root)'}: ${fieldErrorCode(error.code)}`;

export const errorFor = (errors: readonly FieldError[], field: string): FieldError | undefined => errors.find((e) => e.path[0] === field);
