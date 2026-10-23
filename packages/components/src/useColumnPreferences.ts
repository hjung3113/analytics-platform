import { useEffect, useState } from 'react';
import type { ColumnPinningState, ColumnSizingState, OnChangeFn, VisibilityState } from '@tanstack/react-table';
import { readLocalStorage, writeLocalStorage } from '@ap/ui';

export type Preferences = { sizing: ColumnSizingState; visibility: VisibilityState; pinning: ColumnPinningState };
const defaults: Preferences = { sizing: {}, visibility: {}, pinning: { left: [], right: [] } };
function readPreferences(key: string): Preferences {
  return readLocalStorage(key, raw => {
    const p = JSON.parse(raw || 'null');
    if (!p || typeof p !== 'object') return defaults;
    return {
      sizing: Object.fromEntries(Object.entries(p.sizing || {}).filter(([, v]) => typeof v === 'number' && v >= 60 && v <= 600)) as ColumnSizingState,
      visibility: Object.fromEntries(Object.entries(p.visibility || {}).filter(([, v]) => typeof v === 'boolean')) as VisibilityState,
      pinning: { left: Array.isArray(p.pinning?.left) ? p.pinning.left.filter((v: unknown) => typeof v === 'string') : [], right: [] },
    };
  }, defaults);
}

/** Column visibility, width and left-pin preferences, stored in the browser per `preferenceKey` (§15, ADR-0024). */
export function useColumnPreferences(preferenceKey: string) {
  const [preferences, setPreferences] = useState(() => readPreferences(preferenceKey));
  useEffect(() => { writeLocalStorage(preferenceKey, JSON.stringify(preferences)); /* memory-only when storage refuses */ }, [preferences, preferenceKey]);
  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = u => setPreferences(pr => ({ ...pr, sizing: typeof u === 'function' ? u(pr.sizing) : u }));
  const onColumnVisibilityChange: OnChangeFn<VisibilityState> = u => setPreferences(pr => ({ ...pr, visibility: typeof u === 'function' ? u(pr.visibility) : u }));
  // Only the user's left pins are stored: the merged state carries the derived right pin of `_action`.
  const onColumnPinningChange = (actionPinned: boolean): OnChangeFn<ColumnPinningState> => u => setPreferences(pr => {
    const next = typeof u === 'function' ? u({ left: pr.pinning.left ?? [], right: actionPinned ? ['_action'] : [] }) : u;
    return { ...pr, pinning: { left: (next.left ?? []).filter(id => id !== '_action'), right: [] } };
  });
  /** Visibility, width and pin back to the column defaults; sort, page and selection stay. */
  const resetPreferences = () => setPreferences({ sizing: {}, visibility: {}, pinning: { left: [], right: [] } });
  return { preferences, onColumnSizingChange, onColumnVisibilityChange, onColumnPinningChange, resetPreferences };
}
