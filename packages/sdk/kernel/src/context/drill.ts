import { use, useCallback, useMemo } from 'react';
import type { DrillLevel, Pair, Text } from '@ap/contracts';
import { useI18n } from '../i18n';
import { usePlatform } from '../platform/platform';
import type { MenuPlatform } from '../platform/types';
import { LentPanelPlatformContext, PaneScreenContext, ScreenContext } from '../platform/contexts';
import { drillGap, drillLevelChanged, drillLevelKeys, dropDrillResetKeys } from './drillReset';
import { drillValueLabel } from './drillValueLabel';

/** One declared step plus the current page value. Empty string is absent (`null`). */
export type DrillLevelState = { key: string; label: Text; value: string | null; valueLabel?: string; basis?: string };
/** A filled step on the leading run. `value` is the raw page-key string (06 §6.4). */
export type DrillTrailStep = DrillLevelState & { value: string };
/** First value after an empty step, or a basis without a step value (06 §6.4 format errors). */
export type DrillInvalid = DrillTrailStep;

type DrillEntryOptions = { basis: string | undefined };

export type DrillState = {
  levels: DrillLevelState[];
  /** Count of leading consecutive filled steps. */
  depth: number;
  trail: DrillTrailStep[];
  invalid: DrillInvalid | null;
  /** Level that was dropped because its explicit basis was unavailable. */
  rejectedBasis: { levelKey: string } | null;
  /**
   * Write `key` and clear every later step in one `setPage` (history push); the menu's `drill.resetKeys` go in the same write.
   * Only the next step (`index === depth`) or an already filled step is allowed. Omit options to keep
   * the step's basis, or pass `{ basis: undefined }` to choose the default.
   */
  enter: (key: string, value: string, options?: DrillEntryOptions) => void;
  /** Keep the first `n` steps and clear the rest (push, `drill.resetKeys` cleared too when a step changes). `n === 0` is the summary. */
  goTo: (n: number) => void;
};

function drillEntryPatch(levels: readonly DrillLevel[], page: readonly Pair[], key: string, value: string, options?: DrillEntryOptions) {
  const index = levels.findIndex(level => level.key === key);
  if (index < 0) throw new Error(`drill enter "${key}" is not a declared level`);
  if (levels.slice(0, index).some(level => !page.find(([name]) => name === level.key)?.[1])) {
    throw new Error(`drill enter "${key}" is past the next level`);
  }
  const level = levels[index];
  if (level === undefined) throw new Error(`drill enter "${key}" is not a declared level`);
  const { basisKey, bases } = level;
  if (options?.basis !== undefined && !bases?.some(basis => basis.id === options.basis)) {
    throw new Error(`drill enter "${key}" needs a declared basis`);
  }
  const patch = Object.create(null) as Record<string, string | null>;
  patch[key] = value;
  if (basisKey !== undefined && (value === '' || (options && 'basis' in options))) patch[basisKey] = value === '' ? null : options?.basis ?? null;
  for (const laterKey of levels.slice(index + 1).flatMap(drillLevelKeys)) patch[laterKey] = null;
  return patch;
}

/** The page pairs that entering this drill would write, including basis and reset keys, without navigating. */
export function drillEntryPage({ route, page }: Pick<MenuPlatform, 'route' | 'page'>, key: string, value: string, options?: DrillEntryOptions): Pair[] {
  const menu = route?.menu;
  const patch = dropDrillResetKeys(menu, page, drillEntryPatch(menu?.drill?.levels ?? [], page, key, value, options));
  return [
    ...page.filter(([name]) => !Object.hasOwn(patch, name)),
    ...Object.entries(patch).flatMap(([name, next]): Pair[] => next ? [[name, next]] : []),
  ];
}

/**
 * In-page drill for the matched menu (06 §6.4, ADR-0025).
 * The Registry throws if a drill level key is missing from the menu's `contextResetKeys`.
 * A menu without `drill` reports no levels. Step changes are not usage events.
 */
export function useDrill(): DrillState {
  const { route, page, pageParam, setPage } = usePlatform();
  const lent = use(LentPanelPlatformContext);
  const screen = lent ? null : use(PaneScreenContext) ?? use(ScreenContext);
  const { lang } = useI18n();
  const declared = route?.menu.drill?.levels;

  const levels = useMemo<DrillLevelState[]>(() => (declared ?? []).map(level => {
    const raw = pageParam(level.key);
    const value = raw || null;
    const basis = level.basisKey === undefined ? null : pageParam(level.basisKey);
    return { key: level.key, label: level.label, value, ...drillValueLabel(level, value, lang), ...(value !== null && basis !== null ? { basis } : {}) };
  }), [declared, pageParam, lang]);

  const depth = useMemo(() => {
    let count = 0;
    for (const level of levels) {
      if (level.value === null) break;
      count += 1;
    }
    return count;
  }, [levels]);

  const trail = useMemo(() => levels.slice(0, depth).flatMap(level => (
    level.value === null ? [] : [{ ...level, value: level.value }]
  )), [levels, depth]);

  const invalid = useMemo<DrillInvalid | null>(() => {
    const gap = drillGap(declared ?? [], page);
    if (gap === null) return null;
    const { key, label } = gap.level;
    const valueLabel = levels.find(level => level.key === key)?.valueLabel;
    return { key, label, value: gap.value, ...(valueLabel === undefined ? {} : { valueLabel }) };
  }, [declared, page, levels]);

  const enter = useCallback<DrillState['enter']>((key, value, options) => {
    const patch = drillEntryPatch(declared ?? [], page, key, value, options);
    setPage(patch, drillLevelChanged(route?.menu, page, patch) ? { focus: 'drill' } : undefined);
  }, [declared, page, route, setPage]);

  const goTo = useCallback((n: number) => {
    const list = declared ?? [];
    if (!Number.isInteger(n) || n < 0 || n > list.length) throw new Error(`drill goTo ${n} is outside 0..${list.length}`);
    const patch = Object.create(null) as Record<string, string | null>;
    for (const key of list.slice(n).flatMap(drillLevelKeys)) patch[key] = null;
    setPage(patch, drillLevelChanged(route?.menu, page, patch) ? { focus: 'drill' } : undefined);
  }, [declared, page, route, setPage]);

  return { levels, depth, trail, invalid, rejectedBasis: screen?.rejectedBasis ?? null, enter, goTo };
}
