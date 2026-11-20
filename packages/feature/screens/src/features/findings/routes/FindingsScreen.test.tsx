// FindingsScreen under a test host seam (#762 l): the screen reads and writes its URL only through the seam, has no router,
// and leaves the whole detail slot to the host's `renderDetail`.

import { type HostSeam, HostSeamProvider } from '../../../lib/host/host-seam';
import type { FrontendPermissionState } from '../../../lib/api/permission-reads';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FindingsScreen } from './FindingsScreen';

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
vi.mock('../../../lib/cross-system/useWorkspaceActors', () => ({
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
    ...(usePermissionLinks ? { usePermissionLinks } : {}),
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
  return render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
  );
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
  });

  it('links the eligible Finding list denial to the request form and restores content after a fresh read', async () => {
    installFetch(403, true);
    const targetHref = vi.fn(() => '/company/permission-requests');
    const options = { usePermissionLinks: () => ({ permissionRequestHref: targetHref }) };
    mount({ managedSystem: MS }, options);
    const action = await screen.findByRole('link', { name: '권한 요청' });
    expect(action).toHaveAttribute('href', '/company/permission-requests');
    expect(targetHref).toHaveBeenCalledWith();
    cleanup();
    installFetch();
    mount({ managedSystem: MS }, options);
    await screen.findByText('결제 실패 반복');
    expect(screen.queryByRole('link', { name: '권한 요청' })).toBeNull();
  });

  it('keeps the domain exit and suppresses a grant CTA for a Finding role denial', async () => {
    installFetch(403, true, true);
    const permissionRequestHref = vi.fn(() => '/company/permission-requests');
    mount({ managedSystem: MS }, { usePermissionLinks: () => ({ permissionRequestHref }) });
    await waitFor(() => expect(lastDetailCall()[1]).toMatchObject({ listDenied: true }));
    expect(permissionRequestHref).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: '권한 요청' })).toBeNull();
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
    expect(Array.from(action.parentElement?.children ?? [])).toEqual([action, home]);
    expect(screen.getByText('필요한 권한')).toBeInTheDocument();
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
      expect(permissionRequestHref).toHaveBeenCalledWith();
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

  it('blocks a scoped 200-empty list when the permission cannot be requested', async () => {
    const fetchMock = installEmptyListFetch('blocked_non_requestable');
    const permissionRequestHref = vi.fn(() => '/request-target');
    mount({ managedSystem: MS }, { usePermissionLinks: () => ({ permissionRequestHref }) });

    await waitFor(() => expect(lastDetailCall()[1]).toMatchObject({ listDenied: true }));
    expect(screen.queryByText('생성된 Finding이 없습니다.')).not.toBeInTheDocument();
    expect(permissionRequestHref).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/permission-requests/mine'))).toBe(false);
  });

  it('offers only the prefixed Home exit when a scoped Finding read is explicitly denied', async () => {
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
    expect(Array.from(home.parentElement?.children ?? [])).toEqual([home]);
    expect(screen.getByText('이 항목에 접근할 수 없습니다.')).toBeInTheDocument();
    expect(await screen.findByText('Finding 조회 · 품질 시스템')).toBeInTheDocument();
    expect(screen.queryByText(/권한을 요청하세요/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '내 VOC' })).not.toBeInTheDocument();
    expect(permissionRequestHref).not.toHaveBeenCalled();
  });

  it('names an archived System instead of a missing permission: no permission box, Home only', async () => {
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
    const home = screen.getByRole('link', { name: '홈으로' });
    expect(Array.from(home.parentElement?.children ?? [])).toEqual([home]);
    expect(screen.queryByText('필요한 권한')).not.toBeInTheDocument();
    expect(screen.queryByText(/Finding 조회/)).not.toBeInTheDocument();
    expect(screen.queryByText('이 항목에 접근할 수 없습니다.')).not.toBeInTheDocument();
    expect(permissionRequestHref).not.toHaveBeenCalled();
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
