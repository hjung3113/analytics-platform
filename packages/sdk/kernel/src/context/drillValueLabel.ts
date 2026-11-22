import type { DrillLevel } from '@ap/contracts';
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
