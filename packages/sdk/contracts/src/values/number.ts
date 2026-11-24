/** Locale each UI language formats numbers in. */
const NUMBER_LOCALE = { ko: 'ko-KR', en: 'en-US' } as const;

export interface FormatNumberOptions {
  /** Exactly this many fraction digits (shorthand for equal `minimumFractionDigits` and `maximumFractionDigits`). */
  decimals?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

/**
 * The one number display rule: digits grouped and rounded the way the user's language does (`ko` → `ko-KR`, `en` → `en-US`).
 * Menus call this instead of `toLocaleString`, so the language switch reaches every number. Pure; a non-finite value prints as `Intl` does (`NaN`, `∞`).
 */
export function formatNumber(value: number, lang: 'ko' | 'en', options: FormatNumberOptions = {}): string {
  const { decimals, ...fraction } = options;
  const { minimumFractionDigits: min, maximumFractionDigits: max } = decimals === undefined ? fraction : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  const locale = NUMBER_LOCALE[lang];
  // Built on the first call with these digits, so bad digits still throw from that call and a failure is never kept.
  const key = `${locale}|${min ?? ''}|${max ?? ''}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) numberFormatters.set(key, formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max }));
  return formatter.format(value);
}
