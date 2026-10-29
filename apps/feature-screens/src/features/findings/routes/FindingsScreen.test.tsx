// FindingsScreen under a test host seam (#762 l): the screen reads and writes its URL only through the seam, has no router,
// and leaves the whole detail slot to the host's `renderDetail`.

import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
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
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
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

function installFetch(listStatus = 200, requestable = false) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/findings') {
      if (listStatus === 403) {
        return json(
          {
            code: 'permission.denied',
            message: 'denied',
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
    if (path === '/actors') return json({ actors: [] });
    return json({ code: 'not_found.record' }, 404);
  }) as typeof globalThis.fetch;
}

type Call = { href: string; options: { replace?: boolean } | undefined };
let calls: Call[] = [];
const renderDetail = vi.fn<(...args: unknown[]) => React.ReactNode>();

function record(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, 'http://feedbackops.local').searchParams);
}

function mount(initial: Record<string, string>, { hostCarriesReturn = false } = {}) {
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
    expect(await screen.findByRole('button', { name: '권한 요청하기' })).toBeInTheDocument();
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
