import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { setFeatureApi } from '../feature-api';

const platform = { adapter: {} as PlatformAdapter, revision: 1, user: { id: 'u1' } as { id: string } | null };
vi.mock('@ap/kernel', () => ({ usePlatform: () => platform }));

const { featureQueryClient, unauthorizedReporter, useFeatureSession } = await import('./session');

afterEach(() => { cleanup(); setFeatureApi(null); featureQueryClient.clear(); });


const withApi = () => { const onSessionLost = vi.fn(); setFeatureApi({ basePath: '/api/features', onSessionLost }); return onSessionLost; };

describe('unauthorizedReporter', () => {
  // First on purpose: the session is module state, and "before any feature session" only holds until the first mount in this file.
  it('a request begun before the first feature mount is handled by the session that mounted before its 401', () => {
    const onSessionLost = withApi();
    const report = unauthorizedReporter({ onSessionLost });
    const hook = renderHook(() => useFeatureSession());
    act(() => report());
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('retired');
  });

  it('a current request still reaches the shared handling after another consumer mounted in the same generation', () => {
    const onSessionLost = withApi();
    const first = renderHook(() => useFeatureSession());
    featureQueryClient.setQueryData(['sibling'], 1); // already-loaded sibling data
    const report = unauthorizedReporter({ onSessionLost });
    const second = renderHook(() => useFeatureSession()); // e.g. the rail's recent-notifications panel
    act(() => report());
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(featureQueryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(first.result.current.status).toBe('retired');
    expect(second.result.current.status).toBe('retired');
  });

  it('a request from a superseded generation does nothing to the replacement session', () => {
    const onSessionLost = withApi();
    const hook = renderHook(() => useFeatureSession());
    const report = unauthorizedReporter({ onSessionLost });
    platform.revision += 1;
    hook.rerender();
    expect(hook.result.current.status).toBe('ready');
    act(() => report());
    expect(onSessionLost).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('ready');
  });
});
