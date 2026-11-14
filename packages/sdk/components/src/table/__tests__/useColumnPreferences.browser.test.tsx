import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { useColumnPreferences } from '../useColumnPreferences';
let userId = 'alice';
vi.mock('@ap/kernel', async original => ({ ...await original<typeof import('@ap/kernel')>(), usePlatformOptional: () => ({ session: { user: { id: userId } } }) }));
beforeEach(() => { userId = 'alice'; vi.stubGlobal('localStorage', memoryStorage()); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('browser columns: migration and account ownership', () => {
  it('migrates once, sanitizes columns, and deletes the legacy key', () => {
    localStorage.setItem('table', JSON.stringify({ visibility: { a: false }, sizing: { a: 130 }, order: ['a'] }));
    const { result, unmount } = renderHook(() => useColumnPreferences('table'));
    expect(result.current.preferences.visibility).toEqual({ a: false });
    expect(localStorage.getItem('table')).toBeNull();
    expect(JSON.parse(localStorage.getItem('platform:columns:v1:alice:table')!).sizing).toEqual({ a: 130 });
    unmount();
    localStorage.setItem('table', JSON.stringify({ visibility: { b: false } }));
    expect(renderHook(() => useColumnPreferences('table')).result.current.preferences.visibility).toEqual({ a: false });
  });
  it('deletes malformed legacy JSON and uses defaults', () => {
    localStorage.setItem('table', '{broken');
    expect(renderHook(() => useColumnPreferences('table')).result.current.preferences.visibility).toEqual({});
    expect(localStorage.getItem('table')).toBeNull();
  });
  it('flushes pending widths to the original user and re-reads on account switches', () => {
    const { result, rerender } = renderHook(() => useColumnPreferences('table'));
    act(() => result.current.onColumnSizingChange({ a: 155 }));
    userId = 'bob'; rerender();
    expect(result.current.preferences.sizing).toEqual({});
    act(() => vi.advanceTimersByTime(300));
    expect(JSON.parse(localStorage.getItem('platform:columns:v1:alice:table')!).sizing).toEqual({ a: 155 });
    expect(localStorage.getItem('platform:columns:v1:bob:table')).toBeNull();
    userId = 'alice'; rerender();
    expect(result.current.preferences.sizing).toEqual({ a: 155 });
  });
});


it.each(['width', 'visibility'] as const)('keeps a %s edit with its owner when account rerender is batched before effects', edit => {
  const { result, rerender } = renderHook(() => useColumnPreferences('table'));
  act(() => {
    if (edit === 'width') result.current.onColumnSizingChange({ a: 177 });
    else result.current.onColumnVisibilityChange({ a: false });
    userId = 'bob';
    rerender();
  });
  act(() => vi.advanceTimersByTime(300));
  const original = JSON.parse(localStorage.getItem('platform:columns:v1:alice:table') ?? 'null');
  expect(original).toMatchObject(edit === 'width' ? { sizing: { a: 177 } } : { visibility: { a: false } });
  expect(localStorage.getItem('platform:columns:v1:bob:table')).toBeNull();
  expect(result.current.preferences.sizing).toEqual({});
  expect(result.current.preferences.visibility).toEqual({});
});
