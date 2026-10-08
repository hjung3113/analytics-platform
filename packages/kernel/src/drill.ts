import { useCallback, useMemo } from 'react';
import type { Text } from '@ap/contracts';
import { usePlatform } from './platform';

/** One declared step plus the current page value. Empty string is absent (`null`). */
export type DrillLevelState = { key: string; label: Text; value: string | null };
/** A filled step on the leading run. `value` is the raw page-key string (06 §6.4). */
export type DrillTrailStep = { key: string; label: Text; value: string };
/** First later step that has a value while an earlier step is empty (06 §6.4 format error). */
export type DrillInvalid = { key: string; value: string };

export type DrillState = {
  levels: DrillLevelState[];
  /** Count of leading consecutive filled steps. */
  depth: number;
  trail: DrillTrailStep[];
  invalid: DrillInvalid | null;
  /**
   * Write `key` and clear every later step in one `setPage` (history push).
   * Only the next step (`index === depth`) or an already filled step is allowed.
   */
  enter: (key: string, value: string) => void;
  /** Keep the first `n` steps and clear the rest (push). `n === 0` is the summary. */
  goTo: (n: number) => void;
};

/**
 * In-page drill for the matched menu (06 §6.4, ADR-0025).
 * A menu without `drill` reports no levels. Step changes are not usage events.
 */
export function useDrill(): DrillState {
  const { route, pageParam, setPage } = usePlatform();
  const declared = route?.menu.drill?.levels;

  const levels = useMemo<DrillLevelState[]>(() => (declared ?? []).map(level => {
    const raw = pageParam(level.key);
    return { key: level.key, label: level.label, value: raw === null || raw === '' ? null : raw };
  }), [declared, pageParam]);

  const depth = useMemo(() => {
    let count = 0;
    for (const level of levels) {
      if (level.value === null) break;
      count += 1;
    }
    return count;
  }, [levels]);

  const trail = useMemo(() => levels.slice(0, depth).flatMap(level => (
    level.value === null ? [] : [{ key: level.key, label: level.label, value: level.value }]
  )), [levels, depth]);

  const invalid = useMemo<DrillInvalid | null>(() => {
    for (let i = depth; i < levels.length; i += 1) {
      const value = levels[i]?.value;
      if (value !== null && value !== undefined) return { key: levels[i].key, value };
    }
    return null;
  }, [levels, depth]);

  const enter = useCallback((key: string, value: string) => {
    const list = declared ?? [];
    const index = list.findIndex(level => level.key === key);
    if (index < 0) throw new Error(`drill enter "${key}" is not a declared level`);
    if (index > depth) throw new Error(`drill enter "${key}" is past the next level`);
    const patch: Record<string, string | null> = { [key]: value };
    for (let i = index + 1; i < list.length; i += 1) patch[list[i]!.key] = null;
    setPage(patch);
  }, [declared, depth, setPage]);

  const goTo = useCallback((n: number) => {
    const list = declared ?? [];
    if (!Number.isInteger(n) || n < 0 || n > list.length) throw new Error(`drill goTo ${n} is outside 0..${list.length}`);
    const patch: Record<string, string | null> = {};
    for (let i = n; i < list.length; i += 1) patch[list[i]!.key] = null;
    setPage(patch);
  }, [declared, setPage]);

  return { levels, depth, trail, invalid, enter, goTo };
}
