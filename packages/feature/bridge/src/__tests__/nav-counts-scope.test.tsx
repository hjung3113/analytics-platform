import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceId } from '@ap/contracts';
import { navCountsSlot } from '../nav-counts';

const state = vi.hoisted(() => ({ raw: null as string | null, status: 'ready' }));
const fetchCounts = vi.hoisted(() => vi.fn<(options: { managedSystemId?: string; signal?: AbortSignal }) => Promise<{ counts: Record<string, number> }>>().mockResolvedValue({ counts: { 'voc.inbox': 7 } }));
vi.mock('@ap/kernel', () => ({ usePlatform: () => ({ pageParam: () => state.raw }) }));
vi.mock('@ap/feature-screens/global-screens/core', async importOriginal => ({ ...(await importOriginal<typeof import('@ap/feature-screens/global-screens/core')>()), fetchNavCounts: fetchCounts }));
vi.mock('../operator-menus', () => ({ SCOPE_KEY: 'managedSystem', usesNavCounts: () => true }));
vi.mock('../feature/session', () => ({
  featureQueryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  useFeatureSession: () => ({ status: state.status }),
}));

import { featureQueryClient } from '../feature/session';

const Counts = navCountsSlot.For(spaceId('flow'), null)!;
const UUID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => { state.raw = null; state.status = 'ready'; fetchCounts.mockClear(); featureQueryClient.clear(); });
afterEach(() => { cleanup(); featureQueryClient.clear(); });

function output() {
  return <Counts>{counts => <output>{JSON.stringify(counts)}</output>}</Counts>;
}

describe('nav count scope validation (#2014 FEA-7)', () => {
  it.each(['abc', 'all', '', ' 33333333-3333-4333-8333-333333333333'])('rejects the present invalid scope %j without requesting counts', async raw => {
    state.raw = raw;
    const screen = render(output());
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('null'));
    expect(fetchCounts).not.toHaveBeenCalled();
    expect(featureQueryClient.isFetching()).toBe(0);
  });

  it.each([null, UUID])('requests counts for the absent or valid scope %j', async raw => {
    state.raw = raw;
    const screen = render(output());
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('{"inbox":7}'));
    expect(fetchCounts).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(raw === null ? {} : { managedSystemId: UUID }));
    if (raw === null) expect(fetchCounts.mock.calls[0]?.[0]).not.toHaveProperty('managedSystemId');
  });

  it('hides cached all-system counts when an invalid scope replaces the absent scope', async () => {
    const screen = render(output());
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('{"inbox":7}'));
    state.raw = 'all';
    screen.rerender(output());
    expect(screen.getByRole('status').textContent).toBe('null');
    expect(fetchCounts).toHaveBeenCalledTimes(1);
  });
});
