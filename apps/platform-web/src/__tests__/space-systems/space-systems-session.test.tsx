import { useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { featureQueryClient, fetchSpaceLinks, setFeatureApi, useFeatureSession } from '@ap/feature-bridge';
import { resetFeatureSessionForTests } from '@ap/feature-bridge/testing';
import { SpaceSystemsSession } from '../../space-systems-session';
import { spaceSystems } from '../../space-systems';

const platform = { adapter: {} as PlatformAdapter, revision: 1, user: { id: 'u1' } as { id: string } | null };
vi.mock('@ap/kernel', async (original) => ({ ...(await original<typeof import('@ap/kernel')>()), usePlatform: () => platform }));

const onSessionLost = vi.fn();
const api = { basePath: '/api/features', onSessionLost };
const source = (signal: AbortSignal, identity: readonly unknown[]) => fetchSpaceLinks(api, signal, identity);

type Pending = { signal: AbortSignal | undefined; settle: (status: number) => void };
let pending: Pending[] = [];

const statuses: string[] = [];
function FeatureHook() { statuses.push(useFeatureSession().status); return null; }
const lastStatus = () => statuses[statuses.length - 1];
const CACHE_KEY = ['feature-cache-probe'];
const seedCache = () => featureQueryClient.setQueryData(CACHE_KEY, 'row');
const tree = (hook: boolean) => <><SpaceSystemsSession source={source} />{hook ? <FeatureHook /> : null}</>;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const newSession = () => { platform.adapter = {} as PlatformAdapter; };
/** The server answers the oldest still-open request with `status` (the abort is checked by the transport, like the real fetch rejects). */
const answer = async (index: number, status: number) => { await act(async () => { pending[index]!.settle(status); await flush(); }); };

beforeEach(() => {
  platform.adapter = {} as PlatformAdapter; platform.revision = 1; platform.user = { id: 'u1' };
  pending = []; statuses.length = 0; onSessionLost.mockClear(); resetFeatureSessionForTests(); spaceSystems.reset(); setFeatureApi(api);
  vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve) => {
    // A real fetch still delivers a response that raced the abort here: the transport itself must refuse to act on it.
    pending.push({ signal: init?.signal ?? undefined, settle: (status) => resolve(new Response('{}', { status })) });
  })));
});
afterEach(() => { cleanup(); featureQueryClient.clear(); setFeatureApi(null); vi.unstubAllGlobals(); spaceSystems.reset(); });

/** Runs in the same commit as `SpaceSystemsSession` (a later sibling's layout effect), i.e. before any passive effect or response task. */
function CommitProbe({ seen }: { seen: boolean[] }) { useLayoutEffect(() => { seen.push(pending[0]?.signal?.aborted ?? false); }); return null; }

describe('space links 401 vs the host session (#1289 node j)', () => {
  it('an old session-A request answered 401 after B committed never fires, with B\'s feature hook mounted', async () => {
    const view = render(tree(true));
    expect(pending).toHaveLength(1);
    expect(lastStatus()).toBe('ready');
    newSession();
    view.rerender(tree(true));
    expect(pending[0]!.signal?.aborted).toBe(true); // aborted during commit
    seedCache();
    await answer(0, 401);
    expect(onSessionLost).not.toHaveBeenCalled();
    expect(lastStatus()).toBe('ready'); // the replacement hook stays ready
    expect(featureQueryClient.getQueryData(CACHE_KEY)).toBe('row'); // and its cache is retained
  });

  it('an old A request answered 401 after A\'s hook unmounted and B committed with no B hook never fires', async () => {
    const view = render(tree(true));
    view.rerender(tree(false));
    newSession();
    view.rerender(tree(false));
    expect(pending[0]!.signal?.aborted).toBe(true);
    await answer(0, 401);
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('an old A request answered 401 after B committed with no feature hook ever mounted never fires', async () => {
    const view = render(tree(false));
    newSession();
    view.rerender(tree(false));
    expect(pending[0]!.signal?.aborted).toBe(true);
    await answer(0, 401);
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('a current B request answered 401 with no B feature hook (A\'s hook is gone) reaches the host onSessionLost', async () => {
    const view = render(tree(true));
    view.rerender(tree(false));
    newSession();
    view.rerender(tree(false));
    expect(pending).toHaveLength(2);
    seedCache();
    await answer(1, 401);
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    // Only the host handler ran, not A's stale `active.fire()` (which retires A's epoch and clears the feature cache); the cache is its observable effect.
    expect(featureQueryClient.getQueryData(CACHE_KEY)).toBe('row');
  });

  it('a current request of the mounted feature generation runs the shared handling (host redirect once)', async () => {
    render(tree(true));
    expect(lastStatus()).toBe('ready');
    seedCache();
    await answer(0, 401);
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(lastStatus()).toBe('retired'); // the shared handling retired the mounted hook
    expect(featureQueryClient.getQueryData(CACHE_KEY)).toBeUndefined(); // and cleared the cache
  });

  it('the previous session\'s request is already aborted within the commit that changes the host session', () => {
    const seen: boolean[] = [];
    const probed = () => <><SpaceSystemsSession source={source} /><CommitProbe seen={seen} /></>;
    const view = render(probed());
    newSession();
    view.rerender(probed());
    expect(seen).toEqual([false, true]);
  });
});
