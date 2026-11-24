import { ApiError } from '../../api/types';
import { focusManager, QueryObserver, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeatureQueryClient, FOCUS_REFETCH_AFTER_MS, shouldRefetchOnFocus, shouldRetryQuery } from '../query-client';

describe('shouldRetryQuery', () => {
  it('does not retry permission-denied 403 responses', () => {
    expect(
      shouldRetryQuery(0, new ApiError(403, { code: 'permission.denied', message: 'denied' })),
    ).toBe(false);
  });

  it('retries a 500 response', () => {
    expect(
      shouldRetryQuery(0, new ApiError(500, { code: 'internal.unexpected', message: 'failed' })),
    ).toBe(true);
  });

  it('retries a 429 response but stops after three failures', () => {
    const rateLimited = new ApiError(429, { code: 'rate_limited.actor', message: 'slow down' });
    expect(shouldRetryQuery(2, rateLimited)).toBe(true);
    expect(shouldRetryQuery(3, rateLimited)).toBe(false);
  });
});

describe('createFeatureQueryClient', () => {
  it('applies the retry policy to every query by default', () => {
    expect(createFeatureQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });
});

describe('tab return: default unchanged, opt-in reads only data 30 seconds old (#2819)', () => {
  // Each case observes one query on a fresh client, then blurs and refocuses the tab the way the browser does.
  const clients: QueryClient[] = [];
  // QueryClientProvider mounts the client in the app; only a mounted client listens to focus.
  const mounted = () => { const client = createFeatureQueryClient(); client.mount(); clients.push(client); return client; };
  async function observe(optIn = true) {
    const client = mounted();
    const queryFn = vi.fn(async () => queryFn.mock.calls.length);
    const observer = new QueryObserver(client, { queryKey: ['focus'], queryFn, ...(optIn ? { refetchOnWindowFocus: shouldRefetchOnFocus } : {}) });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    return { client, queryFn, observer, unsubscribe };
  }
  const refocus = async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => {
    for (const client of clients.splice(0)) client.unmount();
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it('keeps the default: a query that does not opt in reads again on every tab return', async () => {
    const { queryFn, unsubscribe } = await observe(false);
    await refocus();
    expect(queryFn).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('keeps the default: data still fresh by its own staleTime is not read again on a tab return', async () => {
    const client = mounted();
    const queryFn = vi.fn(async () => 1);
    const stop = new QueryObserver(client, { queryKey: ['fresh'], queryFn, staleTime: 10_000 }).subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
    await refocus();
    expect(queryFn).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not read an opted-in query again within 30 seconds', async () => {
    const { queryFn, unsubscribe } = await observe();
    vi.advanceTimersByTime(FOCUS_REFETCH_AFTER_MS - 1_000);
    await refocus();
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('reads again after 30 seconds', async () => {
    const { queryFn, unsubscribe } = await observe();
    vi.advanceTimersByTime(FOCUS_REFETCH_AFTER_MS);
    await refocus();
    expect(queryFn).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('reads an invalidated query again within 30 seconds', async () => {
    const { client, queryFn, unsubscribe } = await observe();
    await client.invalidateQueries({ queryKey: ['focus'], refetchType: 'none' });
    await refocus();
    expect(queryFn).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('still reads again on a remount within 30 seconds', async () => {
    const { client, queryFn, unsubscribe } = await observe();
    unsubscribe();
    const again = new QueryObserver(client, { queryKey: ['focus'], queryFn, refetchOnWindowFocus: shouldRefetchOnFocus });
    const stop = again.subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    stop();
  });

  it('reads again within 30 seconds when another observer of the key did not opt in', async () => {
    const { client, queryFn, unsubscribe } = await observe();
    const stop = new QueryObserver(client, { queryKey: ['focus'], queryFn }).subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2)); // its own mount read
    await refocus();
    expect(queryFn).toHaveBeenCalledTimes(3);
    stop();
    unsubscribe();
  });
});
