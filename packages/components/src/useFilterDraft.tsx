import { useCallback, useState, type ReactNode } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { RecoverButton } from './RecoverButton';

export type FilterDraft<K extends string> = {
  /** Draft text of every applied field; fields omitted by reset read as ''. */
  values: Record<K, string>;
  set: (key: K, value: string) => void;
  /** Fields whose draft differs from the applied value (clearing an applied field counts; keystrokes do not). */
  changedCount: number;
  /** Drops the edits: back to the applied values, or to `next` (e.g. all-empty after a clear). */
  reset: (next?: Partial<Record<K, string>>) => void;
  /** Every field as a page-key patch; empty drafts become `null`. The consumer adds `page: null` and calls `setPage` once. */
  patch: () => Record<K, string | null>;
};

const keyOf = (applied: Record<string, string>) => JSON.stringify(Object.entries(applied).sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * Draft values for a filter form whose changes only take effect on an explicit apply (ADR-0037).
 * The drafts rebase onto `applied` when the applied URL values change (navigation, Back/Forward, reset), never while the
 * user edits an unchanged applied value. Pass `identity` when the applied values are display text derived from richer
 * state (raw instants, time zone): a change of identity rebases even if the displayed text stays equal. `onRebase` runs in the
 * same render-phase branch (the caller may set its own state there to reset metadata that belongs to the draft).
 */
export function useFilterDraft<K extends string>(applied: Record<K, string>, identity?: string, onRebase?: () => void): FilterDraft<K> {
  const appliedKey = identity ?? keyOf(applied);
  const [draft, setDraft] = useState<Partial<Record<K, string>>>(applied);
  const [syncedKey, setSyncedKey] = useState(appliedKey);
  let current = draft;
  if (syncedKey !== appliedKey) {
    // Render-phase adjustment from changed inputs (React's documented alternative to an effect + extra render).
    setSyncedKey(appliedKey);
    setDraft(applied);
    current = applied;
    onRebase?.();
  }

  const keys = [...new Set([...Object.keys(applied), ...Object.keys(current)])] as K[];
  const values = Object.fromEntries(keys.map(key => [key, current[key] ?? ''])) as Record<K, string>;
  const changedCount = keys.filter(key => values[key] !== (applied[key] ?? '')).length;

  const set = useCallback((key: K, value: string) => setDraft(previous => ({ ...previous, [key]: value })), []);
  const reset = (next?: Partial<Record<K, string>>) => setDraft(next ?? applied);
  const patch = () => Object.fromEntries(keys.map(key => [key, values[key] === '' ? null : values[key]])) as Record<K, string | null>;

  return { values, set, changedCount, reset, patch };
}

/** The apply submit of a draft filter form: disabled without changes, `적용 (n)` with them. Place it in the bar's `actions`. */
export function FilterApplyButton({ changedCount }: { changedCount: number }) {
  const { t } = useI18n();
  return <Button type="submit" size="sm" variant="secondary" disabled={changedCount === 0}>
    {changedCount > 0 ? t('applyWithCount', { count: changedCount }) : t('apply')}
  </Button>;
}

export type ManagementFiltersOptions<K extends string> = {
  /** Applied values as display text, one per filter field. */
  applied: Record<K, string>;
  /** As `useFilterDraft`: rebase on this instead of the applied text when the text derives from richer state. */
  identity?: string;
  /** Page keys the clear sets to null; `page` is always added. */
  clearKeys: readonly string[];
  /** Builds the URL patch from the draft patch (validation included); null aborts the apply. Default: the draft patch as is. */
  toPatch?: (draftPatch: Record<K, string | null>) => Record<string, string | null> | null;
  /** Called from the render-phase rebase only (applied values or identity changed), never directly by `clear`. */
  onRebase?: () => void;
};

/**
 * The ADR-0037 wiring of a management filter bar in one place: draft + rebase, one-`setPage` apply that returns to page 1,
 * the footer clear button (only while a filter is applied), and the counts `ManagementLayout` shows. The menu keeps the
 * field meaning, the URL keys, the clear key list and the patch building/validation. The footer button leaves focus to
 * `PageFilterBar` (06 §26); a recovery button outside the bar (the invalid-filter alert's action) is `recoverButton`: always
 * built, and it calls `focusPageFallback` before `clear` because it disappears with the alert.
 */
export function useManagementFilters<K extends string>({ applied, identity, clearKeys, toPatch, onRebase }: ManagementFiltersOptions<K>) {
  const { t } = useI18n();
  const { setPage } = usePlatform();
  const draft = useFilterDraft(applied, identity, onRebase);
  const activeFilterCount = Object.values<string>(applied).filter(Boolean).length;
  const clear = () => {
    draft.reset({});
    setPage(Object.fromEntries([...clearKeys, 'page'].map(key => [key, null])));
  };
  const apply = () => {
    const patch = toPatch ? toPatch(draft.patch()) : draft.patch();
    if (patch !== null) setPage({ ...patch, page: null });
  };
  const clearButton: ReactNode = activeFilterCount > 0 ? <Button type="button" size="sm" variant="secondary" onClick={clear}>{t('clearFilters')}</Button> : null;
  const recoverButton: ReactNode = <RecoverButton label={t('clearFilters')} onRecover={clear} />;
  return {
    draft,
    clear,
    clearButton,
    recoverButton,
    barProps: { onApply: apply, actions: <><FilterApplyButton changedCount={draft.changedCount} />{clearButton}</> },
    layoutProps: { activeFilterCount, pendingFilterCount: draft.changedCount },
  };
}
