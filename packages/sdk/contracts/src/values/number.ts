/** Locale each UI language formats numbers in. */
const NUMBER_LOCALE = { ko: 'ko-KR', en: 'en-US' } as const;

export interface FormatNumberOptions {
  /** Exactly this many fraction digits (shorthand for equal `minimumFractionDigits` and `maximumFractionDigits`). */
  decimals?: number;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const numberFormatters = new Map<string, Intl.NumberFormat>();

const DIGIT_KEYS = new Set(['minimumFractionDigits', 'maximumFractionDigits']);
const cacheableDigits = (digits: unknown) => digits === undefined || Number.isInteger(digits);

/**
 * The one number display rule: digits grouped and rounded the way the user's language does (`ko` → `ko-KR`, `en` → `en-US`).
 * Menus call this instead of `toLocaleString`, so the language switch reaches every number. Pure; a non-finite value prints as `Intl` does (`NaN`, `∞`).
 */
export function formatNumber(value: number, lang: 'ko' | 'en', options: FormatNumberOptions = {}): string {
  const { decimals, ...fraction } = options;
  const intl: Intl.NumberFormatOptions = decimals === undefined ? fraction : { ...fraction, minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  const locale = NUMBER_LOCALE[lang];
  const { minimumFractionDigits: min, maximumFractionDigits: max } = intl;
  // Only the declared digit fields with whole (or omitted) values are kept, so the key space is the valid digit range. Any other key a
  // caller passes structurally, or a fractional/odd digit value, goes to Intl per call exactly as before. The check reads `intl`, the
  // object Intl would get, so the original options are enumerated once.
  if (!Object.keys(intl).every(key => DIGIT_KEYS.has(key)) || !cacheableDigits(min) || !cacheableDigits(max)) return value.toLocaleString(locale, intl);
  // Built on the first call with these digits, so bad digits still throw from that call and a failure is never kept.
  const key = `${locale}|${min ?? ''}|${max ?? ''}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) numberFormatters.set(key, formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max }));
  return formatter.format(value);
}
