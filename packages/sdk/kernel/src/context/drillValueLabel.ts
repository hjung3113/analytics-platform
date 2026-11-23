import type { DrillLevel, MenuMeta, Pair } from '@ap/contracts';
import type { Lang } from '../i18n';

export function drillValueLabel(level: DrillLevel, value: string | null, lang: Lang): { valueLabel?: string } {
  if (value === null || !level.valueLabel) return {};
  try {
    return { valueLabel: level.valueLabel(value, lang) || value };
  } catch {
    // Keep the raw identifier visible if the menu cannot format it.
    return { valueLabel: value };
  }
}

/** The drill steps a page holds, in level order, for a query-history row (#2770): each level's label and its `valueLabel` name (raw value as fallback). */
export function drillHistorySummary(drill: MenuMeta['drill'], page: readonly Pair[], lang: Lang): { key: string; label: string; value: string }[] {
  const items: { key: string; label: string; value: string }[] = [];
  for (const level of drill?.levels ?? []) {
    const value = page.find(([key]) => key === level.key)?.[1];
    if (value) items.push({ key: level.key, label: level.label[lang], value: drillValueLabel(level, value, lang).valueLabel ?? value });
  }
  return items;
}
