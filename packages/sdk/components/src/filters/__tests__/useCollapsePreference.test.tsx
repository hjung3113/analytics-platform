import { memoryStorage } from '@ap/kernel/testing';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollapsePreference } from '../useCollapsePreference';
let userId: string | undefined = 'alice';
vi.mock('@ap/kernel', () => ({ usePlatformOptional: () => userId ? { session: { user: { id: userId } } } : undefined }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); userId = 'alice'; });
describe('shared collapse preference', () => {
  it.each([
    ['sidebar-collapsed', '1'], ['query-bar-collapsed', 'true'],
    ['page-filter-collapsed', 'true'], ['page-head-collapsed', 'true'],
  ])('migrates %s to an account-owned JSON boolean once', (kind, legacy) => {
    const oldKey = `platform:${kind}:menu`;
    localStorage.setItem(oldKey, legacy);
    const { result, rerender } = renderHook(() => useCollapsePreference(oldKey, ''));
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(`platform:${kind}:v1:alice:menu`)).toBe('true');
    expect(localStorage.getItem(oldKey)).toBeNull();
    userId = 'bob'; rerender();
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle(true));
    expect(localStorage.getItem(`platform:${kind}:v1:bob:menu`)).toBe('true');
    userId = 'alice'; rerender();
    expect(result.current.collapsed).toBe(true);
  });
  it('migrates analysis sections to independent JSON booleans', () => {
    localStorage.setItem('platform:analysis-collapsed:menu', '["a","retired"]');
    const { result, rerender } = renderHook(() => useCollapsePreference('platform:analysis-collapsed:menu', '', { sections: ['a', 'b'] }));
    expect(result.current.collapsedSections).toEqual(['a']);
    expect(localStorage.getItem('platform:analysis-collapsed:v1:alice:menu:a')).toBe('true');
    expect(localStorage.getItem('platform:analysis-collapsed:menu')).toBeNull();
    act(() => result.current.toggleSection('b', true));
    userId = 'bob'; rerender();
    expect(result.current.collapsedSections).toEqual([]);
  });
  it('keeps memory choices when writes are blocked and clears them on sign-out', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result, rerender } = renderHook(() => useCollapsePreference('platform:sidebar-collapsed', ''));
    act(() => result.current.toggle(true));
    expect(result.current.collapsed).toBe(true);
    userId = undefined; rerender();
    expect(result.current.collapsed).toBe(false);
    spy.mockRestore();
  });
});

it.each(['sidebar-collapsed', 'query-bar-collapsed', 'page-filter-collapsed', 'page-head-collapsed'])('deletes invalid %s legacy values and keeps the declared default', kind => {
  const old = `platform:${kind}:menu`;
  localStorage.setItem(old, '{broken');
  const { result } = renderHook(() => useCollapsePreference(old, '', { defaultCollapsed: true }));
  expect(result.current.collapsed).toBe(true);
  expect(localStorage.getItem(old)).toBeNull();
});

it('board mode ignores browser preferences and retains only its own toggles', () => {
  localStorage.setItem('platform:query-bar-collapsed:v1:alice:menu', 'false');
  const { result } = renderHook(() => useCollapsePreference('platform:query-bar-collapsed:menu', '', { defaultCollapsed: true, persist: false }));
  expect(result.current.collapsed).toBe(true);
  act(() => result.current.toggle(false));
  expect(result.current.collapsed).toBe(false);
  expect(localStorage.getItem('platform:query-bar-collapsed:v1:alice:menu')).toBe('false');
});
