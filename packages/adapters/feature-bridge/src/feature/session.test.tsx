import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { setFeatureApi } from '../feature-api';

const platform = { adapter: {} as PlatformAdapter, revision: 1, user: { id: 'u1' } as { id: string } | null };
vi.mock('@ap/kernel', () => ({ usePlatform: () => platform }));

const { featureQueryClient, unauthorizedReporter, useFeatureSession, resetFeatureSessionForTests } = await import('./session');
const { registerSessionDraft, takeSessionDraft } = await import('@ap/feature-screens/global-screens/core');

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

  it('a current-host request whose identity has no feature generation reaches only the host callback and leaves a mounted feature session alone', () => {
    const onSessionLost = withApi();
    const hook = renderHook(() => useFeatureSession());
    featureQueryClient.setQueryData(['kept'], 1);
    const other = [{} as PlatformAdapter, 1, 'u1'] as const; // host session with no feature hook of its own
    act(() => unauthorizedReporter({ onSessionLost }, other)());
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('ready');
    expect(featureQueryClient.getQueryCache().getAll()).toHaveLength(1);
  });

  it('without an identity (systems-overview) a request binds to the epoch it started under', () => {
    const onSessionLost = withApi();
    const hook = renderHook(() => useFeatureSession());
    const report = unauthorizedReporter({ onSessionLost });
    platform.revision += 1;
    hook.rerender(); // a new generation: the old epoch's request must do nothing
    act(() => report());
    expect(onSessionLost).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('ready');
    act(() => unauthorizedReporter({ onSessionLost })());
    expect(onSessionLost).toHaveBeenCalledTimes(1);
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
});

// The bridge never touches web storage itself (lint); what was kept is read back through the feature registry.
describe('session-expiry drafts (#1887)', () => {
  let unregister: (() => void) | null = null;
  beforeEach(() => { platform.user = { id: 'u1' }; });
  afterEach(() => { unregister?.(); unregister = null; platform.user = { id: 'u1' }; });

  /** A new generation for `userId` (re-authentication), which binds the kept drafts to that user. */
  const signInAgain = (hook: { rerender: () => void }, userId: string) => { platform.user = { id: userId }; platform.revision += 1; hook.rerender(); };

  it('keeps nothing while the session is healthy', () => {
    withApi();
    const hook = renderHook(() => useFeatureSession());
    unregister = registerSessionDraft('voc-compose', () => ({ title: 'typed' }));
    signInAgain(hook, 'u1');
    expect(hook.result.current.status).toBe('ready');
    expect(takeSessionDraft('voc-compose')).toBeNull();
  });

  it('a 401 keeps the drafts before the cache is cleared; the same user\'s next session takes it once', () => {
    const onSessionLost = withApi();
    const hook = renderHook(() => useFeatureSession());
    featureQueryClient.setQueryData(['rows'], 1);
    const seenCacheAtRead: number[] = [];
    unregister = registerSessionDraft('voc-compose', () => { seenCacheAtRead.push(featureQueryClient.getQueryCache().getAll().length); return { title: 'typed' }; });
    act(() => unauthorizedReporter({ onSessionLost }, identity())());
    expect(seenCacheAtRead).toEqual([1]);
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe('retired');
    expect(takeSessionDraft('voc-compose')).toBeNull(); // not readable until a new session is ready
    signInAgain(hook, 'u1');
    expect(hook.result.current.status).toBe('ready');
    expect(takeSessionDraft('voc-compose')).toEqual({ title: 'typed' });
    expect(takeSessionDraft('voc-compose')).toBeNull();
  });

  it('another user\'s next session deletes the draft unread', () => {
    const onSessionLost = withApi();
    const hook = renderHook(() => useFeatureSession());
    unregister = registerSessionDraft('voc-compose', () => ({ title: 'typed' }));
    act(() => unauthorizedReporter({ onSessionLost }, identity())());
    unregister();
    unregister = null;
    signInAgain(hook, 'u2');
    expect(takeSessionDraft('voc-compose')).toBeNull();
    signInAgain(hook, 'u1'); // deleted, not only hidden from u2
    expect(takeSessionDraft('voc-compose')).toBeNull();
  });
});
