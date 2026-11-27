import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { formatFeedTime, formatListTime, formatSummaryTime, I18nProvider, useI18n, useTimeNotation } from '../../index';

const at = '2026-11-18T05:05:00Z';
const timeZone = 'Asia/Seoul';
const now = Date.parse('2026-11-18T05:10:00Z');
const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('useTimeNotation (#3195)', () => {
  it('formats like the Kernel functions in the current language and keeps one object until it changes', () => {
    const { result, rerender } = renderHook(() => ({ time: useTimeNotation(), i18n: useI18n() }), { wrapper });
    act(() => result.current.i18n.setLang('ko'));
    const ko = result.current.time;
    expect(ko.list(at, { timeZone })).toBe(formatListTime(at, { timeZone }));
    expect(ko.summary(at, { timeZone, now })).toBe(formatSummaryTime(at, 'ko', { timeZone, now }));
    expect(ko.feed(at, { timeZone, now })).toEqual(formatFeedTime(at, 'ko', { timeZone, now }));
    rerender();
    expect(result.current.time).toBe(ko);

    act(() => result.current.i18n.setLang('en'));
    expect(result.current.time).not.toBe(ko);
    expect(result.current.time.summary(at, { timeZone, now })).toBe('Nov 18 14:05');
    expect(result.current.time.feed(at, { timeZone, now })).toEqual({ text: '5 minutes ago', title: '2026-11-18 14:05' });
  });
});
