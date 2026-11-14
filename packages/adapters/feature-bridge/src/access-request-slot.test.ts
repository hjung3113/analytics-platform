import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestRead, useCheckLimit } from './access-request-slot';

describe('requestRead (#1933): why a place state is unknown', () => {
  const base = { enabled: true, hasData: false, isError: false, fetchStatus: 'idle' as const };
  it('a place with no read (mock, session not ready, permission place) stays plain', () => {
    expect(requestRead({ ...base, enabled: false, fetchStatus: 'fetching' })).toBeUndefined();
  });
  it('checking only while a fetch really runs; a paused or idle read without data never holds the entry', () => {
    expect(requestRead({ ...base, fetchStatus: 'fetching' })).toBe('checking');
    expect(requestRead({ ...base, fetchStatus: 'paused' })).toBeUndefined();
    expect(requestRead(base)).toBeUndefined();
    expect(requestRead({ ...base, hasData: true, fetchStatus: 'fetching' })).toBeUndefined();
  });
  it('error once the read failed and nothing re-runs it; a retry in flight reads checking again', () => {
    expect(requestRead({ ...base, isError: true })).toBe('error');
    expect(requestRead({ ...base, isError: true, fetchStatus: 'paused' })).toBe('error');
    expect(requestRead({ ...base, isError: true, fetchStatus: 'fetching' })).toBe('checking');
  });
});

describe('useCheckLimit: a read with no answer must not hold the entry for ever', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it('turns a checking that lasts past the limit into error, and a new attempt restarts the clock', () => {
    const { result, rerender } = renderHook(({ read, attempt }: { read: 'checking' | 'error' | undefined; attempt: number }) => useCheckLimit(read, attempt, 1000), { initialProps: { read: 'checking' as 'checking' | 'error' | undefined, attempt: 0 } });
    expect(result.current).toBe('checking');
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current).toBe('checking');
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe('error');
    rerender({ read: 'checking', attempt: 1 });
    expect(result.current).toBe('checking');
    act(() => { vi.advanceTimersByTime(1001); });
    expect(result.current).toBe('error');
  });
  it('leaves an answered read alone', () => {
    const { result, rerender } = renderHook(({ read }: { read: 'checking' | 'error' | undefined }) => useCheckLimit(read, 0, 1000), { initialProps: { read: 'checking' as 'checking' | 'error' | undefined } });
    rerender({ read: undefined });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBeUndefined();
  });
});
