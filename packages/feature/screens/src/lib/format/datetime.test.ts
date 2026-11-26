import {
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatRelativeTime,
  formatShortDate,
  formatShortDateTime,
  formatTime,
  formatZonedDateTime,
} from './datetime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-10-01T06:05:00.000Z');

beforeEach(() => {
  vi.stubEnv('TZ', 'UTC');
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('formatRelativeTime', () => {
  it.each([
    { input: '2026-10-01T05:50:00.000Z', expected: '15분 전' },
    { input: '2026-10-01T03:05:00.000Z', expected: '3시간 전' },
    { input: '2026-09-30T04:05:00.000Z', expected: '어제' },
    { input: '2026-09-29T06:05:00.000Z', expected: '그저께' },
    { input: '2026-10-01T06:05:00.000Z', expected: '방금' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatRelativeTime(input)).toBe(expected);
  });
});

describe('formatDate', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '2026. 10. 1.' },
    { input: '2026-09-30T16:30:00.000Z', expected: '2026. 10. 1.' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatDate(input)).toBe(expected);
  });
});

describe('formatShortDate', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '10월 1일' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatShortDate(input)).toBe(expected);
  });
});

describe('formatDateTime', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '2026. 10. 1. 오후 3:05' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatDateTime(input)).toBe(expected);
  });
});

it('formats a two-digit year with the full KST date and time for compact platform tables', () => {
  expect(formatDateTime('2026-11-07T09:00:00Z', '2-digit')).toBe('26. 11. 7. 오후 6:00');
});

describe('formatShortDateTime', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '10월 1일 오후 3:05' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatShortDateTime(input)).toBe(expected);
  });
});

describe('formatTime', () => {
  it.each([
    { input: '2026-10-01T06:05:00.000Z', expected: '오후 3:05' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatTime(input)).toBe(expected);
  });
});

describe('formatDateOnly', () => {
  it.each([
    // Date-only values represent their calendar day at midnight UTC; they must not shift a day.
    { input: '2026-10-01', expected: '2026. 10. 1.' },
    { input: '2024-02-29', expected: '2024. 2. 29.' },
    { input: '2026-02-29', expected: '—' },
    { input: '2026-02-30', expected: '—' },
    { input: 'invalid', expected: '—' },
  ])('formats $input as $expected', ({ input, expected }) => {
    expect(formatDateOnly(input)).toBe(expected);
  });
});


describe('formatZonedDateTime', () => {
  it('shows the instant in the named zone and the unavailable marker for an unknown zone', () => {
    expect(formatZonedDateTime('2026-11-06T16:30:00.000Z', 'Europe/Berlin')).toMatch(/2026.*11.*06.*17:30/);
    expect(formatZonedDateTime('2026-11-06T16:30:00.000Z', 'Not/AZone')).toBe('—');
    expect(formatZonedDateTime('invalid', 'Europe/Berlin')).toBe('—');
  });
});
