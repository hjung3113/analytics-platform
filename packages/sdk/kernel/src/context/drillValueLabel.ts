import type { DrillLevel } from '@ap/contracts';
import type { Lang } from '../i18n';

const warnedValues = new WeakMap<DrillLevel, Set<string>>();

function warnFormatterFailure(level: DrillLevel, value: string, failure: string) {
  // Same bundler-neutral production check as @ap/ui `isProductionEnv`: only a positive production signal silences it.
  const meta = import.meta as { env?: { PROD?: boolean } };
  const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
  if (meta.env?.PROD === true || g.process?.env?.NODE_ENV === 'production') return;

  let values = warnedValues.get(level);
  if (!values) {
    values = new Set();
    warnedValues.set(level, values);
  }
  if (values.has(value)) return;
  values.add(value);
  console.warn(`DrillLevel.valueLabel for "${level.key}" ${failure}.`);
}

export function drillValueLabel(level: DrillLevel, value: string | null, lang: Lang): { valueLabel?: string } {
  if (value === null || !level.valueLabel) return {};
  let failure = 'returned an empty string';
  try {
    const label = level.valueLabel(value, lang);
    if (label) return { valueLabel: label };
  } catch {
    failure = 'threw an exception';
  }
  warnFormatterFailure(level, value, failure);
  return { valueLabel: value };
}
