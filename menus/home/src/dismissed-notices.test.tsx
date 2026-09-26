import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dismissNotice, useDismissedNotices } from './pages/dismissed-notices';

describe('notice dismissal lifetime', () => {
  it('survives the home page unmounting and mounting again in the same session', () => {
    const first = renderHook(() => useDismissedNotices());
    act(() => dismissNotice('N-2026-091'));
    expect(first.result.current).toEqual(['N-2026-091']);
    first.unmount();

    const again = renderHook(() => useDismissedNotices());
    expect(again.result.current).toEqual(['N-2026-091']);
  });
});
