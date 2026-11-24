import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, onTestFinished, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { SelectAllBar } from '../selectAllBar';
import { groupCountText } from '../rowGroups';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Locales of every number print: a kept `Intl.NumberFormat` (#2811) or a per-call `toLocaleString`. */
function watchLocales() {
  const locales: unknown[] = [];
  // `format` is a getter that returns a bound function (ECMA-402), which the method typing of `spyOn` cannot name.
  const descriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'format')!;
  Object.defineProperty(Intl.NumberFormat.prototype, 'format', { ...descriptor, get(this: Intl.NumberFormat) {
    locales.push(this.resolvedOptions().locale);
    return descriptor.get!.call(this);
  } });
  onTestFinished(() => { Object.defineProperty(Intl.NumberFormat.prototype, 'format', descriptor); });
  const toLocaleString = Number.prototype.toLocaleString;
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (this: number, ...args: Parameters<number['toLocaleString']>) {
    locales.push(args[0]);
    return toLocaleString.apply(this, args);
  });
  return locales;
}

// The table's counts follow the screen language, never the browser locale (#2170): every number goes through formatNumber(lang).
it.each([['ko', 'ko-KR'], ['en', 'en-US']] as const)('prints counts in the %s screen language (%s), not the browser locale', (lang, locale) => {
  const locales = watchLocales();
  render(<I18nProvider><SelectAllBar lang={lang} pageRows={25} total={1234567} offer all={null} excluded={0} onSelectAll={() => {}} onClear={() => {}} /></I18nProvider>);
  expect(screen.getByTestId('select-all-bar').textContent).toContain('1,234,567');
  expect(locales.length).toBeGreaterThan(0);
  expect(new Set(locales)).toEqual(new Set([locale]));
  locales.length = 0;
  expect(groupCountText(1234567, lang)).toContain('1,234,567');
  expect(locales.length).toBeGreaterThan(0);
  expect(new Set(locales)).toEqual(new Set([locale]));
});
