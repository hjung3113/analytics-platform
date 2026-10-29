import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissNotice, useDismissedNotices } from './pages/dismissed-notices';

afterEach(() => { cleanup(); vi.resetModules(); });

describe('notice dismissal lifetime', () => {
  it('survives the home page unmounting and mounting again in the same session', () => {
    const first = renderHook(() => useDismissedNotices());
    act(() => dismissNotice('N-2026-091'));
    expect(first.result.current).toEqual(['N-2026-091']);
    first.unmount();

    const again = renderHook(() => useDismissedNotices());
    expect(again.result.current).toEqual(['N-2026-091']);
  });

  it('shows the notice again after a reload: the module state starts empty, so the dismissal lasts this visit only (#1139)', async () => {
    // Dynamic import is the reload simulation: only a fresh module evaluation (via vi.resetModules) starts with empty state.
    const first = await import('./pages/dismissed-notices');
    const visit = renderHook(() => first.useDismissedNotices());
    act(() => first.dismissNotice('N-2026-091'));
    expect(visit.result.current).toEqual(['N-2026-091']);
    visit.unmount();

    vi.resetModules();
    const reloaded = await import('./pages/dismissed-notices');
    const after = renderHook(() => reloaded.useDismissedNotices());
    expect(after.result.current).toEqual([]);
  });
});
