/** Locale each UI language formats numbers in. */
const NUMBER_LOCALE = { ko: 'ko-KR', en: 'en-US' } as const;

export interface FormatNumberOptions {
  /** Exactly this many fraction digits (shorthand for equal `minimumFractionDigits` and `maximumFractionDigits`). */
  decimals?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * The one number display rule: digits grouped and rounded the way the user's language does (`ko` → `ko-KR`, `en` → `en-US`).
 * Menus call this instead of `toLocaleString`, so the language switch reaches every number. Pure; a non-finite value prints as `Intl` does (`NaN`, `∞`).
 */
export function formatNumber(value: number, lang: 'ko' | 'en', options: FormatNumberOptions = {}): string {
  const { decimals, ...fraction } = options;
  return value.toLocaleString(NUMBER_LOCALE[lang], decimals === undefined ? fraction : { ...fraction, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
