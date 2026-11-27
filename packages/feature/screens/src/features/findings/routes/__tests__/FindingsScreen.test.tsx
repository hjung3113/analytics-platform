// FindingsScreen under a test host seam (#762 l): the screen reads and writes its URL only through the seam, has no router,
// and leaves the whole detail slot to the host's `renderDetail`.

import { useAccessRequestState } from '../../../../test-support/access-request-host';
import { type HostSeam, HostSeamProvider } from '../../../../lib/host/host-seam';
import type { FrontendPermissionState } from '../../../../lib/api/permission-reads';
import { focusManager, QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FindingsScreen } from '../FindingsScreen';

const shell = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@ap/ui', async (original) => ({
  ...(await original<typeof import('@ap/ui')>()),
  ListShell: (props: Record<string, unknown> & { toolbar?: { actions?: React.ReactNode } }) => {
    shell.props.push(props);
    return (
      <div>
        {props.toolbar?.actions}
        {props.tabs as React.ReactNode}
        {props.list as React.ReactNode}
      </div>
    );
  },
}));
vi.mock('../../../../lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));

const MS = '99999999-9999-9999-9999-999999999901';
const F1_ID = '11111111-1111-4111-8111-111111111111';
const GONE_ID = '99999999-9999-4999-8999-999999999999';
const RETURN_TO = '/vocs?view=inbox';
const F1 = {
  id: F1_ID,
  workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  display_id: 'FND-101',
  primary_managed_system_id: MS,
  title: '결제 실패 반복',
  summary: '요약',
  source_type: 'voc_cluster' as const,
  source_id: '22222222-2222-2222-2222-222222222222',
  owner_actor_id: null,
  owner_team_id: null,
  evidence_count: 3,
  severity: 'high' as const,
  confidence: 'medium' as const,
  status: 'active' as const,
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: '33333333-3333-3333-3333-333333333333',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  source: null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function installFetch(listStatus = 200, requestable = false, roleRequired = false) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/findings') {
      if (listStatus === 403) {
        return json(
          {
            code: 'permission.denied',
            message: 'denied',
            ...(roleRequired ? { detail: { reason: 'role_required' } } : {}),
            ...(requestable
              ? { requestable_permission: { permission: 'finding.read', managed_system_id: MS } }
              : {}),
          },
          403,
        );
      }
      return json({ items: [F1], page: { total: 1, has_more: false } });
    }
    if (path === `/findings/${F1_ID}`) return json(F1);
    if (path === '/permission-requests/mine') return json({ requests: [] });
    if (path === '/actors') return json({ actors: [] });
    return json({ code: 'not_found.record' }, 404);
  }) as typeof globalThis.fetch;
}

function installEmptyListFetch(state: FrontendPermissionState, approvedElsewhere = false) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/findings') return json({ items: [], page: { total: 0, has_more: false } });
    if (url.pathname === '/me/permissions/check') {
      return json({ state, decision: { allow: state === 'approved' } });
    }
    if (url.pathname === '/permission-requests/mine') {
      const requests = approvedElsewhere && url.searchParams.get('status') === 'all' ? [{
        id: F1_ID,
        requested_capability: 'finding.read',
        requested_managed_system_id: GONE_ID,
        requested_object_type: null,
        requested_object_id: null,
        source_object_type: null,
        source_object_id: null,
        source_action_id: null,
        reason: 'Finding review',
        revision: 1,
        requested_expiration: null,
        return_route_intent: null,
        status: 'approved',
        created_at: F1.created_at,
        updated_at: F1.updated_at,
      }] : [];
      return json({ requests });
    }
    if (url.pathname === '/managed-systems') return json({ items: [] });
    return json({ code: 'not_found.record' }, 404);
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

type Call = { href: string; options: { replace?: boolean } | undefined };
let calls: Call[] = [];
const renderDetail = vi.fn<(...args: unknown[]) => React.ReactNode>();

function record(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, 'http://platform.local').searchParams);
}

function mount(initial: Record<string, string>, { hostCarriesReturn = false, usePermissionLinks }: {
  hostCarriesReturn?: boolean; usePermissionLinks?: NonNullable<HostSeam['usePermissionLinks']>;
} = {}) {
  let current: Record<string, string> = initial;
  let setHost: (next: Record<string, string>) => void = () => {};
  const navigate = (href: string, options?: { replace?: boolean }) => {
    calls.push({ href, options });
    setHost(record(href));
  };
  const seam: HostSeam = {
    canLink: () => true,
    Link: ({ to, children, className }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
    notifyError: () => {},
    notifySuccess: () => {},
    useNavigate: () => navigate,
    useSearch: () => React.useState(current)[0],
    ...(hostCarriesReturn ? { hostCarriesReturn: true } : {}),
    ...(usePermissionLinks ? { usePermissionLinks, useAccessRequestState } : {}),
  };
  function Host() {
    const [search, set] = React.useState(initial);
    setHost = (next) => {
      current = next;
      set(next);
    };
    const value = React.useMemo(() => ({ ...seam, useSearch: () => search }), [search]);
    return (
      <HostSeamProvider value={value}>
        <FindingsScreen renderDetail={renderDetail} />
      </HostSeamProvider>
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
  );
  return { ...view, client, setSearch: (search: Record<string, string>) => setHost(search) };
}

const lastDetailCall = () =>
  renderDetail.mock.calls.at(-1) as [string | null, Record<string, unknown>];
const detailReturnTo = () => lastDetailCall()[1].returnTo as string | null;

beforeEach(() => {
  // jsdom lacks the pointer-capture and scroll APIs Radix Select calls.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
  calls = [];
  shell.props = [];
  renderDetail.mockReset();
  renderDetail.mockReturnValue(undefined);
  installFetch();
});
afterEach(() => {
  cleanup();
});

// Every list denial card names the screen as the role card does (#2752).
function expectAllFindingsCardTitle() {
  expect(screen.getByRole('heading', { name: '전체 Finding' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Findings' })).toBeNull();
}

describe('FindingsScreen under a host seam', () => {
  it('selects and navigates nothing on mount (no auto-select), calling renderDetail with no finding', async () => {
    mount({ managedSystem: MS });
    await screen.findByText('결제 실패 반복');
    expect(calls).toEqual([]);
    expect(lastDetailCall()[0]).toBeNull();
    expect(lastDetailCall()[1]).toMatchObject({ listDenied: false });
  });

  it('pushes the row click with selected, and renderDetail follows the new selection', async () => {
    mount({ managedSystem: MS, returnTo: RETURN_TO });
    fireEvent.click(await screen.findByText('결제 실패 반복'));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toBeUndefined();
    expect(record(calls[0]?.href ?? '')).toEqual({
      managedSystem: MS,
      returnTo: RETURN_TO,
      selected: F1_ID,
    });
    await waitFor(() => expect(lastDetailCall()[0]).toBe(F1_ID));
  });

  it('commits a typed query with replace, keeping the other keys; same text is a no-op; empty drops q', async () => {
    mount({ managedSystem: MS, returnTo: RETURN_TO });
    const input = await screen.findByPlaceholderText('제목 또는 ID');
    await userEvent.type(input, '결제{Enter}');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual({ replace: true });
    expect(record(calls[0]?.href ?? '')).toEqual({
      managedSystem: MS,
      returnTo: RETURN_TO,
      q: '결제',
    });
    await userEvent.type(input, '{Enter}');
    expect(calls).toHaveLength(1);
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.options).toEqual({ replace: true });
    expect(record(calls[1]?.href ?? '')).toEqual({ managedSystem: MS, returnTo: RETURN_TO });
  });

  it('removes one filter chip with a push and keeps every other key', async () => {
    mount({ managedSystem: MS, returnTo: RETURN_TO, status: 'active', execution: 'none' });
    await userEvent.click(await screen.findByRole('button', { name: /상태.*필터 제거/ }));
    expect(calls[0]?.options).toBeUndefined();
    expect(record(calls[0]?.href ?? '')).toEqual({
      managedSystem: MS,
      returnTo: RETURN_TO,
      execution: 'none',
    });
  });

  it('resets the filter keys (a reconciling selection stays out of it) and keeps managedSystem, selected and returnTo', async () => {
    mount({
      managedSystem: MS,
      returnTo: RETURN_TO,
      selected: F1_ID,
      q: '결제',
      status: 'active',
      execution: 'none',
      'filter.analytics_area': 'unset',
    });
    await userEvent.click(await screen.findByRole('button', { name: '필터 초기화' }));
    expect(calls[0]?.options).toBeUndefined();
    expect(record(calls[0]?.href ?? '')).toEqual({
      managedSystem: MS,
      returnTo: RETURN_TO,
      selected: F1_ID,
    });
  });

  it('writes the assignment filter and drops it for 전체', async () => {
    mount({ managedSystem: MS, assignment: 'assigned' });
    await userEvent.click(await screen.findByRole('combobox', { name: '담당자 필터' }));
    await userEvent.click(await screen.findByRole('option', { name: '전체' }));
    expect(record(calls[0]?.href ?? '')).toEqual({ managedSystem: MS });
  });

  it('toggles the execution checkbox on and off', async () => {
    mount({ managedSystem: MS });
    const box = await screen.findByRole('checkbox', { name: '실행 연결 없음' });
    await userEvent.click(box);
    expect(record(calls[0]?.href ?? '')).toEqual({ managedSystem: MS, execution: 'none' });
    await userEvent.click(await screen.findByRole('checkbox', { name: '실행 연결 없음' }));
    expect(record(calls[1]?.href ?? '')).toEqual({ managedSystem: MS });
  });

  it('replace-drops a selected finding whose detail read is 404', async () => {
    mount({ managedSystem: MS, returnTo: RETURN_TO, selected: GONE_ID });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options).toEqual({ replace: true });
    expect(record(calls[0]?.href ?? '')).toEqual({ managedSystem: MS, returnTo: RETURN_TO });
  });

  it('omits detailPanel when renderDetail returns undefined, and passes a returned node as is', async () => {
    mount({ managedSystem: MS });
    await screen.findByText('결제 실패 반복');
    expect(shell.props.every((props) => !('detailPanel' in props))).toBe(true);
    cleanup();
    shell.props = [];
    renderDetail.mockReturnValue(null);
    mount({ managedSystem: MS });
    await screen.findByText('결제 실패 반복');
    expect(shell.props.at(-1)).toHaveProperty('detailPanel', null);
  });

  it('reports a denied list and shows the request-access path for a requestable permission', async () => {
    installFetch(403, true);
    mount({ managedSystem: MS });
    await waitFor(() => expect(lastDetailCall()[1]).toMatchObject({ listDenied: true }));
    expect(await screen.findByRole('button', { name: '권한 요청' })).toBeInTheDocument();
    expectAllFindingsCardTitle();
    expect(shell.props.at(-1)?.toolbar).toBeUndefined();
  });

  it.each([403, 200])('marks the open Finding out of list only after scope denial (%s)', async (status) => {
    const otherSystem = GONE_ID;
    const permission = deferredResponse();
    const list = deferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/findings') {
        if (url.searchParams.get('managed_system_id') === otherSystem) return list.promise;
        return json({ items: [F1], page: { total: 1, has_more: false } });
      }
      if (url.pathname === `/findings/${F1_ID}`) return json(F1);
      if (url.pathname === '/me/permissions/check') return permission.promise;
      if (url.pathname === '/managed-systems') return json({ items: [] });
      return json({ code: 'not_found.record' }, 404);
    });
    globalThis.fetch = fetchMock;
    const { setSearch } = mount({ managedSystem: MS, selected: F1_ID });
    await screen.findByText(F1.title);
    act(() => setSearch({ managedSystem: otherSystem, selected: F1_ID }));
    expect(lastDetailCall()[0]).toBe(F1_ID);
    expect(lastDetailCall()[1].isInList).toBeUndefined();
    if (status === 200) {
      list.resolve(json({ items: [], page: { total: 0, has_more: false } }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
        `/me/permissions/check?capability=finding.read&managed_system_id=${otherSystem}`, expect.anything(),
      ));
      expect(lastDetailCall()[1].isInList).toBeUndefined();
      permission.resolve(json({ state: 'blocked_non_requestable', decision: { allow: false } }));
    } else {
      list.resolve(json({ code: 'permission.denied' }, 403));
    }
    await waitFor(() => expect(lastDetailCall()[1]).toMatchObject({ listDenied: true, isInList: false }));
  });

  it('keeps a late Findings response in the old scope cache while the new scope stays blocked', async () => {
    const oldList = deferredResponse();
    const empty = { items: [], page: { total: 0, has_more: false } };
    const oldKey = ['findings', 'pages', { managedSystemId: MS }];
    const newKey = ['findings', 'pages', { managedSystemId: GONE_ID }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/findings') {
        return url.searchParams.get('managed_system_id') === MS ? oldList.promise : json(empty);
      }
      if (url.pathname === '/me/permissions/check') {
        return json({ state: 'blocked_non_requestable', decision: { allow: false } });
      }
      return json({ items: [] });
    });
    globalThis.fetch = fetchMock;
    const { client, setSearch } = mount({ managedSystem: MS });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`managed_system_id=${MS}`), expect.anything(),
    ));
    // Keep a second observer on A so switching the screen does not cancel the request.
    const unsubscribe = new QueryObserver(client, { queryKey: oldKey, enabled: false }).subscribe(() => {});
    try {
      act(() => setSearch({ managedSystem: GONE_ID }));
      await screen.findByText('Finding 목록을 볼 권한이 없습니다.');
      expect(screen.queryByText(F1.title)).toBeNull();
      oldList.resolve(json({ items: [F1], page: { total: 1, has_more: false } }));
      await waitFor(() => expect(client.getQueryData(oldKey)).toMatchObject({
        pages: [{ items: [expect.objectContaining({ id: F1_ID })] }],
      }));
      expect(client.getQueryData(newKey)).toMatchObject({ pages: [empty] });
      expect(screen.getByText('Finding 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
      expect(screen.queryByText(F1.title)).toBeNull();
    } finally {
      unsubscribe();
    }
  });

  it('rechecks a blocked scope on window focus, keeps the card until the answer lands, then uses the default focus refetch', async () => {
    let allow = false;
    let release: () => void = () => undefined;
    let hold = false;
    const permissionRead = vi.fn(async () => {
      if (hold) await new Promise<void>((resolve) => { release = resolve; });
      return json({ state: allow ? 'approved' : 'blocked_non_requestable', decision: { allow } });
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost');
      if (pathname === '/findings') return json({ items: [], page: { total: 0, has_more: false } });
      if (pathname === '/me/permissions/check') return permissionRead();
      return json({ items: [] });
    });
    // TanStack Query handles window focus through visibilitychange.
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    const returnToWindow = () => {
      visibility.mockReturnValue('hidden');
      window.dispatchEvent(new Event('visibilitychange'));
      visibility.mockReturnValue('visible');
      window.dispatchEvent(new Event('visibilitychange'));
    };
    try {
      const { client } = mount({ managedSystem: MS });
      await screen.findByText('Finding 목록을 볼 권한이 없습니다.');
      expect(permissionRead).toHaveBeenCalledTimes(1);
      allow = true;
      hold = true;
      await act(async () => returnToWindow());
      await waitFor(() => expect(permissionRead).toHaveBeenCalledTimes(2));
      // The recheck is in flight: the last decision (the blocked card) stays instead of a loading state.
      expect(screen.getByText('Finding 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
      hold = false;
      await act(async () => release());
      await screen.findByText('생성된 Finding이 없습니다.');
      expect(screen.queryByText('Finding 목록을 볼 권한이 없습니다.')).not.toBeInTheDocument();
      expect(permissionRead).toHaveBeenCalledTimes(2);
      await act(async () => client.invalidateQueries({
        queryKey: ['permission-check', 'finding.read', MS], refetchType: 'none',
      }));
      await act(async () => returnToWindow());
      // An allowed result keeps the client's default: a stale entry refetches on focus.
      await waitFor(() => expect(permissionRead).toHaveBeenCalledTimes(3));
      expect(screen.queryByText('Finding 목록을 볼 권한이 없습니다.')).not.toBeInTheDocument();
    } finally {
      visibility.mockRestore();
      focusManager.setFocused(undefined);
    }
  });

  it.each([false, true])('hands off focus on a refreshed denial only while the request owns it (blurred: %s)', async blurred => {
    installEmptyListFetch('request_access');
    const originalFetch = fetch;
    const history = deferredResponse();
    let requestable = true;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost');
      if (pathname === '/permission-requests/mine') return history.promise;
      if (pathname === '/me/permissions/check' && !requestable) {
        return json({ state: 'blocked_non_requestable', decision: { allow: false } });
      }
      return originalFetch(input);
    });
    const { client } = mount({ managedSystem: MS }, { usePermissionLinks: () => ({
      permissionRequestHref: () => '/request-target', permissionHomeHref: '/company/',
    }) });
    const busy = await screen.findByRole('button', { name: '권한 요청' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    busy.focus();
    if (blurred) {
      busy.blur();
      await act(async () => {});
    }
    requestable = false;
    await act(async () => client.refetchQueries({ queryKey: ['permission-check', 'finding.read', MS] }));
    await waitFor(() => expect(busy).not.toBeInTheDocument());
    expect(blurred ? document.body : screen.getByRole('link', { name: '홈으로' })).toHaveFocus();
    history.resolve(json({ requests: [] }));
  });

  it('links the eligible Finding list denial to the request form and restores content after a fresh read', async () => {
    installFetch(403, true);
    const targetHref = vi.fn(() => '/company/permission-requests');
    const options = { usePermissionLinks: () => ({ permissionRequestHref: targetHref }) };
    mount({ managedSystem: MS }, options);
    const action = await screen.findByRole('link', { name: '권한 요청' });
    expect(action).toHaveAttribute('href', '/company/permission-requests');
    expect(targetHref).toHaveBeenCalledWith({ capability: 'finding.read', managedSystemId: MS });
    cleanup();
    installFetch();
    mount({ managedSystem: MS }, options);
    await screen.findByText('결제 실패 반복');
    expect(screen.queryByRole('link', { name: '권한 요청' })).toBeNull();
    expect(shell.props.at(-1)?.toolbar).toMatchObject({ title: 'Findings' });
  });

  it.each(['next page', 'first-page refetch'] as const)(
    'hides the cached list after a permission denial on the %s and restores it on refetch',
    async (deniedRead) => {
      const cursor = 'next-page';
      let deny = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname !== '/findings') return json({ code: 'not_found.record' }, 404);
        if (deny) return json({ code: 'permission.denied', detail: { reason: 'role_required' } }, 403);
        return json({ items: [F1], page: { total: 2, has_more: true, cursor } });
      });
      globalThis.fetch = fetchMock as typeof globalThis.fetch;
      const { client } = mount({ managedSystem: MS });
      const refetch = () => client.refetchQueries({ queryKey: ['findings', 'pages'] });
      await screen.findByText('결제 실패 반복');
      const loadMore = screen.getByRole('button', { name: '더 불러오기' });
      expect(shell.props.at(-1)?.toolbar).toMatchObject({ title: 'Findings' });

      deny = true;
      if (deniedRead === 'next page') {
        await userEvent.click(loadMore);
      } else {
        await act(refetch);
      }
      const requestUrl = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
      expect(requestUrl.searchParams.get('cursor')).toBe(deniedRead === 'next page' ? cursor : null);
      expect(await screen.findByRole('heading', { name: '전체 Finding' })).toBeInTheDocument();
      expect(screen.queryByText('결제 실패 반복')).not.toBeInTheDocument();
      expect(shell.props.at(-1)?.toolbar).toBeUndefined();
      expect(screen.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();

      deny = false;
      await act(refetch);
      expect(await screen.findByText('결제 실패 반복')).toBeInTheDocument();
      expect(shell.props.at(-1)?.toolbar).toMatchObject({ title: 'Findings' });
      expect(screen.getByRole('button', { name: '더 불러오기' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '전체 Finding' })).not.toBeInTheDocument();
    },
  );

  it('keeps the list and retries the cursor after a non-permission next-page error', async () => {
    const cursor = 'next-page';
    let fail = true;
    const nextFinding = { ...F1, id: GONE_ID, display_id: 'FND-102', title: '두 번째 Finding' };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/findings') return json({ code: 'not_found.record' }, 404);
      if (url.searchParams.get('cursor') !== cursor) {
        return json({ items: [F1], page: { total: 2, has_more: true, cursor } });
      }
      return fail
        ? json({ code: 'internal.unexpected' }, 500)
        : json({ items: [nextFinding], page: { total: 2, has_more: false } });
    }) as typeof globalThis.fetch;
    mount({ managedSystem: MS });
    await userEvent.click(await screen.findByRole('button', { name: '더 불러오기' }));
    const retry = await screen.findByRole('button', { name: '다시 시도' }, { timeout: 5000 });
    expect(screen.getByText('결제 실패 반복')).toBeInTheDocument();
    expect(shell.props.at(-1)?.toolbar).toMatchObject({ title: 'Findings' });
    expect(screen.queryByTestId('finding-list-error')).not.toBeInTheDocument();

    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByText('두 번째 Finding')).toBeInTheDocument();
    expect(screen.getByText('결제 실패 반복')).toBeInTheDocument();
  });

  it('keeps the domain exit and suppresses a grant CTA for a Finding role denial', async () => {
    installFetch(403, true, true);
    const permissionRequestHref = vi.fn(() => '/company/permission-requests');
    mount({ managedSystem: MS }, { usePermissionLinks: () => ({ permissionRequestHref }) });
    await waitFor(() => expect(lastDetailCall()[1]).toMatchObject({ listDenied: true }));
    const title = await screen.findByRole('heading', { name: '전체 Finding' });
    expect(screen.getByRole('heading', { name: '전체 Finding', level: 2 })).toBe(title);
    const card = title.closest<HTMLElement>('[data-state="blocked_not_requestable"]');
    if (!card) throw new Error('Missing Finding denial card');
    expect(within(card).getByText('Finding 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
    expect(within(card).getByText('Developer 이상 역할이 필요합니다.')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: '내 VOC' })).toHaveAttribute('href', '/vocs?view=my');
    expect(permissionRequestHref).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: '권한 요청' })).toBeNull();
    expect(shell.props.at(-1)?.toolbar).toBeUndefined();
  });

  it.each([
    { state: 'request_access', approvedElsewhere: false, label: '권한 요청', status: null },
    { state: 'pending_request', approvedElsewhere: false, label: '내 권한 요청 보기', status: null },
    { state: 'request_access', approvedElsewhere: true, label: '남은 권한 요청', status: /승인됨/ },
  ] as const)('shows $label for a scoped 200-empty list', async ({ state, approvedElsewhere, label, status }) => {
    const fetchMock = installEmptyListFetch(state, approvedElsewhere);
    const permissionRequestHref = vi.fn(() => '/company/permission-requests');
    mount({ managedSystem: MS }, { usePermissionLinks: () => ({ permissionRequestHref, permissionHomeHref: '/company/' }) });

    const action = await screen.findByRole('link', { name: label });
    const home = screen.getByRole('link', { name: '홈으로' });
    expect(action).toHaveAttribute('href', '/company/permission-requests');
    expect(action).toHaveClass(state === 'pending_request' ? 'bg-surface-raised' : 'bg-accent-primary');
    expect(home).toHaveClass('bg-surface-raised');
    expect(home).toHaveAttribute('href', '/company/');
    expect(Array.from(action.parentElement?.children ?? [])).toEqual([action, home, screen.getByRole('link', { name: '내 VOC' })]);
    expect(screen.getByText('필요한 권한')).toBeInTheDocument();
    expectAllFindingsCardTitle();
    if (status) expect(screen.getByText(status)).toBeInTheDocument();
    // The menu's reason says only what cannot be seen; asking for access is the shared first line and the action.
    expect(screen.getByText('Finding 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/관리자에게 권한을 요청하세요/)).not.toBeInTheDocument();
    if (state === 'pending_request') {
      expect(screen.queryByText(/검토 중/)).not.toBeInTheDocument();
      expect(screen.getByText('보낸 권한 요청을 검토하고 있습니다.')).toBeInTheDocument();
      expect(screen.queryByText(/권한을 요청하세요|권한 요청이 필요합니다/)).not.toBeInTheDocument();
    }
    if (state !== 'pending_request') {
      expect(permissionRequestHref).toHaveBeenCalledWith({ capability: 'finding.read', managedSystemId: MS });
    }
    expect(lastDetailCall()[1]).toMatchObject({ listDenied: true });
    expect(screen.queryByText('생성된 Finding이 없습니다.')).not.toBeInTheDocument();
    const reads = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost'));
    expect(reads.filter(url => url.pathname === '/me/permissions/check').map(url => Object.fromEntries(url.searchParams))).toEqual([
      { capability: 'finding.read', managed_system_id: MS },
    ]);
    expect(reads.filter(url => url.pathname === '/permission-requests/mine').map(url => url.searchParams.get('status'))).toEqual(
      state === 'pending_request' ? [] : ['all'],
    );
  });

  it('holds the scoped empty Finding request during a recheck', async () => {
    const initialFetch = installEmptyListFetch('request_access');
    const recheck = deferredResponse();
    const check = vi.fn(() => recheck.promise);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) =>
      new URL(String(input), 'http://localhost').pathname === '/me/permissions/check' ? check() : initialFetch(input));
    check.mockImplementationOnce(async () => json({ state: 'request_access', decision: { allow: false } }));
    const { client } = mount({ managedSystem: MS }, { usePermissionLinks: () => ({
      permissionRequestHref: () => '/request-target', permissionHomeHref: '/',
    }) });
    const request = await screen.findByRole('link', { name: '권한 요청' });
    request.focus();
    await act(async () => { void client.invalidateQueries({ queryKey: ['permission-check', 'finding.read', MS] }); });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('link', { name: '권한 요청' })).toBeNull();
    expect(screen.getByText('확인 중')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    recheck.resolve(json({ state: 'blocked_non_requestable', decision: { allow: false, reason: 'explicit_deny' } }));
    await waitFor(() => expect(screen.queryByText('확인 중')).toBeNull());
    expect(screen.getByText('Finding 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '권한 요청' })).toBeNull();
  });

  it('blocks a scoped 200-empty list when the permission cannot be requested', async () => {
    const fetchMock = installEmptyListFetch('blocked_non_requestable');
    const permissionRequestHref = vi.fn(() => '/request-target');
    mount({ managedSystem: MS }, { usePermissionLinks: () => ({ permissionRequestHref }) });

    await waitFor(() => expect(lastDetailCall()[1]).toMatchObject({ listDenied: true }));
    expect(screen.queryByText('생성된 Finding이 없습니다.')).not.toBeInTheDocument();
    expect(permissionRequestHref).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/permission-requests/mine'))).toBe(false);
  });

  it('offers the prefixed Home and 내 VOC exits when a scoped Finding read is explicitly denied', async () => {
    const originalFetch = installEmptyListFetch('blocked_non_requestable');
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost');
      if (pathname === '/me/permissions/check') {
        return json({ state: 'blocked_non_requestable', decision: { allow: false, reason: 'explicit_deny', requestable: null } });
      }
      if (pathname === '/managed-systems') {
        return json({ items: [{ id: MS, name: '품질 시스템' }], total: 1 });
      }
      return originalFetch(input);
    });
    const permissionRequestHref = vi.fn(() => '/request-target');
    mount({ managedSystem: MS }, { usePermissionLinks: () => ({
      permissionRequestHref, permissionHomeHref: '/company/',
    }) });

    const home = await screen.findByRole('link', { name: '홈으로' });
    expect(home).toHaveAttribute('href', '/company/');
    expect(home).toHaveClass('bg-surface-raised');
    expect(Array.from(home.parentElement?.children ?? [])).toEqual([home, screen.getByRole('link', { name: '내 VOC' })]);
    expect(screen.getByText('Finding 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
    expect(await screen.findByText('Finding 조회 · 품질 시스템')).toBeInTheDocument();
    expectAllFindingsCardTitle();
    expect(screen.queryByText(/권한을 요청하세요/)).not.toBeInTheDocument();
    expect(permissionRequestHref).not.toHaveBeenCalled();
    expect(shell.props.at(-1)?.toolbar).toBeUndefined();
  });

  it('names an archived System and keeps both exits without the permission box', async () => {
    const originalFetch = installEmptyListFetch('blocked_non_requestable');
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost');
      if (pathname === '/managed-systems') {
        return json({ items: [{ id: MS, name: '보관 시스템', archived_at: '2026-01-01T00:00:00Z' }], total: 1 });
      }
      return originalFetch(input);
    });
    const permissionRequestHref = vi.fn(() => '/request-target');
    mount({ managedSystem: MS }, { usePermissionLinks: () => ({
      permissionRequestHref, permissionHomeHref: '/company/',
    }) });

    expect(await screen.findByText('보관된 시스템이라 볼 수 없습니다.')).toBeInTheDocument();
    expectAllFindingsCardTitle();
    const home = screen.getByRole('link', { name: '홈으로' });
    expect(Array.from(home.parentElement?.children ?? [])).toEqual([home, screen.getByRole('link', { name: '내 VOC' })]);
    expect(screen.queryByText('필요한 권한')).not.toBeInTheDocument();
    expect(screen.queryByText(/Finding 조회/)).not.toBeInTheDocument();
    expect(screen.queryByText('Finding 목록을 볼 권한이 없습니다.')).not.toBeInTheDocument();
    expect(permissionRequestHref).not.toHaveBeenCalled();
    expect(shell.props.at(-1)?.toolbar).toBeUndefined();
  });

  it('keeps the genuine empty state for an approved system', async () => {
    const fetchMock = installEmptyListFetch('approved');
    mount({ managedSystem: MS });

    expect(await screen.findByText('생성된 Finding이 없습니다.')).toBeInTheDocument();
    expect(lastDetailCall()[1]).toMatchObject({ listDenied: false });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/me/permissions/check'))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/permission-requests/mine'))).toBe(false);
  });

  it('hands renderDetail the stored returnTo, and null without it, for an unsafe one, or when the host carries the return', async () => {
    mount({ managedSystem: MS, selected: F1_ID, returnTo: RETURN_TO });
    await waitFor(() => expect(detailReturnTo()).toBe(RETURN_TO));
    cleanup();

    mount({ managedSystem: MS, selected: F1_ID });
    await screen.findByText('결제 실패 반복');
    expect(detailReturnTo()).toBeNull();
    cleanup();

    mount({ managedSystem: MS, selected: F1_ID, returnTo: 'https://evil.example/x' });
    await screen.findByText('결제 실패 반복');
    expect(detailReturnTo()).toBeNull();
    cleanup();

    mount({ managedSystem: MS, selected: F1_ID, returnTo: RETURN_TO }, { hostCarriesReturn: true });
    await screen.findByText('결제 실패 반복');
    expect(detailReturnTo()).toBeNull();
  });
  it('retries the current list query after the query text changed, with the same pagination and no extra reads', async () => {
    let healed = false;
    const listUrls: URL[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/findings') {
        listUrls.push(url);
        return healed
          ? json({ items: [F1], page: { total: 1, has_more: false } })
          : json({ code: 'internal.unexpected', message: 'boom' }, 500);
      }
      if (url.pathname === '/actors') return json({ actors: [] });
      return json({ code: 'not_found.record' }, 404);
    }) as typeof globalThis.fetch;
    mount({ managedSystem: MS });
    // The list hook retries a failed read once after about a second.
    const retryButton = { timeout: 5000 };
    await screen.findByRole('button', { name: '다시 시도' }, retryButton);
    await userEvent.type(await screen.findByPlaceholderText('제목 또는 ID'), '결제{Enter}');
    await waitFor(() => expect(listUrls.at(-1)?.searchParams.get('q')).toBe('결제'), retryButton);
    await screen.findByRole('button', { name: '다시 시도' }, retryButton);
    const failedReads = listUrls.length;
    const failed = listUrls.at(-1);

    healed = true;
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('결제 실패 반복')).toBeInTheDocument();

    expect(listUrls).toHaveLength(failedReads + 1);
    expect(listUrls.at(-1)?.search).toBe(failed?.search);
  }, 15000);
});
