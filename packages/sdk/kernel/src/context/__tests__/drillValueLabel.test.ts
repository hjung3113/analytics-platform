import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrillLevel } from '@ap/contracts';
import { drillValueLabel } from '../drillValueLabel';

const level = (key: string, valueLabel: DrillLevel['valueLabel']): DrillLevel => ({ key, label: { ko: key, en: key }, valueLabel });

describe('drillValueLabel development warning (#2714)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('warns once per level and value when valueLabel returns an empty string, and shows the raw value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const empty = level('drillEmpty', () => '');
    expect(drillValueLabel(empty, 'A', 'ko')).toEqual({ valueLabel: 'A' });
    expect(drillValueLabel(empty, 'A', 'en')).toEqual({ valueLabel: 'A' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"drillEmpty"');
    expect(warn.mock.calls[0]?.[0]).toContain('"A"');
    drillValueLabel(empty, 'B', 'ko');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('warns once when valueLabel throws, and shows the raw value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throws = level('drillThrows', () => {
      throw new Error('bad');
    });
    expect(drillValueLabel(throws, 'X', 'ko')).toEqual({ valueLabel: 'X' });
    expect(drillValueLabel(throws, 'X', 'ko')).toEqual({ valueLabel: 'X' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('threw');
  });

  it('does not warn for a valid label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(drillValueLabel(level('drillOk', v => `L ${v}`), 'A', 'ko')).toEqual({ valueLabel: 'L A' });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    // Only NODE_ENV: a production build replaces it statically; `import.meta.env.PROD` passed as a value is not (#2951).
    ['NODE_ENV', 'production'],
  ] as const)('stays silent in production (%s)', (name, value) => {
    vi.stubEnv(name, value as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(drillValueLabel(level(`drillProd${name}`, () => ''), 'A', 'ko')).toEqual({ valueLabel: 'A' });
    expect(drillValueLabel(level(`drillProdThrow${name}`, () => { throw new Error('x'); }), 'A', 'ko')).toEqual({ valueLabel: 'A' });
    expect(warn).not.toHaveBeenCalled();
  });
});
