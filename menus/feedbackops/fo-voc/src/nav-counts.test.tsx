import { Fragment, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { spaceId } from '@ap/contracts';
import { foQueryClient } from '@ap/fo-bridge';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { navCountsSlot } from '@ap/fo-bridge/nav-counts';
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
    expect(navCountsSlot.For(spaceId('metrics'))).toBeNull();
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
      expect(read()).toEqual({ 'fo-inbox': 12, 'fo-triage': 0, 'fo-inbox/no-link': 4, 'fo-triage/high': 2 });
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
  });
});
