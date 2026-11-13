import * as React from 'react';

import { SESSION_DRAFT_COPY } from '@/lib/copy/session-draft';
import { useHostSeam } from '@/lib/host/host-seam';
import { type DraftJson, type SessionDraftBinding, currentSessionDraftBinding, discardSessionDraft, registerSessionDraft, takeSessionDraft } from './registry';

export type UseSessionDraftOptions<T> = {
  /** One key per form instance kind (with the record id where a form is per record); `null` registers and restores nothing. */
  key: string | null;
  /** What this form keeps across a session expiry: plain user-entered text/choices only, or `null` when there is nothing to keep. */
  read: () => DraftJson | null;
  /** Checks a stored value's shape; `null` drops it. */
  parse: (value: DraftJson) => T | null;
  /** Puts a restored value back into the form. */
  restore: (value: T) => void;
  /** When the stored draft is taken: on mount and each time this turns true (a dialog opening). Default `true`. */
  active?: boolean;
};

/**
 * Keeps a form's in-progress input across a session expiry (#1887): registers `read` with the draft registry while mounted and, once the
 * next ready session of the same user mounts the form (and `active` is true), restores the stored draft and shows one notice.
 * `discard` deletes a stored draft (successful submit, explicit cancel or close).
 */
export function useSessionDraft<T>({ key, read, parse, restore, active = true }: UseSessionDraftOptions<T>): { discard: () => void } {
  const seam = useHostSeam();
  const latest = React.useRef({ read, parse, restore, seam });
  React.useLayoutEffect(() => {
    latest.current = { read, parse, restore, seam };
  });

  const binding = React.useRef<SessionDraftBinding | null>(null);
  React.useEffect(() => {
    if (key === null) return;
    // Bound once per registration: a late cleanup (a submit resolving after a 401 retired the session) deletes this form's own snapshot.
    binding.current = currentSessionDraftBinding();
    return registerSessionDraft(key, () => latest.current.read());
  }, [key]);

  React.useEffect(() => {
    if (key === null || !active) return;
    const stored = takeSessionDraft(key);
    if (stored === null) return;
    const { parse: parseNow, restore: restoreNow, seam: host } = latest.current;
    const value = parseNow(stored);
    if (value === null) return;
    restoreNow(value);
    if (host.notify) host.notify({ tone: 'info', message: SESSION_DRAFT_COPY.restored });
    else host.notifySuccess(SESSION_DRAFT_COPY.restored);
  }, [key, active]);

  const discard = React.useCallback(() => {
    if (key !== null) discardSessionDraft(key, binding.current ?? undefined);
  }, [key]);
  return { discard };
}

const isRecord = (value: DraftJson): value is { [key: string]: DraftJson } => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Field readers for `parse`: a stored value that is not a record, or a field of the wrong type, reads as absent. */
export function draftRecord(value: DraftJson): { [key: string]: DraftJson } | null {
  return isRecord(value) ? value : null;
}

export function draftString(record: { [key: string]: DraftJson }, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' ? value : null;
}

export function draftStrings(record: { [key: string]: DraftJson }, field: string): string[] | null {
  const value = record[field];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : null;
}
