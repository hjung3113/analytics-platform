import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useColumnPreferences } from './useColumnPreferences';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; }, clear: () => data.clear(), key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); },
  };
}

describe('column preference writes (#823)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('writes nothing on mount: the value it just read stays as stored', () => {
    localStorage.setItem('t', JSON.stringify({ sizing: { a: 120 }, visibility: {}, pinning: { left: [], right: [] } }));
    const written = vi.spyOn(localStorage, 'setItem');
    renderHook(() => useColumnPreferences('t'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(written).not.toHaveBeenCalled();
  });

  it('a width drag is written once, 300 ms after its last change', () => {
    const written = vi.spyOn(localStorage, 'setItem');
    const { result } = renderHook(() => useColumnPreferences('t'));
    for (const width of [100, 110, 120, 130]) act(() => { result.current.onColumnSizingChange({ a: width }); });
    expect(written).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(written).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('t')!).sizing).toEqual({ a: 130 });
  });

  it('visibility and pin changes are written at once; a pending width is written on unmount', () => {
    const { result, unmount } = renderHook(() => useColumnPreferences('t'));
    act(() => { result.current.onColumnVisibilityChange({ a: false }); });
    expect(JSON.parse(localStorage.getItem('t')!).visibility).toEqual({ a: false });
    act(() => { result.current.onColumnSizingChange({ a: 150 }); });
    unmount();
    expect(JSON.parse(localStorage.getItem('t')!).sizing).toEqual({ a: 150 });
  });

  it('a width waiting when the key changes is written to its own key (#823)', () => {
    const { result, rerender } = renderHook(({ key }) => useColumnPreferences(key), { initialProps: { key: 'a' } });
    act(() => { result.current.onColumnSizingChange({ c: 140 }); });
    rerender({ key: 'b' });
    act(() => { result.current.onColumnVisibilityChange({ c: false }); });
    expect(JSON.parse(localStorage.getItem('a')!).sizing).toEqual({ c: 140 });
  });
});
