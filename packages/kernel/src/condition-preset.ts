import { narrowCondition, type ConditionPreset, type GlobalContext, type Pair } from '@ap/contracts';
import { useHostPlatform } from './platform';
import type { MenuEntry } from './registry';

type PresetMenu = Pick<MenuEntry, 'conditionPresets' | 'conditionPreset'> | null | undefined;

/** The preset a page value names; the menu's default when the value is absent or unknown. Null for a menu without presets (06 §6.4, ADR-0083). */
export function activeConditionPreset(menu: PresetMenu, page: readonly Pair[]): ConditionPreset | null {
  const { conditionPresets: presets, conditionPreset: holder } = menu ?? {};
  if (!presets || !holder) return null;
  const value = page.find(([key]) => key === holder.key)?.[1];
  return presets.find(preset => preset.id === value) ?? presets.find(preset => preset.id === holder.default) ?? null;
}

/**
 * `global` as the menu's query sees it: the Condition keeps only the active preset's axes. The same object when the menu has no presets.
 * Only the request projection and identity use this; the global Condition, the URL and pane copies stay whole.
 */
export function narrowedGlobal(menu: PresetMenu, page: readonly Pair[], global: GlobalContext): GlobalContext {
  const preset = activeConditionPreset(menu, page);
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
  const { route, page, queryDraft, equipmentAxes } = useHostPlatform();
  const menu = route?.menu;
  const holder = menu?.conditionPreset;
  const active = activeConditionPreset(menu, queryDraft.draft.page);
  const applied = activeConditionPreset(menu, page);
  if (!menu?.conditionPresets || !holder || !active || !applied) return null;
  return { key: holder.key, presets: menu.conditionPresets, activeId: active.id, appliedId: applied.id, outsideAxes: equipmentAxes.map(axis => axis.id).filter(id => !active.axes.includes(id)) };
}
