import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatInstant, formatNumber, type InstantForm } from '@ap/contracts';

// #2811: formatInstant (explicit zone) and formatNumber keep their Intl formatters. The output must equal the per-call
// expressions they replaced, a bad zone or digit count must still throw from the call, and the viewer's zone is never kept.

const oldInstant = (value: string, lang: 'ko' | 'en', timeZone: string | undefined, form: InstantForm) => {
  const date = new Date(value);
  if (form === 'short') return date.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'short', timeStyle: 'short', timeZone });
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  const monthDayMinute = `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  return form === 'minute' ? `${get('year')}-${monthDayMinute}` : monthDayMinute;
};

const oldNumber = (value: number, lang: 'ko' | 'en', options: { decimals?: number; minimumFractionDigits?: number; maximumFractionDigits?: number }) => {
  const { decimals, ...fraction } = options;
  return value.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', decimals === undefined ? fraction : { ...fraction, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/** Counts constructions while every call still gets a real Intl formatter. */
function countBuilds<K extends 'DateTimeFormat' | 'NumberFormat'>(name: K) {
  const Real = Intl[name] as unknown as new (...args: unknown[]) => object;
  return vi.spyOn(Intl, name).mockImplementation(function (...args: unknown[]) { return new Real(...args); } as never);
}

afterEach(() => { vi.restoreAllMocks(); });

const thrown = (fn: () => unknown) => { try { fn(); } catch (error) { return `${(error as Error).name}: ${(error as Error).message}`; } return 'ok'; };

// Values on both sides of the 2026 DST changes in New York (03-08, 11-01) and London (03-29, 10-25).
const INSTANTS = ['2026-03-08T06:59:00Z', '2026-03-08T07:01:00Z', '2026-11-01T05:59:00Z', '2026-11-01T06:01:00Z',
  '2026-03-29T00:59:00Z', '2026-03-29T01:01:00Z', '2026-10-25T00:59:00Z', '2026-10-25T01:01:00Z', '2026-12-31T15:00:00Z'];
const ZONES = ['Asia/Seoul', 'America/New_York', 'Europe/London', 'UTC'];
const FORMS: InstantForm[] = ['short', 'minute', 'monthDayMinute'];

describe('formatInstant keeps explicit-zone formatters (#2811)', () => {
  it('prints what the per-call formatter printed, for every form, language and zone across DST, twice', () => {
    for (const form of FORMS) for (const lang of ['ko', 'en'] as const) for (const zone of ZONES) for (const value of INSTANTS) {
      const expected = oldInstant(value, lang, zone, form);
      expect(formatInstant(value, lang, zone, form)).toBe(expected);
      expect(formatInstant(value, lang, zone, form)).toBe(expected);
    }
  });

  it('builds one formatter per form and zone over many calls', () => {
    const built = countBuilds('DateTimeFormat');
    for (let i = 0; i < 50; i++) {
      formatInstant(INSTANTS[i % INSTANTS.length]!, 'en', 'Asia/Kathmandu', 'minute');
      formatInstant(INSTANTS[i % INSTANTS.length]!, 'ko', 'Asia/Kathmandu');
    }
    expect(built).toHaveBeenCalledTimes(2);
  });

  it('throws for a bad zone on every call, as before', () => {
    for (const form of FORMS) {
      const expected = thrown(() => oldInstant(INSTANTS[0]!, 'en', 'Mars/Base', form));
      expect(expected).toMatch(/RangeError/);
      expect(thrown(() => formatInstant(INSTANTS[0]!, 'en', 'Mars/Base', form))).toBe(expected);
      expect(thrown(() => formatInstant(INSTANTS[0]!, 'en', 'Mars/Base', form))).toBe(expected);
    }
  });

  describe('the viewer zone', () => {
    const tz = process.env.TZ;
    afterEach(() => { process.env.TZ = tz; });

    it('follows a TZ change instead of keeping the zone of an earlier call', () => {
      for (const form of FORMS) {
        process.env.TZ = 'UTC';
        expect(formatInstant('2026-10-28T00:00:00Z', 'en', undefined, form)).toBe(oldInstant('2026-10-28T00:00:00Z', 'en', 'UTC', form));
        process.env.TZ = 'Asia/Seoul';
        expect(formatInstant('2026-10-28T00:00:00Z', 'en', undefined, form)).toBe(oldInstant('2026-10-28T00:00:00Z', 'en', 'Asia/Seoul', form));
      }
    });
  });
});

describe('formatNumber keeps its formatters (#2811)', () => {
  const VALUES = [0, -0, 1234.5678, -0.5, 0.125, 1e21, 123456789.987654, Number.NaN, Infinity, -Infinity];
  const OPTIONS = [{}, { decimals: 0 }, { decimals: 2 }, { minimumFractionDigits: 1 }, { maximumFractionDigits: 0 },
    { minimumFractionDigits: 1, maximumFractionDigits: 3 }, { decimals: 1, maximumFractionDigits: 4 }];

  it('prints what toLocaleString printed, twice', () => {
    for (const lang of ['ko', 'en'] as const) for (const options of OPTIONS) for (const value of VALUES) {
      const expected = oldNumber(value, lang, options);
      expect(formatNumber(value, lang, options)).toBe(expected);
      expect(formatNumber(value, lang, options)).toBe(expected);
    }
  });

  it('builds one formatter per language and digits over many calls', () => {
    const built = countBuilds('NumberFormat');
    for (let i = 0; i < 50; i++) formatNumber(i * 1.5, 'en', { decimals: 5 });
    expect(built).toHaveBeenCalledTimes(1);
  });

  it.each([{ decimals: 200 }, { minimumFractionDigits: 3, maximumFractionDigits: 1 }, { decimals: -1 }])('throws for bad digits %o on every call, as before', options => {
    const expected = thrown(() => oldNumber(1, 'en', options));
    expect(expected).toMatch(/RangeError/);
    expect(thrown(() => formatNumber(1, 'en', options))).toBe(expected);
    expect(thrown(() => formatNumber(1, 'en', options))).toBe(expected);
  });
});
