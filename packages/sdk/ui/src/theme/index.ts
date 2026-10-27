import { THEME_COLOR_FALLBACK, THEME_COLOR_TOKENS, type ThemeColorToken } from './tokens.generated';

export { THEME_COLOR_TOKENS, type ThemeColorToken };

const themeColorTokenSet = new Set<string>(THEME_COLOR_TOKENS);

export function isThemeColorToken(value: string): value is ThemeColorToken {
  return themeColorTokenSet.has(value);
}

export function readColorToken(name: ThemeColorToken, element?: Element): string {
  if (typeof window === 'undefined' || (element === undefined && typeof document === 'undefined')) {
    return THEME_COLOR_FALLBACK[name];
  }

  const value = getComputedStyle(element ?? document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();
  const triple = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(value);
  return triple ? `rgb(${triple.slice(1).join(',')})` : THEME_COLOR_FALLBACK[name];
}
