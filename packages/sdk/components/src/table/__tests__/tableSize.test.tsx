import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceController, PreferenceState } from '@ap/kernel';

// Node 1217d: the server preference seam (ADR-0098) carries the one table-size setting.
let controller: PreferenceController | null = null;
vi.mock('@ap/kernel', () => ({
  usePlatformOptional: () => null,
  usePreferenceController: () => controller,
  usePreferenceState: (c: PreferenceController | null): PreferenceState => c ? c.state() : { status: 'ready', failure: null, version: 0 },
}));
const { useTableSize, TABLE_SIZE_KEY } = await import('../tableSize');

function fakeController(initial: Record<string, unknown>) {
  const values = { ...initial };
  const written: { raw: string; value: unknown }[] = [];
  const c = {
    state: () => ({ status: 'ready', failure: null, version: 1 }), subscribe: () => () => {},
    get: (key: string) => values[key], set: vi.fn(), remove: vi.fn(),
    tableKey: async (raw: string) => `columns:h1_${raw}`,
    setTable: (raw: string, value: unknown) => { written.push({ raw, value }); values[`columns:h1_${raw}`] = value; },
    start: vi.fn(), stop: vi.fn(), retry: vi.fn(),
  } as unknown as PreferenceController;
  return { c, written };
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useTableSize with the server seam', () => {
  afterEach(() => { controller = null; });

  it('shows the server value, ignoring the browser one, and writes the choice under the documented key', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'small', setItem: vi.fn(), removeItem: vi.fn() });
    const f = fakeController({ [`columns:h1_${TABLE_SIZE_KEY}`]: 'large' });
    controller = f.c;
    const { result } = renderHook(() => useTableSize());
    await flush();
    expect(result.current[0]).toBe('large');
    act(() => result.current[1]('small'));
    expect(f.written).toEqual([{ raw: TABLE_SIZE_KEY, value: 'small' }]);
    expect(result.current[0]).toBe('small');
    vi.unstubAllGlobals();
  });

  it('an unknown or absent server value is 보통', async () => {
    const f = fakeController({ [`columns:h1_${TABLE_SIZE_KEY}`]: 'huge' });
    controller = f.c;
    const { result } = renderHook(() => useTableSize());
    await flush();
    expect(result.current[0]).toBe('normal');
  });
});
