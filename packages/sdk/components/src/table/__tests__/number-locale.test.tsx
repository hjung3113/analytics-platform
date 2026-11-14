import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SelectAllBar } from '../selectAllBar';
import { groupCountText } from '../rowGroups';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// The table's counts follow the screen language, never the browser locale (#2170): every number goes through formatNumber(lang).
it.each([['ko', 'ko-KR'], ['en', 'en-US']] as const)('prints counts in the %s screen language (%s), not the browser locale', (lang, locale) => {
  const spy = vi.spyOn(Number.prototype, 'toLocaleString');
  render(<SelectAllBar lang={lang} pageRows={25} total={1234567} offer all={null} excluded={0} onSelectAll={() => {}} onClear={() => {}} />);
  expect(screen.getByTestId('select-all-bar').textContent).toContain('1,234,567');
  expect(spy).toHaveBeenCalled();
  for (const call of spy.mock.calls) expect(call[0]).toBe(locale);
  spy.mockClear();
  expect(groupCountText(1234567, lang)).toContain('1,234,567');
  for (const call of spy.mock.calls) expect(call[0]).toBe(locale);
  expect(spy).toHaveBeenCalled();
});
