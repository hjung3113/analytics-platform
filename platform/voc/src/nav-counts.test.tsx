import { Fragment, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { spaceId } from '@ap/contracts';
import { foQueryClient } from '@ap/feature-bridge';
import { setFoApi } from '@ap/feature-bridge/fo-api';
import { navCountsSlot } from '@ap/feature-bridge/nav-counts';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { registry } from './test-support';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const ALL = '/api/fo/nav/counts';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const Counts = navCountsSlot.For(spaceId('feedbackops'))!;

function stubFetch(handle: (path: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return handle(String(input)); }));
  return calls;
}

/** Renders the counts as a JSON text; `Child` is a sentinel the slot must keep mounted. */
function Probe() {
  return <Counts>{counts => <Fragment><p data-testid="counts">{JSON.stringify(counts)}</p><input aria-label="sentinel" /></Fragment>}</Counts>;
}

function mountAt(url: string, children: ReactNode = <Probe />) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view', 'feedbackops:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>{children}</PlatformProvider></I18nProvider>);
}

const read = () => JSON.parse(screen.getByTestId('counts').textContent!) as Record<string, number> | null;

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); foQueryClient.clear(); });
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('navCounts slot', () => {
  it('serves only the FeedbackOps space', () => {
    expect(navCountsSlot.For(spaceId('feedbackops'))).not.toBeNull();
    expect(navCountsSlot.For(spaceId('bravo'))).toBeNull();
    expect(navCountsSlot.For(spaceId('feedbackops'))).toBe(navCountsSlot.For(spaceId('feedbackops')));
  });

  it('without a FeedbackOps API gives null and requests nothing', async () => {
    const calls = stubFetch(() => json({ counts: {} }));
    mountAt('/feedbackops/vocs');
    expect(read()).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(read()).toBeNull();
    expect(calls).toEqual([]);
  });

  describe('with a FeedbackOps API', () => {
    beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

    it('maps FeedbackOps count keys to menu and view keys, keeps 0 and leaves an omitted key absent', async () => {
      stubFetch(() => json({ counts: { 'voc.inbox': 12, 'voc.triage': 0, 'voc.inbox.no-link': 4, 'voc.tab.high': 2, 'voc.my': 9, 'voc.clusters': 1 } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(read()).toEqual({ 'fo-inbox': 12, 'fo-triage': 0, 'fo-inbox/no-link': 4, 'fo-triage/high': 2, 'fo-clusters': 1 });
    });

    it('maps findings.all to the fo-findings slot and leaves it absent when omitted', async () => {
      stubFetch(() => json({ counts: { 'voc.inbox': 1, 'findings.all': 7 } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(read()).toEqual({ 'fo-inbox': 1, 'fo-findings': 7 });
      cleanup();
      stubFetch(() => json({ counts: { 'voc.inbox': 1 } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(read()).toEqual({ 'fo-inbox': 1 });
    });

    it('asks for all systems without managedSystem and forwards the page value when present', async () => {
      const calls = stubFetch(() => json({ counts: { 'voc.inbox': 1 } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(calls).toEqual([ALL]);
      cleanup();
      calls.length = 0;
      mountAt(`/feedbackops/triage?managedSystem=${SYSTEM}`);
      await waitFor(() => expect(read()).not.toBeNull());
      expect(calls).toEqual([`${ALL}?managed_system_id=${SYSTEM}`]);
    });

    it('gives null after an error', async () => {
      const calls = stubFetch(() => json({ error: 'boom' }, 500));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(calls.length).toBe(1));
      await act(async () => { await Promise.resolve(); });
      expect(read()).toBeNull();
    });

    it('calls children at one stable position: the sibling element survives loading → ready', async () => {
      let release: (response: Response) => void = () => {};
      stubFetch(() => new Promise<Response>(resolve => { release = resolve; }));
      mountAt('/feedbackops/vocs');
      const sentinel = screen.getByLabelText('sentinel');
      expect(read()).toBeNull();
      await act(async () => { release(json({ counts: { 'voc.inbox': 5 } })); });
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 5 }));
      expect(screen.getByLabelText('sentinel')).toBe(sentinel);
    });

    it('refreshes when FeedbackOps invalidates the nav counts', async () => {
      let n = 1;
      const calls = stubFetch(() => json({ counts: { 'voc.inbox': n } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 1 }));
      n = 2;
      await act(async () => { invalidateNavCounts(foQueryClient); });
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 2 }));
      expect(calls).toEqual([ALL, ALL]);
    });

    it('shows the result of a refetch it did not start', async () => {
      let n = 1;
      stubFetch(() => json({ counts: { 'voc.inbox': n } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 1 }));
      n = 7;
      await act(async () => { await foQueryClient.refetchQueries({ queryKey: ['nav-counts'] }); });
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 7 }));
    });

    it('clears loaded counts when a later read fails and shows them again on recovery', async () => {
      let fail = false;
      stubFetch(() => fail ? json({ error: 'boom' }, 500) : json({ counts: { 'voc.inbox': 3 } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 3 }));
      fail = true;
      await act(async () => { invalidateNavCounts(foQueryClient); });
      await waitFor(() => expect(read()).toBeNull());
      fail = false;
      await act(async () => { invalidateNavCounts(foQueryClient); });
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 3 }));
    });

    it('shows only the new scope after a scope change in one mounted slot', async () => {
      const calls = stubFetch(path => json({ counts: { 'voc.inbox': path.includes(SYSTEM) ? 20 : 10 } }));
      mountAt('/feedbackops/vocs');
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 10 }));
      const sentinel = screen.getByLabelText('sentinel');
      let release: (response: Response) => void = () => {};
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return new Promise<Response>(resolve => { release = resolve; }); }));
      await act(async () => { window.history.pushState(null, '', `/feedbackops/vocs?managedSystem=${SYSTEM}`); window.dispatchEvent(new PopStateEvent('popstate')); });
      await waitFor(() => expect(calls).toContain(`${ALL}?managed_system_id=${SYSTEM}`));
      expect(read()).toBeNull();
      await act(async () => { release(json({ counts: { 'voc.inbox': 20 } })); });
      await waitFor(() => expect(read()).toEqual({ 'fo-inbox': 20 }));
      expect(screen.getByLabelText('sentinel')).toBe(sentinel);
    });

    it('aborts the pending request when the scope changes and when the slot unmounts', async () => {
      const signals: AbortSignal[] = [];
      vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init!.signal!);
        return new Promise<Response>(() => {});
      }));
      const view = mountAt('/feedbackops/vocs');
      await waitFor(() => expect(signals.length).toBe(1));
      expect(signals[0]!.aborted).toBe(false);
      await act(async () => { window.history.pushState(null, '', `/feedbackops/vocs?managedSystem=${SYSTEM}`); window.dispatchEvent(new PopStateEvent('popstate')); });
      await waitFor(() => expect(signals.length).toBe(2));
      await waitFor(() => expect(signals[0]!.aborted).toBe(true));
      expect(signals[1]!.aborted).toBe(false);
      view.unmount();
      await waitFor(() => expect(signals[1]!.aborted).toBe(true));
    });
  });
});
