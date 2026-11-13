// #2009 MEN-1 / #2044: the one Trust formatter shared by the indicator, chart footers, export sheet and toast.
import { describe, expect, it } from 'vitest';
import type { Trust } from '@ap/contracts';
import { chartTrustText, trustCoverageText, trustFooterText, trustInstantText } from '../trustFormat';

const trust: Trust = { updatedAt: '2026-09-26T09:00:00+09:00', dataThrough: null, coverage: 0.987, provisional: false, source: 'mart.x' };

describe('trustFooterText', () => {
  it('turns a full timestamp into MM-DD HH:mm in the viewer zone and coverage into NN.N%', () => {
    expect(trustFooterText(trust, 'ko', 'Asia/Seoul')).toEqual({ source: 'mart.x', updated: '09-26 09:00', coverage: '98.7%' });
  });
  it('applies the viewer zone, never the digits of the string (a Z instant read in Seoul)', () => {
    expect(trustFooterText({ ...trust, updatedAt: '2026-10-28T00:00:00Z' }, 'ko', 'Asia/Seoul').updated).toBe('10-28 09:00');
    expect(trustFooterText({ ...trust, updatedAt: '2026-10-28T00:00:00Z' }, 'ko', 'UTC').updated).toBe('10-28 00:00');
  });
  it.each([['ko', '미확인'], ['en', 'Not confirmed']] as const)('words an unknown coverage in %s as %s', (lang, text) => {
    expect(trustFooterText({ ...trust, coverage: null }, lang).coverage).toBe(text);
    expect(trustCoverageText(null, lang)).toBe(text);
  });
});

describe('trustInstantText', () => {
  it.each([null, undefined, '', '2026-09-26T09:00:00', '—'])('shows 「—」 for %s instead of throwing', value => {
    expect(trustInstantText(value, 'ko')).toBe('—');
  });
  it('gives the full minute form on request', () => {
    expect(trustInstantText('2026-09-26T09:00:00+09:00', 'en', 'minute', 'Asia/Seoul')).toBe('2026-09-26 09:00');
  });
});

describe('chartTrustText', () => {
  it('formats a Trust, passes a text triple through and drops null', () => {
    expect(chartTrustText(trust, 'en')).toEqual({ source: 'mart.x', updated: '09-26 09:00', coverage: '98.7%' });
    const triple = { source: 's', updated: 'u', coverage: 'c' };
    expect(chartTrustText(triple, 'en')).toBe(triple);
    expect(chartTrustText(null, 'en')).toBeUndefined();
    expect(chartTrustText(undefined, 'en')).toBeUndefined();
  });
});
