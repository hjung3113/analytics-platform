import { useCallback, useState } from 'react';
import { useI18n } from '@ap/kernel';
import { Button } from '@ap/ui';

export type FilterDraft = {
  /** Draft text of every field; keys the applied record does not carry read as ''. */
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  /** Fields whose draft differs from the applied value (clearing an applied field counts; keystrokes do not). */
  changedCount: number;
  dirty: boolean;
  /** Drops the edits: back to the applied values, or to `next` (e.g. all-empty after a clear). */
  reset: (next?: Record<string, string>) => void;
  /** Every field as a page-key patch; empty drafts become `null`. The consumer adds `page: null` and calls `setPage` once. */
  patch: () => Record<string, string | null>;
};

const keyOf = (applied: Record<string, string>) => JSON.stringify(Object.entries(applied).sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * Draft values for a filter form whose changes only take effect on an explicit apply (ADR-0037).
 * The drafts rebase onto `applied` when the applied URL values change (navigation, Back/Forward, reset), never while the
 * user edits an unchanged applied value. Pass `identity` when the applied values are display text derived from richer
 * state (raw instants, time zone): a change of identity rebases even if the displayed text stays equal.
 */
export function useFilterDraft(applied: Record<string, string>, identity?: string): FilterDraft {
  const appliedKey = identity ?? keyOf(applied);
  const [draft, setDraft] = useState(applied);
  const [syncedKey, setSyncedKey] = useState(appliedKey);
  let current = draft;
  if (syncedKey !== appliedKey) {
    // Render-phase adjustment from changed inputs (React's documented alternative to an effect + extra render).
    setSyncedKey(appliedKey);
    setDraft(applied);
    current = applied;
  }

  const keys = [...new Set([...Object.keys(applied), ...Object.keys(current)])];
  const values = Object.fromEntries(keys.map(key => [key, current[key] ?? '']));
  const changedCount = keys.filter(key => values[key] !== (applied[key] ?? '')).length;

  const set = useCallback((key: string, value: string) => setDraft(previous => ({ ...previous, [key]: value })), []);
  const reset = (next?: Record<string, string>) => setDraft(next ?? applied);
  const patch = () => Object.fromEntries(keys.map(key => [key, values[key] === '' ? null : values[key]!]));

  return { values, set, changedCount, dirty: changedCount > 0, reset, patch };
}

/** The apply submit of a draft filter form: disabled without changes, `적용 (n)` with them. Place it in the bar's `actions`. */
export function FilterApplyButton({ changedCount }: { changedCount: number }) {
  const { t } = useI18n();
  return <Button type="submit" size="sm" variant="secondary" disabled={changedCount === 0}>
    {changedCount > 0 ? t('applyWithCount', { count: changedCount }) : t('apply')}
  </Button>;
}
