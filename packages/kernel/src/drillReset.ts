import type { MenuEntry } from './registry';

/** A current page value; page pairs and drill level states both fit. */
type Current = readonly [string, string | null];

type DrillRule = { drill?: Pick<NonNullable<MenuEntry['drill']>, 'levels' | 'resetKeys'> };

/** A page value as the drill reads it: empty string and missing are the same absent step (06 §6.4). */
const normalized = (value: string | null | undefined): string | null => (value === undefined || value === '' ? null : value);

/**
 * Whether `patch` changes the value of any declared drill level, comparing against `current` page pairs with `''`/missing = `null`.
 * `useDrill` uses it for its focus request, `setPage` for `dropDrillResetKeys`. Kernel-internal.
 */
export function drillLevelChanged(menu: DrillRule | null | undefined, current: readonly Current[], patch: Record<string, string | null>): boolean {
  const levels = menu?.drill?.levels;
  if (!levels) return false;
  return levels.some(({ key }) => Object.hasOwn(patch, key) && normalized(current.find(([k]) => k === key)?.[1]) !== normalized(patch[key]));
}

/**
 * The page keys `patch` removes in addition to its own: the menu's `drill.resetKeys` when the patch changes a drill level value (same write,
 * one history entry — 06 §6.4). A reset key the patch sets itself keeps the patch's value. Without `resetKeys` or without a level change
 * the patch is returned as is. History traversal never calls this. Kernel-internal.
 */
export function dropDrillResetKeys(menu: DrillRule | null | undefined, current: readonly Current[], patch: Record<string, string | null>): Record<string, string | null> {
  const resetKeys = menu?.drill?.resetKeys;
  if (!resetKeys || resetKeys.length === 0 || !drillLevelChanged(menu, current, patch)) return patch;
  // Null prototype: a page key named `__proto__` must be an own data entry, not a prototype write.
  const next: Record<string, string | null> = Object.assign(Object.create(null) as Record<string, string | null>, patch);
  for (const key of resetKeys) if (!Object.hasOwn(next, key)) next[key] = null;
  return next;
}
