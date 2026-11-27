import { describe, expect, it } from 'vitest';
import { formatFeedTime, formatListTime, formatSummaryTime } from '../../index';

const at = '2026-11-18T05:05:00Z';
const timeZone = 'Asia/Seoul';
const now = Date.parse('2026-11-18T05:10:00Z');

describe('instant notation', () => {
  it('prints a stable local list timestamp across languages and zones', () => {
    expect(formatListTime(at, { timeZone })).toBe('2026-11-18 14:05');
    expect(formatListTime(at, { timeZone: 'America/Los_Angeles' })).toBe('2026-11-17 21:05');
  });

  // Postgres timestamptz instants carry microseconds (e.g. recovery snooze-until, #2587): the minute notation drops them.
  it('reads a microsecond server instant and prints minutes only', () => {
    expect(formatListTime('2026-07-21T15:28:00.123456Z', { timeZone })).toBe('2026-07-22 00:28');
  });
  it('compares years in the display zone', () => {
    const yearEnd = '2026-12-31T14:55:00Z';
    const newYear = Date.parse('2026-12-31T15:05:00Z');
    expect(formatSummaryTime(yearEnd, 'ko', { timeZone, now: newYear })).toBe('2026년 12월 31일 23:55');
    expect(formatSummaryTime(yearEnd, 'en', { timeZone, now: newYear })).toBe('Dec 31, 2026 23:55');
    expect(formatSummaryTime(at, 'ko', { timeZone, now })).toBe('11월 18일 14:05');
  });

  it('keeps a full title and uses local calendar days across daylight saving', () => {
    expect(formatFeedTime(at, 'ko', { timeZone, now })).toEqual({ text: '5분 전', title: '2026-11-18 14:05' });
    expect(formatFeedTime('2026-11-02T04:30:00Z', 'en', { timeZone: 'America/New_York', now: Date.parse('2026-11-03T04:00:00Z') })).toEqual({ text: 'Yesterday 23:30', title: '2026-11-01 23:30' });
    expect(formatFeedTime('2026-11-16T05:05:00Z', 'ko', { timeZone, now })).toEqual({ text: '11월 16일', title: '2026-11-16 14:05' });
    expect(formatFeedTime('2026-11-18T05:15:00Z', 'en', { timeZone, now })).toEqual({ text: 'Nov 18 14:15', title: '2026-11-18 14:15' });
  });

  it.each([undefined, null, NaN, '2026-02-30T14:05:00Z', '2026-11-18T14:05:00'])('renders a safe fallback for %s', value => {
    expect(formatListTime(value, { timeZone })).toBe('—');
    expect(formatSummaryTime(value, 'ko', { timeZone, now })).toBe('—');
    expect(formatFeedTime(value, 'ko', { timeZone, now })).toEqual({ text: '—' });
  });
});
