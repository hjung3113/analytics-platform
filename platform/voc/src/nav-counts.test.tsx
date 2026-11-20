import { Fragment, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { featureQueryClient } from '@ap/feature-bridge';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { navCountsSlot } from '@ap/feature-bridge/nav-counts';
import { invalidateNavCounts, NAV_COUNTS_QUERY_KEY } from '@/lib/query/navCounts';
import FeatureInbox from './pages/FeatureInbox';
import { mountAt as mountInbox, registry } from './test-support';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const ALL = '/api/features/nav/counts';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const INBOX = registry.menuById('inbox');
const Counts = navCountsSlot.For(spaceId('flow'), INBOX)!;

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
  const session = testSession(['platform:view', 'features:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>{children}</PlatformProvider></I18nProvider>);
}

const read = () => JSON.parse(screen.getByTestId('counts').textContent!) as Record<string, number> | null;

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); featureQueryClient.clear(); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('navCounts slot', () => {
  it('serves only a counted operator menu (the group and page key decide, not the space), with one stable component', () => {
    expect(navCountsSlot.For(spaceId('flow'), INBOX)).not.toBeNull();
    expect(navCountsSlot.For(spaceId('bravo'), INBOX)).toBe(navCountsSlot.For(spaceId('flow'), INBOX));
    expect(navCountsSlot.For(spaceId('flow'), INBOX)).toBe(navCountsSlot.For(spaceId('flow'), INBOX));
  });

  it.each<[string, MenuEntry | null]>([
    ['no current menu', null],
    ['a platform administration menu (no managedSystem key, group admin)', ({ ...INBOX, id: 'admin-roles', group: groupId('admin'), pageKeys: [] }) as MenuEntry],
    ['an access menu (group access)', ({ ...INBOX, id: 'permission-grants', group: groupId('access') }) as MenuEntry],
    ['the global 내 Task menu (group myActivity)', ({ ...INBOX, id: 'my-tasks', group: groupId('myActivity') }) as MenuEntry],
    ['an operator menu whose group has no counts', ({ ...INBOX, id: 'tasks', group: groupId('tasks') }) as MenuEntry],
    ['an operator menu without the managedSystem key', ({ ...INBOX, pageKeys: ['focus'] }) as MenuEntry],
  ])('mounts nothing for %s, so no operator query can start', (_, menu) => {
    expect(navCountsSlot.For(spaceId('flow'), menu)).toBeNull();
  });

  it('without a feature API gives null and requests nothing', async () => {
    const calls = stubFetch(() => json({ counts: {} }));
    mountAt('/flow/inbox');
    expect(read()).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(read()).toBeNull();
    expect(calls).toEqual([]);
  });

  describe('with a feature API', () => {
    beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

    it('maps feature count keys to menu and view keys, keeps 0 and leaves an omitted key absent', async () => {
      stubFetch(() => json({ counts: { 'voc.inbox': 12, 'voc.triage': 0, 'voc.inbox.no-link': 4, 'voc.tab.high': 2, 'voc.my': 9, 'voc.clusters': 1 } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(read()).toEqual({ 'inbox': 12, 'triage': 0, 'inbox/no-link': 4, 'triage/high': 2, 'clusters': 1 });
    });

    it('maps findings.all to the findings slot and leaves it absent when omitted', async () => {
      stubFetch(() => json({ counts: { 'voc.inbox': 1, 'findings.all': 7 } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(read()).toEqual({ 'inbox': 1, 'findings': 7 });
      cleanup();
      stubFetch(() => json({ counts: { 'voc.inbox': 1 } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(read()).toEqual({ 'inbox': 1 });
    });

    it('asks for all systems without managedSystem and forwards the page value when present', async () => {
      const calls = stubFetch(() => json({ counts: { 'voc.inbox': 1 } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).not.toBeNull());
      expect(calls).toEqual([ALL]);
      cleanup();
      calls.length = 0;
      mountAt(`/flow/triage?managedSystem=${SYSTEM}`);
      await waitFor(() => expect(read()).not.toBeNull());
      expect(calls).toEqual([`${ALL}?managed_system_id=${SYSTEM}`]);
    });

    it('gives null after an error', async () => {
      const calls = stubFetch(() => json({ error: 'boom' }, 500));
      mountAt('/flow/inbox');
      await waitFor(() => expect(calls.length).toBe(1));
      await act(async () => { await Promise.resolve(); });
      expect(read()).toBeNull();
    });

    it('calls children at one stable position: the sibling element survives loading → ready', async () => {
      let release: (response: Response) => void = () => {};
      stubFetch(() => new Promise<Response>(resolve => { release = resolve; }));
      mountAt('/flow/inbox');
      const sentinel = screen.getByLabelText('sentinel');
      expect(read()).toBeNull();
      await act(async () => { release(json({ counts: { 'voc.inbox': 5 } })); });
      await waitFor(() => expect(read()).toEqual({ 'inbox': 5 }));
      expect(screen.getByLabelText('sentinel')).toBe(sentinel);
    });

    it('refreshes when feature invalidates the nav counts', async () => {
      let n = 1;
      const calls = stubFetch(() => json({ counts: { 'voc.inbox': n } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).toEqual({ 'inbox': 1 }));
      n = 2;
      await act(async () => { invalidateNavCounts(featureQueryClient); });
      await waitFor(() => expect(read()).toEqual({ 'inbox': 2 }));
      expect(calls).toEqual([ALL, ALL]);
    });

    it('shows the result of a refetch it did not start', async () => {
      let n = 1;
      stubFetch(() => json({ counts: { 'voc.inbox': n } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).toEqual({ 'inbox': 1 }));
      n = 7;
      await act(async () => { await featureQueryClient.refetchQueries({ queryKey: ['nav-counts'] }); });
      await waitFor(() => expect(read()).toEqual({ 'inbox': 7 }));
    });

    it('clears loaded counts when a later read fails and shows them again on recovery', async () => {
      let fail = false;
      stubFetch(() => fail ? json({ error: 'boom' }, 500) : json({ counts: { 'voc.inbox': 3 } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).toEqual({ 'inbox': 3 }));
      fail = true;
      await act(async () => { invalidateNavCounts(featureQueryClient); });
      await waitFor(() => expect(read()).toBeNull());
      fail = false;
      await act(async () => { invalidateNavCounts(featureQueryClient); });
      await waitFor(() => expect(read()).toEqual({ 'inbox': 3 }));
    });

    it.each([
      { code: 'permission.denied', status: 403, denied: true },
      { code: 'permission.scope_required', status: 403, denied: true },
      { code: 'internal.error', status: 500, denied: false },
    ])('updates the cached Inbox badge after a list refetch fails with $code', async ({ code, status, denied }) => {
      const countsKey = [...NAV_COUNTS_QUERY_KEY, undefined] as const;
      const listKey = ['vocs', 'inbox', 'pages'] as const;
      const cachedCounts = { counts: { 'voc.inbox': 12, 'findings.all': 3 } };
      const freshCounts = { counts: { 'findings.all': 3 } };
      let listFailed = false;
      let releaseCounts: (response: Response) => void = () => {};
      const pendingCounts = new Promise<Response>(resolve => { releaseCounts = resolve; });
      const calls = stubFetch(path => {
        if (path === ALL) return listFailed ? pendingCounts : json(cachedCounts);
        if (path.startsWith('/api/features/vocs?')) {
          return listFailed
            ? json({ code, message: 'List refetch failed' }, status)
            : json({ items: [], page: { has_more: false } });
        }
        throw new Error(`Unexpected request to ${path}`);
      });
      const countRequests = () => calls.filter(path => path === ALL);
      const listStatus = () => featureQueryClient.getQueryCache().find({ queryKey: listKey, exact: false })?.state.status;
      const badge = () => screen.getByTestId('inbox-badge').textContent;
      const content = () => <>
        <FeatureInbox />
        <Counts>{counts => <output data-testid="inbox-badge">{counts?.inbox}</output>}</Counts>
      </>;
      window.history.replaceState(null, '', '/flow/inbox');
      const session = testSession(['platform:view', 'features:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
      const adapter = testAdapter({ session: () => session });
      const view = render(content(), {
        wrapper: ({ children }) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>,
      });
      await waitFor(() => {
        expect(badge()).toBe('12');
        expect(listStatus()).toBe('success');
      });
      act(() => { featureQueryClient.setQueryData(countsKey, cachedCounts); });
      listFailed = true;
      await act(async () => { await featureQueryClient.invalidateQueries({ queryKey: listKey }); });
      expect(listStatus()).toBe('error');

      if (denied) {
        await waitFor(() => {
          expect(featureQueryClient.getQueryData(countsKey)).toBeUndefined();
          expect(badge()).toBe('');
        });
        expect(featureQueryClient.getQueryState(countsKey)?.fetchStatus).toBe('fetching');
        view.rerender(content());
        expect(countRequests()).toEqual([ALL, ALL]);
        await act(async () => { releaseCounts(json(freshCounts)); });
        await waitFor(() => expect(featureQueryClient.getQueryData(countsKey)).toEqual(freshCounts));
        expect(badge()).toBe('');
      } else {
        view.rerender(content());
        expect(featureQueryClient.getQueryData(countsKey)).toEqual(cachedCounts);
        expect(badge()).toBe('12');
        expect(countRequests()).toEqual([ALL]);
      }
    });

    it('shows only the new scope after a scope change in one mounted slot', async () => {
      const calls = stubFetch(path => json({ counts: { 'voc.inbox': path.includes(SYSTEM) ? 20 : 10 } }));
      mountAt('/flow/inbox');
      await waitFor(() => expect(read()).toEqual({ 'inbox': 10 }));
      const sentinel = screen.getByLabelText('sentinel');
      let release: (response: Response) => void = () => {};
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return new Promise<Response>(resolve => { release = resolve; }); }));
      await act(async () => { window.history.pushState(null, '', `/flow/inbox?managedSystem=${SYSTEM}`); window.dispatchEvent(new PopStateEvent('popstate')); });
      await waitFor(() => expect(calls).toContain(`${ALL}?managed_system_id=${SYSTEM}`));
      expect(read()).toBeNull();
      await act(async () => { release(json({ counts: { 'voc.inbox': 20 } })); });
      await waitFor(() => expect(read()).toEqual({ 'inbox': 20 }));
      expect(screen.getByLabelText('sentinel')).toBe(sentinel);
    });

    it('aborts the pending request when the scope changes and when the slot unmounts', async () => {
      const signals: AbortSignal[] = [];
      vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init!.signal!);
        return new Promise<Response>(() => {});
      }));
      const view = mountAt('/flow/inbox');
      await waitFor(() => expect(signals.length).toBe(1));
      expect(signals[0]!.aborted).toBe(false);
      await act(async () => { window.history.pushState(null, '', `/flow/inbox?managedSystem=${SYSTEM}`); window.dispatchEvent(new PopStateEvent('popstate')); });
      await waitFor(() => expect(signals.length).toBe(2));
      await waitFor(() => expect(signals[0]!.aborted).toBe(true));
      expect(signals[1]!.aborted).toBe(false);
      view.unmount();
      await waitFor(() => expect(signals[1]!.aborted).toBe(true));
    });
  });
});

describe('hosted Inbox list denial', () => {
  const ID = '00000000-0000-4000-8000-000000000101';
  const LIST_KEY = ['vocs', 'inbox', 'pages'] as const;
  const DETAIL_KEY = ['voc', ID] as const;
  const CONVERSATION_KEY = ['voc-conversation', ID, 'public'] as const;
  const ROW = {
    id: ID, display_id: 'VOC-CACHED', title: 'Cached Inbox row',
    primary_managed_system_id: SYSTEM, analytics_area_id: null, reporter_id: ID,
    owner_user_id: null, owner_team_id: null, severity: 'high',
    reporter_facing_status: 'received', triage_state: 'untriaged', source_context: 'direct_use',
    created_at: '2026-10-08T00:00:00.000Z', updated_at: '2026-10-08T00:00:00.000Z',
    similar_count: 0, attachment_count: 0,
  };
  const PAGE = {
    items: [ROW], page: { has_more: true, cursor: 'next' },
    out_of_scope_summary: { count: 3, severity_distribution: { high: 3 } },
  };
  const SUMMARY = '3건의 VOC를 조회할 수 없습니다.';
  const DENIAL = { code: 'permission.denied', message: 'VOC read denied' };
  const FAILURE = { code: 'internal.error', message: 'List read failed' };

  const isList = (path: string) => path.startsWith('/api/features/vocs?');
  const refetchList = () => act(async () => {
    await featureQueryClient.refetchQueries({ queryKey: LIST_KEY, type: 'active' });
  });
  const blocked = () => screen.findByRole('heading', { name: 'VOC 처리함', level: 3 });
  const visit = (url: string) => act(async () => {
    window.history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('keeps the same-key rows, summary and pagination absent after a denial followed by a 500', async () => {
    let status = 200;
    const calls = stubFetch(path => {
      if (!isList(path)) return json({ items: [] });
      if (status === 403) return json(DENIAL, status);
      if (status === 500) return json(FAILURE, status);
      return json(PAGE);
    });
    mountAt('/flow/inbox', <FeatureInbox />);
    expect(await screen.findByText(ROW.title)).toBeTruthy();
    expect(screen.getByText(SUMMARY)).toBeTruthy();
    expect(screen.getByRole('button', { name: '더 불러오기' })).toBeTruthy();

    status = 403;
    await refetchList();
    await blocked();
    expect(calls.filter(isList).length).toBeLessThanOrEqual(2);

    status = 500;
    await refetchList();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'VOC 처리함', level: 3 })).toBeNull());
    expect(screen.queryByText(ROW.title)).toBeNull();
    expect(screen.queryByText(SUMMARY)).toBeNull();
    expect(screen.queryByText('심각도 분포: 높음=3')).toBeNull();
    expect(screen.queryByRole('button', { name: '더 불러오기' })).toBeNull();
  });

  it('loads an earlier tab afresh when returning after a different tab is denied', async () => {
    let denied = false;
    const calls = stubFetch(path => {
      if (!isList(path)) return json({ items: [] });
      if (!denied) return json(PAGE);
      if (new URL(path, window.location.origin).searchParams.get('tab') === 'high') return json(DENIAL, 403);
      return new Promise<Response>(() => {});
    });
    mountAt('/flow/inbox', <FeatureInbox />);
    expect(await screen.findByText(ROW.title)).toBeTruthy();

    denied = true;
    await visit('/flow/inbox?tab=high');
    await blocked();
    await visit('/flow/inbox');
    expect(screen.queryByText(ROW.title)).toBeNull();
    expect(screen.queryByText(SUMMARY)).toBeNull();
    await waitFor(() => expect(calls.filter(isList)).toHaveLength(3));
  });

  it('closes the focused drawer and evicts its cached content when only the list is denied', async () => {
    let denied = false;
    const detail = {
      ...ROW, title: 'Cached VOC detail',
      description_rich_content: { type: 'doc', content: [] },
      similar: { items: [] }, next_actions: [],
      next_reporter_states: { allowed: [], forbidden: {} },
      linked_execution: { findingRef: null, taskRef: null },
      conversation_timeline: [], conversation_page: { has_more: false },
      permission_decisions: {}, attachments: [],
    };
    const calls = stubFetch(path => {
      if (isList(path)) return denied ? json(DENIAL, 403) : json(PAGE);
      if (path === `/api/features/vocs/${ID}`) return json(detail);
      return json({ items: [] });
    });
    mountInbox(`/flow/inbox?focus=${ID}`);
    expect(await screen.findByRole('dialog', { name: detail.title })).toBeTruthy();
    expect(featureQueryClient.getQueryData(DETAIL_KEY)).toEqual(detail);
    act(() => { featureQueryClient.setQueryData(CONVERSATION_KEY, { items: ['Cached conversation'] }); });

    denied = true;
    await refetchList();
    await blocked();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
    expect(featureQueryClient.getQueryState(DETAIL_KEY)).toBeUndefined();
    expect(featureQueryClient.getQueryState(CONVERSATION_KEY)).toBeUndefined();
    expect(calls.filter(isList).length).toBeLessThanOrEqual(2);
    expect(calls.filter(path => path === `/api/features/vocs/${ID}`)).toHaveLength(1);
  });
});
