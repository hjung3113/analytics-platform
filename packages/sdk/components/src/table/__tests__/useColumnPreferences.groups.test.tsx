import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { useColumnPreferences } from '../useColumnPreferences';

const key = 'platform:columns:v1:anon:groups';
const groups = { basis: 'declaration', items: [{ id: 'D', members: ['a'] }, { id: 'u:1', label: 'Mine', members: ['b'], width: 160 }] };
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('column group preferences', () => {
  it('round-trips groups, spreads them through ordinary writes, and clears them on reset', () => {
    const first = renderHook(() => useColumnPreferences('groups'));
    act(() => first.result.current.onColumnGroupsChange(() => ({ groups, order: ['a', 'b'] }), 'now'));
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ groups, order: ['a', 'b'] });
    first.unmount();
    const { result } = renderHook(() => useColumnPreferences('groups'));
    expect(result.current.preferences.groups).toEqual(groups);
    act(() => result.current.onColumnVisibilityChange({ b: false }));
    expect(JSON.parse(localStorage.getItem(key)!).groups).toEqual(groups);
    act(() => result.current.resetPreferences());
    expect(result.current.preferences).not.toHaveProperty('groups');
    expect(JSON.parse(localStorage.getItem(key)!)).not.toHaveProperty('groups');
  });
  it('old records retain their exact shape and are not rewritten at read', () => {
    const old = { sizing: { a: 120 }, visibility: {}, pinning: { left: [], right: [] }, order: [] };
    localStorage.setItem(key, JSON.stringify(old));
    const write = vi.spyOn(localStorage, 'setItem');
    expect(renderHook(() => useColumnPreferences('groups')).result.current.preferences).toEqual(old);
    expect(write).not.toHaveBeenCalled();
  });
  it.each([null, [], { items: [] }, { basis: 3, items: [] }, { basis: 'x', items: {} }])('rejects a malformed groups envelope: %j', value => {
    localStorage.setItem(key, JSON.stringify({ groups: value }));
    expect(renderHook(() => useColumnPreferences('groups')).result.current.preferences).not.toHaveProperty('groups');
  });
  it('sanitizes strict item fields and keeps an explicit empty snapshot', () => {
    localStorage.setItem(key, JSON.stringify({ groups: { basis: 'x', items: [
      { id: 1, members: ['a'] }, { id: 'u:no-name', members: ['a'] },
      { id: 'D', label: ' ', members: ['a'] }, { id: 'D', label: 'x'.repeat(61), members: ['a'] },
      { id: 'D', width: 59, members: ['a'] }, { id: 'D', width: '100', members: ['a'] },
      { id: 'D', members: 'a' }, { id: 'u:ok', label: ' Trim ', width: 100, members: ['a'], extra: 'drop' },
    ] } }));
    expect(renderHook(() => useColumnPreferences('groups')).result.current.preferences.groups).toEqual({ basis: 'x', items: [{ id: 'u:ok', label: 'Trim', width: 100, members: ['a'] }] });
  });
  it('debounces repeated group widths for 300 ms and preserves member sizing', () => {
    const { result } = renderHook(() => useColumnPreferences('groups'));
    act(() => result.current.onColumnSizingChange({ a: 177 }));
    const write = vi.spyOn(localStorage, 'setItem');
    for (const width of [100, 120, 140]) act(() => result.current.onColumnGroupsChange(() => ({ groups: { ...groups, items: [{ id: 'D', members: ['a'], width }] } }), 'later'));
    expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(299));
    expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ sizing: { a: 177 }, groups: { items: [{ width: 140 }] } });
  });
});
