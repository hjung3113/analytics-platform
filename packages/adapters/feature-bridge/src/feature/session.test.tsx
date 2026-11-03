import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { setFeatureApi } from '../feature-api';

const platform = { adapter: {} as PlatformAdapter, revision: 1, user: { id: 'u1' } as { id: string } | null };
vi.mock('@ap/kernel', () => ({ usePlatform: () => platform }));

const { featureQueryClient, unauthorizedReporter, useFeatureSession, resetFeatureSessionForTests } = await import('./session');

const identity = () => [platform.adapter, platform.revision, platform.user?.id ?? null] as const;

beforeEach(() => { platform.adapter = {} as PlatformAdapter; platform.revision = 1; resetFeatureSessionForTests(); });
afterEach(() => { cleanup(); setFeatureApi(null); featureQueryClient.clear(); });

const withApi = () => { const onSessionLost = vi.fn(); setFeatureApi({ basePath: '/api/features', onSessionLost }); return onSessionLost; };

describe('unauthorizedReporter', () => {
  it('with no feature session mounted at all, a 401 falls back to the host callback', () => {
    const onSessionLost = withApi();
    unauthorizedReporter({ onSessionLost }, identity())();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  it('a request begun before the first feature mount is handled by the same-generation session that mounted before its 401', () => {
    const onSessionLost = withApi();
    const report = unauthorizedReporter({ onSessionLost }, identity());
    const hook = renderHook(() => useFeatureSession());
    expect(hook.result.current.status).toBe('ready');
    act(() => report());
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('retired');
  });

  it('a pre-mount request of session A does not retire session B whose hook mounted before A\'s 401', () => {
    const onSessionLost = withApi();
    const reportA = unauthorizedReporter({ onSessionLost }, identity()); // started under A, no feature hook yet
    platform.adapter = {} as PlatformAdapter; // session B replaces A; the store is not aborted yet
    const hookB = renderHook(() => useFeatureSession());
    featureQueryClient.setQueryData(['b-cache'], 1);
    expect(hookB.result.current.status).toBe('ready');
    act(() => reportA());
    expect(onSessionLost).not.toHaveBeenCalled();
    expect(hookB.result.current.status).toBe('ready');
    expect(featureQueryClient.getQueryCache().getAll()).toHaveLength(1);
  });

  it('a current request still reaches the shared handling after another consumer mounted in the same generation', () => {
    const onSessionLost = withApi();
    const first = renderHook(() => useFeatureSession());
    featureQueryClient.setQueryData(['sibling'], 1); // already-loaded sibling data
    const report = unauthorizedReporter({ onSessionLost }, identity());
    const second = renderHook(() => useFeatureSession()); // e.g. the rail's recent-notifications panel
    expect(first.result.current.status).toBe('ready');
    expect(second.result.current.status).toBe('ready');
    act(() => report());
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(featureQueryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(first.result.current.status).toBe('retired');
    expect(second.result.current.status).toBe('retired');
  });

  it('a request from a superseded generation does nothing to the replacement session', () => {
    const onSessionLost = withApi();
    const hook = renderHook(() => useFeatureSession());
    const report = unauthorizedReporter({ onSessionLost }, identity());
    platform.revision += 1;
    hook.rerender();
    expect(hook.result.current.status).toBe('ready');
    act(() => report());
    expect(onSessionLost).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('ready');
  });
});
