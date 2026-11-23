import { describe, expect, it } from 'vitest';
import { hwTimeHistorySummary } from './historySummary';

const text = (page: [string, string][]) => hwTimeHistorySummary(page, 'ko').map(item => `${item.label} ${item.value}`).join(' · ');

describe('HW Time query-history page summary (#2691)', () => {
  it('tells apart rows that differ only in drill or filter state', () => {
    const top = text([]);
    const filtered = text([['module', 'PM1'], ['module', 'PM2']]);
    expect(top).toBe('');
    expect(filtered).toBe('선택한 Module PM1, PM2');
    expect(new Set([top, filtered]).size).toBe(2);
  });
  it('leaves the drill steps to the SDK history row (#2770)', () => {
    // The page opts in with `historyDrill`; the SDK writes «Module 타입 PM · Motion Pump» before these items.
    expect(text([['moduleType', 'PM'], ['drillMotion', 'Pump'], ['date', '2026-11-20']])).toBe('날짜 2026-11-20');
  });
  it('names the explicit empty selection, the verdict and the date', () => {
    expect(text([['motion', '~none'], ['verdict', 'over'], ['date', '2026-11-20']])).toBe('선택한 Motion 선택한 항목 없음 · 판정 상한 초과 · 날짜 2026-11-20');
  });
  it('keeps an unknown verdict raw instead of correcting it', () => {
    expect(text([['verdict', 'bogus']])).toBe('판정 bogus');
  });
  it('ignores screen-layout keys', () => {
    expect(text([['sort', 'x:asc'], ['page', '2'], ['focus', 'heatmap'], ['barsSort', 'desc']])).toBe('');
  });
});
