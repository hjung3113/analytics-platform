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
  return render(
    <QueryClientProvider client={client}>
      {hosted ? (
        <HeadTargetHost base={seam}><Page /></HeadTargetHost>
      ) : (
        <HostSeamProvider value={seam}><Page /></HostSeamProvider>
      )}
    </QueryClientProvider>,
  );
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
  });

  it.each(CASES)('%s stays in the screen header without a host target', async (_label, page, testId) => {
    installFetch('approved');
    mount(page, false);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
  });

  it.each(CASES)('%s is absent from the head for a user without workspace.admin', async (_label, page, testId) => {
    installFetch('blocked_non_requestable');
    mount(page, true);
    // Observable signal instead of a sleep: the capability check was asked, its answer was consumed and the resulting updates flushed.
    const fetchMock = vi.mocked(globalThis.fetch);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/me/permissions/check'))).toBe(true));
    await act(async () => { await Promise.all(fetchMock.mock.results.map((result) => result.value)); });
    await act(async () => {});
    expect(screen.queryByTestId(testId)).toBeNull();
    expect(within(screen.getByTestId('host-head')).queryByRole('button')).toBeNull();
  });
});
