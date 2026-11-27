import { ApiError } from '../../../lib/api/types';
import { ADMIN_REGISTRY_COPY } from '../../../lib/copy/admin-registry';

/** True when the server rejected `field` with `code` (a 422 `detail.fields` entry). */
export function hasFieldCode(error: unknown, field: string, code: string): boolean {
  if (!(error instanceof ApiError) || !Array.isArray(error.detail?.fields)) return false;
  return (error.detail.fields as { path?: unknown; code?: unknown }[]).some(
    (entry) => Array.isArray(entry.path) && entry.path[0] === field && entry.code === code,
  );
}

/** The slug field's message for a rejected slug format, or null. */
export function slugFormatError(error: unknown): string | null {
  return hasFieldCode(error, 'slug', 'invalid_slug_format') ? ADMIN_REGISTRY_COPY.slugFormat : null;
}
