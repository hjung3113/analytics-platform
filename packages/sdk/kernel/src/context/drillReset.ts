import type { DrillLevel, GlobalContext, ModuleScopedId, Pair, Permission } from '@ap/contracts';
import type { MenuEntry } from '../registry/registry';

/** A current page value; page pairs and drill level states both fit. */
type Current = readonly [string, string | null];

type DrillRule = { drill?: Pick<NonNullable<MenuEntry['drill']>, 'levels' | 'resetKeys'> };

/** A page value as the drill reads it: empty string and missing are the same absent step (06 §6.4). */
const normalized = (value: string | null | undefined): string | null => (value === undefined || value === '' ? null : value);

type LevelKeys = Pick<DrillLevel, 'key' | 'basisKey'>;

export function drillLevelKeys({ key, basisKey }: LevelKeys): string[] {
  return basisKey === undefined ? [key] : [key, basisKey];
}

/** A retained basis key still opts in after the last alternative is removed. */
export function hasDrillBasis(drill: MenuEntry['drill']): boolean {
  return drill?.levels.some(level => level.basisKey !== undefined) ?? false;
}

/**
 * Whether `patch` changes the value of any declared drill level, comparing against `current` page pairs with `''`/missing = `null`.
 * `useDrill` uses it for its focus request, `setPage` for `dropDrillResetKeys`. Kernel-internal.
 */
export function drillLevelChanged(menu: DrillRule | null | undefined, current: readonly Current[], patch: Record<string, string | null>): boolean {
  const levels = menu?.drill?.levels;
  if (!levels) return false;
  return levels.flatMap(drillLevelKeys).some(key => Object.hasOwn(patch, key) && normalized(current.find(([k]) => k === key)?.[1]) !== normalized(patch[key]));
}

/**
 * The first value after an empty step or basis without a step value (06 §6.4 format errors). The screen query gate closes on either.
 */
export function drillGap<L extends LevelKeys>(levels: readonly L[], current: readonly Current[]): { level: L; value: string } | null {
  let empty = false;
  for (const level of levels) {
    const value = normalized(current.find(([k]) => k === level.key)?.[1]);
    if (value === null) {
      if (level.basisKey !== undefined && current.some(([key]) => key === level.basisKey)) return { level, value: '' };
      empty = true;
    }
    else if (empty) return { level, value };
  }
  return null;
}

type DrillProblem = { kind: 'format' } | { kind: 'basis'; index: number };

/** An unavailable basis in the valid prefix takes precedence over a later format error. */
export function firstDrillProblem(drill: MenuEntry['drill'], page: readonly Pair[], global: GlobalContext, can: (permission: Permission | ModuleScopedId) => boolean): DrillProblem | null {
  if (!drill) return null;
  const gap = drillGap(drill.levels, page);
  for (const [index, level] of drill.levels.entries()) {
    if (level === gap?.level) break;
    const { key, basisKey, bases } = level;
    if (basisKey === undefined) continue;
    const id = page.find(([name]) => name === basisKey)?.[1];
    if (id !== undefined && (!bases?.some(basis => basis.id === id) || drill.isBasisAvailable?.(key, id, global, can, page) === false)) {
      return { kind: 'basis', index };
    }
  }
  return gap === null ? null : { kind: 'format' };
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
