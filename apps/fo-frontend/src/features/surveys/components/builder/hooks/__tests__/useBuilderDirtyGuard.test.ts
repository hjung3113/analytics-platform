import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useBuilderDirtyGuard } from '../useBuilderDirtyGuard';

function beforeUnloadEvent(): BeforeUnloadEvent {
  return new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
}

describe('useBuilderDirtyGuard', () => {
  it('registers the unload prompt only while the builder is dirty', () => {
    const { result } = renderHook(() => useBuilderDirtyGuard());
    const cleanEvent = beforeUnloadEvent();
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    act(() => result.current.setDirty(true));
    expect(result.current.dirtyRef.current).toBe(true);
    const dirtyEvent = beforeUnloadEvent();
    const setReturnValue = vi.fn();
    Object.defineProperty(dirtyEvent, 'returnValue', { set: setReturnValue });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    expect(setReturnValue).toHaveBeenCalledWith('');

    act(() => result.current.setDirty(false));
    expect(result.current.dirtyRef.current).toBe(false);
    const cleanAgainEvent = beforeUnloadEvent();
    window.dispatchEvent(cleanAgainEvent);
    expect(cleanAgainEvent.defaultPrevented).toBe(false);
  });
});
