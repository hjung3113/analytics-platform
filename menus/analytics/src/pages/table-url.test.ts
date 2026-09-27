import { describe, expect, it } from 'vitest';
import { parseBucket, parseBin } from './cycleData';

// §6.1 cycle-time page keys: bucket must sit exactly on a grain boundary (no snapping),
// out-of-period but aligned stays valid; bin is one BINS id or an ordered range.

describe('parseBucket', () => {
  it('treats an absent key as no bucket filter', () => {
    expect(parseBucket(null, 'hour')).toEqual({ ok: true, value: null });
    expect(parseBucket('', 'hour')).toEqual({ ok: true, value: null });
  });

  it('accepts a grain-aligned timestamp for hour', () => {
    expect(parseBucket('2026-09-25T09:00:00', 'hour')).toEqual({ ok: true, value: '2026-09-25T09:00:00' });
  });

  it('rejects a mid-grain timestamp without snapping', () => {
    expect(parseBucket('2026-09-25T09:30:00', 'hour')).toEqual({ ok: false });
  });

  it('checks the requested grain, not just the shape', () => {
    expect(parseBucket('2026-09-25T09:00:00', 'day')).toEqual({ ok: false });
    expect(parseBucket('2026-09-25T00:00:00', 'day')).toEqual({ ok: true, value: '2026-09-25T00:00:00' });
    expect(parseBucket('2026-09-21T00:00:00', 'week')).toEqual({ ok: true, value: '2026-09-21T00:00:00' });
    expect(parseBucket('2026-09-23T00:00:00', 'week')).toEqual({ ok: false });
  });

  it('accepts an out-of-period but aligned bucket (no period knowledge)', () => {
    expect(parseBucket('2020-01-01T00:00:00', 'hour')).toEqual({ ok: true, value: '2020-01-01T00:00:00' });
  });

  it('rejects malformed and impossible timestamps', () => {
    expect(parseBucket('nope', 'hour')).toEqual({ ok: false });
    expect(parseBucket('2026-09-25 09:00:00', 'hour')).toEqual({ ok: false });
    expect(parseBucket('2026-02-30T00:00:00', 'hour')).toEqual({ ok: false });
    expect(parseBucket('2026-09-25T09:00', 'hour')).toEqual({ ok: false });
  });
});

describe('parseBin', () => {
  it('treats an absent key as no histogram filter', () => {
    expect(parseBin(null)).toEqual({ ok: true, value: null });
    expect(parseBin('')).toEqual({ ok: true, value: null });
  });

  it('accepts a single BINS id', () => {
    expect(parseBin('45-60')).toEqual({ ok: true, value: { from: '45-60', to: '45-60' } });
    expect(parseBin('90+')).toEqual({ ok: true, value: { from: '90+', to: '90+' } });
  });

  it('accepts an ordered range', () => {
    expect(parseBin('0-30..60-75')).toEqual({ ok: true, value: { from: '0-30', to: '60-75' } });
  });

  it('rejects reversed, unknown, and malformed values', () => {
    expect(parseBin('90+..0-30')).toEqual({ ok: false });
    expect(parseBin('nope')).toEqual({ ok: false });
    expect(parseBin('0-30..nope')).toEqual({ ok: false });
    expect(parseBin('..')).toEqual({ ok: false });
    expect(parseBin('45-60..45-60..45-60')).toEqual({ ok: false });
  });
});
