import { narrowCondition, type Condition, type ConditionPreset, type GlobalContext, type Pair } from '@ap/contracts';
import { useMemo } from 'react';
import { useHostPlatform } from './platform';
import type { MenuEntry } from './registry';

type PresetMenu = Pick<MenuEntry, 'conditionPresets' | 'conditionPreset'> | null | undefined;

/**
 * The preset a page value names. Only with an absent page value (an unknown explicit id takes the default) the first declared preset whose axes cover every non-empty axis of `condition`,
 * else the menu's default, so the URL alone decides it. Null for a menu without presets (06 §6.4, ADR-0083).
 */
export function activeConditionPreset(menu: PresetMenu, page: readonly Pair[], condition: Condition | null = null): ConditionPreset | null {
  const { conditionPresets: presets, conditionPreset: holder } = menu ?? {};
  if (!presets || !holder) return null;
  const value = page.find(([key]) => key === holder.key)?.[1];
  const named = presets.find(preset => preset.id === value);
  if (named) return named;
  const used = Object.keys(condition ?? {}).filter(axis => condition?.[axis]?.length);
  const covering = value === undefined && used.length ? presets.find(preset => used.every(axis => preset.axes.includes(axis))) : undefined;
  return covering ?? presets.find(preset => preset.id === holder.default) ?? null;
}

/**
 * `global` as the menu's query sees it: the Condition keeps only the active preset's axes. The same object when the menu has no presets.
 * Only the request projection and identity use this; the global Condition, the URL and pane copies stay whole.
 */
export function narrowedGlobal(menu: PresetMenu, page: readonly Pair[], global: GlobalContext): GlobalContext {
  const preset = activeConditionPreset(menu, page, global.condition);
  return preset === null ? global : { ...global, condition: narrowCondition(global.condition, preset.axes) };
}

export type ConditionPresetView = {
  /** The page key that holds the preset id. */
  key: string;
  presets: readonly ConditionPreset[];
  /** The preset the draft shows; in live mode the applied one. Switch with `useQueryDraft().setDraftPage({ [key]: id })`. */
  activeId: string;
  /** The preset the current query uses. Differs from `activeId` only in apply mode with an unapplied switch. */
  appliedId: string;
  /** Equipment axis ids the active preset leaves out: their values stay in the global Condition but are not sent. */
  outsideAxes: readonly string[];
};

/** Read-only view of the current screen's Condition presets for the shell; null when the menu declares none. Works per pane (each screen has its own page). */
export function useConditionPreset(): ConditionPresetView | null {
  const { route, page, global, queryDraft, equipmentAxes } = useHostPlatform();
  const menu = route?.menu;
  const holder = menu?.conditionPreset;
  const active = activeConditionPreset(menu, queryDraft.draft.page, queryDraft.draft.global.condition);
  const applied = activeConditionPreset(menu, page, global.condition);
  if (!menu?.conditionPresets || !holder || !active || !applied) return null;
  return { key: holder.key, presets: menu.conditionPresets, activeId: active.id, appliedId: applied.id, outsideAxes: equipmentAxes.map(axis => axis.id).filter(id => !active.axes.includes(id)) };
}

/**
 * The global Context a query of this screen sees: `narrowedGlobal` over the applied page and global, the same arguments `projectMenuContext` uses.
 * Not the draft: in apply mode a preset switch changes it only on Apply. The same object as `global` for a menu without presets. Works per pane.
 * For request identity and export headers; the global Condition, the URL and pane copies stay whole.
 */
export function useQueryContext(): GlobalContext {
  const { route, page, global } = useHostPlatform();
  const menu = route?.menu;
  return useMemo(() => narrowedGlobal(menu, page, global), [menu, page, global]);
}
