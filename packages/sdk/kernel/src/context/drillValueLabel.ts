import type { DrillLevel } from '@ap/contracts';
import type { Lang } from '../i18n';

// Same signal as @ap/ui isProductionEnv, read without `process` types so the kernel dist build (types: []) compiles.
function isProduction(): boolean {
  const meta = import.meta as { env?: { PROD?: boolean } };
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  return meta.env?.PROD === true || g.process?.env?.NODE_ENV === 'production';
}

const warned = new Set<string>();

function warnFallback(level: DrillLevel, value: string, reason: 'returned an empty string' | 'threw'): void {
  if (isProduction()) return;
  const key = `${level.key}\u0000${value}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[@ap/kernel] DrillLevel "${level.key}" valueLabel ${reason} for value "${value}"; showing the raw value.`);
}

export function drillValueLabel(level: DrillLevel, value: string | null, lang: Lang): { valueLabel?: string } {
  if (value === null || !level.valueLabel) return {};
  try {
    const label = level.valueLabel(value, lang);
    if (label) return { valueLabel: label };
    warnFallback(level, value, 'returned an empty string');
  } catch {
    // Keep the raw identifier visible if the menu cannot format it.
    warnFallback(level, value, 'threw');
  }
  return { valueLabel: value };
}
