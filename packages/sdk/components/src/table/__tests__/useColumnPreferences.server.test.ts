import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceController, PreferenceState } from '@ap/kernel';

let controller: PreferenceController | null = null;
vi.mock('@ap/kernel', () => ({
  usePreferenceController: () => controller,
  usePreferenceState: (c: PreferenceController | null): PreferenceState => c ? c.state() : { status: 'ready', failure: null, version: 0 },
}));
const { useColumnPreferences } = await import('../useColumnPreferences');

function fakeController(initial: Record<string, unknown>, status: PreferenceState['status'] = 'ready') {
  const written: { raw: string; value: unknown }[] = [];
  const state: PreferenceState = { status, failure: null, version: 1 };
  const c = {
    state: () => state, subscribe: () => () => {},
    get: (key: string) => initial[key], set: vi.fn(), remove: vi.fn(),
    tableKey: async (raw: string) => `columns:h1_${raw}`,
    setTable: (raw: string, value: unknown) => { written.push({ raw, value }); },
    start: vi.fn(), stop: vi.fn(), retry: vi.fn(),
  } as unknown as PreferenceController;
  return { c, written };
}
const flushPromises = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('column preferences with the server seam', () => {
  beforeEach(() => { vi.useFakeTimers(); const data = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }); });
  afterEach(() => { controller = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('shows the server value, not the browser one, and writes nothing because of hydration', async () => {
    localStorage.setItem('t', JSON.stringify({ sizing: { a: 500 }, visibility: {}, pinning: { left: [], right: [] } }));
    const f = fakeController({ 'columns:h1_t': { sizing: { a: 120 }, visibility: {}, pinning: { left: ['x'], right: [] } } });
    controller = f.c;
    const { result } = renderHook(() => useColumnPreferences('t'));
    await flushPromises();
    expect(result.current.preferences.sizing).toEqual({ a: 120 });
    expect(result.current.preferences.pinning.left).toEqual(['x']);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(f.written).toEqual([]);
  });

  it('shows defaults, never the browser record, while the account is loading', async () => {
    localStorage.setItem('t', JSON.stringify({ sizing: { a: 500 }, visibility: {}, pinning: { left: [], right: [] } }));
    controller = fakeController({}, 'loading').c;
    const { result } = renderHook(() => useColumnPreferences('t'));
    await flushPromises();
    expect(result.current.preferences.sizing).toEqual({});
  });

  it('keeps the 300 ms width debounce, writes visibility at once, and never stores the derived right pin', async () => {
    const f = fakeController({});
    controller = f.c;
    const { result } = renderHook(() => useColumnPreferences('t'));
    await flushPromises();
    for (const w of [100, 130]) act(() => { result.current.onColumnSizingChange({ a: w }); });
    expect(f.written).toEqual([]);
    act(() => { vi.advanceTimersByTime(300); });
    expect(f.written).toHaveLength(1);
    expect((f.written[0]!.value as { sizing: unknown }).sizing).toEqual({ a: 130 });
    act(() => { result.current.onColumnPinningChange(true)({ left: ['a', '_action'], right: ['_action'] }); });
    expect((f.written.at(-1)!.value as { pinning: unknown }).pinning).toEqual({ left: ['a'], right: [] });
    expect(localStorage.getItem('t')).toBeNull();
  });

  it('a change made before the server value arrived is not overwritten by it', async () => {
    const f = fakeController({ 'columns:h1_t': { sizing: { a: 120 }, visibility: {}, pinning: { left: [], right: [] } } });
    controller = f.c;
    const { result } = renderHook(() => useColumnPreferences('t'));
    act(() => { result.current.onColumnVisibilityChange({ a: false }); });
    await flushPromises();
    expect(result.current.preferences.visibility).toEqual({ a: false });
    expect(f.written.at(-1)?.raw).toBe('t');
  });
});
