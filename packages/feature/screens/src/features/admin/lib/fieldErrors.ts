import { ApiError } from '../../../lib/api/types';

/** Shown on a slug field the server rejected with `invalid_slug_format` (`^[a-z][a-z0-9-]*$`). Shared by the registry dialogs. */
export const SLUG_FORMAT_MESSAGE = '슬러그는 영문 소문자로 시작하고 영문 소문자·숫자·하이픈(-)만 씁니다. 예: power-bi';

/** True when the server rejected `field` with `code` (a 422 `detail.fields` entry). */
export function hasFieldCode(error: unknown, field: string, code: string): boolean {
  if (!(error instanceof ApiError) || !Array.isArray(error.detail?.fields)) return false;
  return (error.detail.fields as { path?: unknown; code?: unknown }[]).some(
    (entry) => Array.isArray(entry.path) && entry.path[0] === field && entry.code === code,
  );
}

/** The slug field's message for a rejected slug format, or null. */
export function slugFormatError(error: unknown): string | null {
  return hasFieldCode(error, 'slug', 'invalid_slug_format') ? SLUG_FORMAT_MESSAGE : null;
}
