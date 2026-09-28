import { describe, expect, it } from 'vitest';
import { ContractError, formatInstant, instantEpochMs } from '@ap/contracts';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ContractError ? e.code : 'other'; } return 'ok'; };

// The mirror of url-contract's time tests: formatDateTime prints §6.3 naive wall-clock digits as stored;
// formatInstant renders a real instant (epoch ms / offset ISO-8601) in the viewer's time zone.
describe('formatInstant (real instants)', () => {
  it('renders an epoch ms / Z instant in the requested time zone, not the UTC digits', () => {
    expect(formatInstant(1_790_560_800_000, 'en', 'Asia/Seoul')).toContain('11:00');
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'Asia/Seoul')).toContain('11:00');
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'Asia/Seoul')).not.toContain('02:00');
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'UTC')).toContain('2:00');
  });
  it('accepts an explicit numeric offset as an instant', () => {
    expect(formatInstant('2026-09-26T11:00:00+09:00', 'en', 'Asia/Seoul')).toContain('11:00');
  });
  it('fails closed on naive wall-clock, which is formatDateTime\'s domain', () => {
    expect(code(() => formatInstant('2026-09-26T02:00:00', 'en'))).toBe('invalid_time');
  });
  it('localizes ko and en differently', () => {
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'ko', 'Asia/Seoul'))
      .not.toBe(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'Asia/Seoul'));
  });
  it('accepts ±HHMM offsets and second-less datetimes', () => {
    expect(formatInstant('2026-09-26T11:00+09:00', 'en', 'Asia/Seoul')).toContain('11:00');
    expect(formatInstant('2026-09-26T11:00:00+0900', 'en', 'Asia/Seoul')).toContain('11:00');
  });
  it('rejects offset look-alike suffixes — the whole string must be the ISO datetime grammar', () => {
    expect(code(() => formatInstant('09-26-2026', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('9/26/2026Z', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('2026-09-26Z', 'en'))).toBe('invalid_time');
  });
  it('rejects hour-only offsets like +09 (zone is Z/z/±HH:MM/±HHMM)', () => {
    expect(code(() => formatInstant('2026-09-26T02:00:00+09', 'en'))).toBe('invalid_time');
  });
  it('rejects impossible calendar dates instead of rolling them into the next month', () => {
    expect(code(() => formatInstant('2026-02-30T02:00:00Z', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('2026-02-29T02:00:00Z', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('2026-09-31T02:00:00Z', 'en'))).toBe('invalid_time');
  });
  it('rejects out-of-range time and offset components', () => {
    expect(code(() => formatInstant('2026-09-26T25:00:00Z', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('2026-09-26T02:60:00Z', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('2026-09-26T02:00:60Z', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('2026-09-26T02:00:00+24:00', 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant('2026-09-26T02:00:00+23:60', 'en'))).toBe('invalid_time');
  });
  it('accepts a real leap day', () => {
    expect(formatInstant('2028-02-29T02:00:00Z', 'en', 'UTC')).toContain('2/29/28');
  });
  it('formats epoch 0 in epoch-ms and ISO form', () => {
    expect(formatInstant(0, 'en', 'UTC')).toContain('1/1/70');
    expect(formatInstant('1970-01-01T00:00:00Z', 'en', 'UTC')).toContain('1/1/70');
  });
  it('rejects non-finite epoch values', () => {
    expect(code(() => formatInstant(Number.NaN, 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant(Number.POSITIVE_INFINITY, 'en'))).toBe('invalid_time');
    expect(code(() => formatInstant(Number.NEGATIVE_INFINITY, 'en'))).toBe('invalid_time');
  });
});

// #50: the audit sort key. One parser with formatInstant — Z and an offset spelling of the same instant
// must compare equal, and a naive string (formatDateTime's domain) must never get a number.
describe('instantEpochMs (audit sort key)', () => {
  it('treats Z and an offset spelling of the same instant as one value', () => {
    expect(instantEpochMs('2026-09-26T02:00:00.000Z')).toBe(instantEpochMs('2026-09-26T11:00:00+09:00'));
  });
  it('orders two spellings where the naive digit order would disagree', () => {
    expect(instantEpochMs('2026-09-26T12:00:00+09:00')).toBeGreaterThan(instantEpochMs('2026-09-26T02:00:00.000Z'));
  });
  it('rejects naive wall-clock and impossible calendar dates', () => {
    expect(code(() => instantEpochMs('2026-09-26T02:00:00'))).toBe('invalid_time');
    expect(code(() => instantEpochMs('2026-02-30T00:00:00.000Z'))).toBe('invalid_time');
  });
});
