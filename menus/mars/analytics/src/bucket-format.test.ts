import { describe, expect, it } from 'vitest';
import { binText, bucketText } from './bucket-format';

// #1218 FORMAT: the chip row, the query-bar summary (`summaryFor`) and the XLSX 조회 정보 sheet print
// one bucket/bin text. Wall-clock digits only (06 §6.3) — contracts helpers, no `Date`, no time zone;
// a raw value the page refuses is shown as written, never corrected.
describe('bucketText', () => {
  it('shows an hour bucket as date + time and the same-day end as time only', () => {
    expect(bucketText('2026-09-25T10:00:00', 'hour', 'ko')).toBe('2026-09-25 10:00 → 11:00');
  });

  it.each([
    ['2026-09-25T23:00:00', '2026-09-25 23:00 → 2026-09-26 00:00'],
    ['2026-09-30T23:00:00', '2026-09-30 23:00 → 2026-10-01 00:00'],
  ])('keeps the date on the end once the hour bucket crosses a day: %s', (raw, text) => {
    expect(bucketText(raw, 'hour', 'ko')).toBe(text);
  });

  it('shows day and week grains as dates only; the end is the exclusive bucketEnd', () => {
    expect(bucketText('2026-09-25T00:00:00', 'day', 'ko')).toBe('2026-09-25 → 2026-09-26');
    expect(bucketText('2026-09-21T00:00:00', 'week', 'en')).toBe('2026-09-21 → 2026-09-28');
  });

  it.each([
    ['not-a-time'],
    ['2026-09-25 09:00:00'],
    ['2026-02-30T00:00:00'],
    ['2026-09-25T09:00'],
  ])('shows an unparseable raw value as-is: %s', raw => {
    expect(bucketText(raw, 'hour', 'ko')).toBe(raw);
  });

  it.each([
    ['2026-09-25T09:30:00', 'hour'],
    ['2026-09-25T10:00:00', 'day'],
    ['2026-09-25T00:00:00', 'week'],
  ] as const)('shows a value the page would refuse (not a %s bucket) as-is: %s', (raw, grain) => {
    expect(bucketText(raw, grain, 'ko')).toBe(raw);
  });

  it('is the same text in both languages — the format is locale-neutral', () => {
    expect(bucketText('2026-09-25T23:00:00', 'hour', 'en')).toBe(bucketText('2026-09-25T23:00:00', 'hour', 'ko'));
    expect(bucketText('2026-09-25T00:00:00', 'day', 'en')).toBe(bucketText('2026-09-25T00:00:00', 'day', 'ko'));
  });
});

describe('binText', () => {
  it('shows a single bin as the distribution axis shows it and joins a range with –', () => {
    expect(binText({ from: '90+', to: '90+' }, 'ko')).toBe('90+');
    expect(binText({ from: '45-60', to: '60-75' }, 'ko')).toBe('45-60 – 60-75');
  });

  it('is the same text in both languages', () => {
    expect(binText({ from: '45-60', to: '60-75' }, 'en')).toBe(binText({ from: '45-60', to: '60-75' }, 'ko'));
  });
});
