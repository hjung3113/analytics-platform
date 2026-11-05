// #1291 B2 — the registry screens draw their one create/register button in the host head (not in the screen's own header actions) and keep it gated.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { HeadTargetHost } from '@/test/primary-action-host';
import { AnalyticsAreasAdminPage } from './analytics-areas/AnalyticsAreasScreen';
import { ManagedSystemsAdminPage } from './managed-systems/ManagedSystemsScreen';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function installFetch(state: 'approved' | 'blocked_non_requestable') {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/me/permissions/check')) {
      return json({
        state,
        decision: { allow: state === 'approved', ...(state === 'approved' ? { via: 'role' } : { reason: 'no_grant' }), requestable: null },
      });
    }
    if (url.includes('/actors/resolve')) return json({ actors: [], teams: [] });
    if (url.endsWith('/permissions/requests')) return json({ requests: [], count: 0 });
    if (url.includes('/default-diagnostics')) return json({ items: [] });
    if (url.includes('/default-candidates')) return json({ owners: [], reviewers: [] });
    if (url.includes('/managed-systems') || url.includes('/analytics-areas')) return json({ items: [], total: 0 });
    return json({});
  }) as typeof globalThis.fetch;
}

const seam: HostSeam = {
  canLink: () => true,
  Link: ({ children }) => children,
  notifyError: () => undefined,
  notifySuccess: () => undefined,
  useNavigate: () => () => undefined,
  useSearch: () => ({}),
  useHere: () => '/admin',
  hostOwnsTitle: true,
};

function mount(page: 'ms' | 'aa', hosted: boolean) {
  const Page = page === 'ms' ? ManagedSystemsAdminPage : AnalyticsAreasAdminPage;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      {hosted ? (
        <HeadTargetHost base={seam}><Page /></HeadTargetHost>
      ) : (
        <HostSeamProvider value={seam}><Page /></HostSeamProvider>
      )}
    </QueryClientProvider>,
  );
  return { ...view, client };
}

const CASES = [
  ['시스템 등록', 'ms', 'ms-register-button'],
  ['분석 영역 생성', 'aa', 'aa-new-area-button'],
] as const;

describe('admin registry screens — primary action placement (#1291 B2)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  it.each(CASES)('%s is in the host head and once', async (_label, page, testId) => {
    installFetch('approved');
    mount(page, true);
    const button = await screen.findByTestId(testId);
    expect(within(screen.getByTestId('host-head')).getByTestId(testId)).toBe(button);
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
    const filter = await screen.findByTestId(`${page}-filter-button`);
    const heading = screen.getByRole('heading', { name: page === 'ms' ? '레지스트리' : '카탈로그' });
    expect(heading.parentElement).toContainElement(filter);
    expect(filter.closest('[data-shell="page"]')?.querySelector('header')).toBeNull();
    expect(filter.closest('.px-8')).not.toBeNull();
  });

  it.each(CASES)('%s stays reachable once without a host target', async (_label, page, testId) => {
    installFetch('approved');
    mount(page, false);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
  });

  it.each(CASES)('%s is absent from the head for a user without workspace.admin', async (_label, page, testId) => {
    installFetch('blocked_non_requestable');
    const { client } = mount(page, true);
    // Observable signal instead of a sleep: the capability check was asked, its query completed (body read and parsed) and the observer update rendered.
    const fetchMock = vi.mocked(globalThis.fetch);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/me/permissions/check'))).toBe(true));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });
    await act(async () => {});
    expect(screen.queryByTestId(testId)).toBeNull();
    expect(within(screen.getByTestId('host-head')).queryByRole('button')).toBeNull();
  });
});
