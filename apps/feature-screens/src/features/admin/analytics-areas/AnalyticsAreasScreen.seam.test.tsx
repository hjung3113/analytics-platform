import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { AnalyticsAreasAdminPage } from './AnalyticsAreasScreen.js';

const SYSTEM_ID = '11111111-1111-4111-8111-111111111111';
const AREA_ONE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AREA_TWO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STALE_AREA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const SYSTEM = {
  id: SYSTEM_ID,
  workspace_id: 'ws',
  slug: 'tableau',
  name: 'Tableau',
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};

const AREA_ONE = {
  id: AREA_ONE_ID,
  workspace_id: 'ws',
  managed_system_id: SYSTEM_ID,
  slug: 'area-one',
  name: 'Area One',
  owner_team_id: 'team-1',
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};

const AREA_TWO = {
  ...AREA_ONE,
  id: AREA_TWO_ID,
  slug: 'area-two',
  name: 'Area Two',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch({
  requests,
  areasResponse,
}: {
  requests: string[];
  areasResponse?: () => Promise<Response> | Response;
}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    requests.push(url);
    if (url.includes('/me/permissions/check')) {
      return jsonResponse({
        state: 'approved',
        decision: { allow: true, via: 'role', requestable: null },
      });
    }
    if (url.includes('/actors/resolve')) return jsonResponse({ actors: [], teams: [] });
    if (url.includes('/managed-systems') && (!init?.method || init.method === 'GET')) {
      return jsonResponse({ items: [SYSTEM], total: 1 });
    }
    if (url.includes('/analytics-areas') && (!init?.method || init.method === 'GET')) {
      return areasResponse?.() ?? jsonResponse({ items: [AREA_ONE, AREA_TWO], total: 2 });
    }
    return jsonResponse({ message: 'not mocked' }, 500);
  }) as typeof globalThis.fetch;
}

function HostHarness({
  initialSearch,
  onNavigate,
  children,
}: {
  initialSearch: HostSearch;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  children: ReactNode;
}) {
  const [search, setSearch] = useState<HostSearch>(initialSearch);
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      if (options === undefined) onNavigate(to);
      else onNavigate(to, options);
      const url = new URL(to, 'https://platform.local');
      setSearch(Object.fromEntries(url.searchParams.entries()));
    },
    [onNavigate],
  );
  const useSearch = useCallback(() => search, [search]);
  const useNavigate = useCallback(() => navigate, [navigate]);
  const useHere = useCallback(() => '/admin/analytics-areas', []);
  const seam = useMemo<HostSeam>(
    () => ({
      canLink: () => true,
      Link: ({ children: linkChildren }) => linkChildren,
      notifyError: () => undefined,
      notifySuccess: () => undefined,
      useNavigate,
      useSearch,
      useHere,
    }),
    [useHere, useNavigate, useSearch],
  );

  return <HostSeamProvider value={seam}>{children}</HostSeamProvider>;
}

function HostDetail({ parts }: { parts: ClosableDetailParts }) {
  return (
    <aside data-testid="host-aa-detail">
      <h2 data-testid="host-aa-title">{parts.title}</h2>
      {parts.subtitle ? <p data-testid="host-aa-subtitle">{parts.subtitle}</p> : null}
      <div>{parts.headerActions}</div>
      <div data-testid="host-aa-body">{parts.body}</div>
      <button type="button" onClick={parts.requestClose}>
        호스트 닫기
      </button>
    </aside>
  );
}

function renderBridge({
  initialSearch = {},
  areasResponse,
  useHostDetail = true,
}: {
  initialSearch?: HostSearch;
  areasResponse?: () => Promise<Response> | Response;
  useHostDetail?: boolean;
} = {}) {
  const requests: string[] = [];
  const onNavigate = vi.fn();
  installFetch({ requests, ...(areasResponse ? { areasResponse } : {}) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderDetail = (parts: ClosableDetailParts) => <HostDetail parts={parts} />;
  const page = useHostDetail ? (
    <AnalyticsAreasAdminPage renderDetail={renderDetail} />
  ) : (
    <AnalyticsAreasAdminPage />
  );
  render(
    <QueryClientProvider client={client}>
      <HostHarness initialSearch={initialSearch} onNavigate={onNavigate}>
        {page}
      </HostHarness>
    </QueryClientProvider>,
  );
  return { onNavigate, requests };
}

describe('Analytics Areas host seam', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('selects through the host URL and renders detail parts for only the selected area', async () => {
    const { onNavigate, requests } = renderBridge({
      initialSearch: { managedSystem: SYSTEM_ID, includeArchived: 'true', context: 'keep-me' },
    });

    await waitFor(() => expect(screen.getByTestId('aa-row-area-one')).toBeInTheDocument());
    expect(requests.some((url) => url.includes('include_archived=true'))).toBe(true);
    fireEvent.click(screen.getByTestId('aa-detail-area-one'));

    const detail = await screen.findByTestId('host-aa-detail');
    expect(onNavigate).toHaveBeenCalledWith(
      `/admin/analytics-areas?context=keep-me&managedSystem=${SYSTEM_ID}&includeArchived=true&selected=${AREA_ONE_ID}`,
    );
    expect(screen.getByTestId('host-aa-title')).toHaveTextContent('Area One');
    expect(screen.getByTestId('host-aa-subtitle')).toHaveTextContent('area-one');
    expect(within(detail).getByRole('button', { name: 'Area One 수정' })).toBeInTheDocument();
    const body = within(detail).getByTestId('host-aa-body');
    expect(within(body).getByRole('heading', { name: 'Area One' })).toBeInTheDocument();
    expect(within(body).queryByText('Area Two')).not.toBeInTheDocument();
    for (const section of ['overview', 'definition', 'workload', 'findings', 'used-by']) {
      expect(body.querySelector(`[data-anchor="${section}"]`)).toBeInTheDocument();
    }
  });

  test('host close clears selection, keeps filters, and restores focus to the row trigger', async () => {
    const { onNavigate } = renderBridge({
      initialSearch: {
        managedSystem: SYSTEM_ID,
        includeArchived: 'true',
        selected: AREA_ONE_ID,
        context: 'keep-me',
      },
    });
    const trigger = await screen.findByTestId('aa-detail-area-one');
    await screen.findByTestId('host-aa-detail');

    fireEvent.click(screen.getByRole('button', { name: '호스트 닫기' }));

    await waitFor(() => expect(screen.queryByTestId('host-aa-detail')).not.toBeInTheDocument());
    expect(onNavigate).toHaveBeenCalledWith(
      `/admin/analytics-areas?context=keep-me&managedSystem=${SYSTEM_ID}&includeArchived=true`,
    );
    expect(trigger).toHaveFocus();
  });

  test('replace-drops a stale selection only after the list read succeeds', async () => {
    let resolveAreas!: (response: Response) => void;
    const pendingAreas = new Promise<Response>((resolve) => {
      resolveAreas = resolve;
    });
    const { onNavigate, requests } = renderBridge({
      initialSearch: { selected: STALE_AREA_ID, context: 'keep-me' },
      areasResponse: () => pendingAreas,
    });

    await waitFor(() =>
      expect(requests.some((url) => url.includes('/analytics-areas'))).toBe(true),
    );
    expect(onNavigate).not.toHaveBeenCalled();
    resolveAreas(jsonResponse({ items: [AREA_ONE, AREA_TWO], total: 2 }));
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith('/admin/analytics-areas?context=keep-me', {
        replace: true,
      }),
    );
  });

  test('keeps a stale selection when the list read fails', async () => {
    const { onNavigate } = renderBridge({
      initialSearch: { selected: STALE_AREA_ID },
      areasResponse: () => jsonResponse({ message: 'unavailable' }, 503),
    });

    expect(await screen.findByTestId('aa-list-error')).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  test('closes the host detail before opening the edit dialog', async () => {
    const { onNavigate } = renderBridge({ initialSearch: { selected: AREA_ONE_ID } });
    await screen.findByTestId('host-aa-detail');

    fireEvent.click(screen.getByTestId('aa-edit-button'));

    expect(await screen.findByTestId('aa-edit-dialog')).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith('/admin/analytics-areas');
  });

  test('clears owned filters and selection while preserving unrelated host search keys', async () => {
    const { onNavigate } = renderBridge({
      initialSearch: {
        managedSystem: '22222222-2222-4222-8222-222222222222',
        includeArchived: 'true',
        selected: AREA_ONE_ID,
        context: 'keep-me',
      },
    });
    await screen.findByTestId('aa-filter-empty-state');

    fireEvent.click(screen.getByTestId('aa-clear-filters'));

    expect(onNavigate).toHaveBeenCalledWith('/admin/analytics-areas?context=keep-me');
  });

  test('explicitly clears includeArchived while preserving unrelated host search keys', async () => {
    const { onNavigate } = renderBridge({
      initialSearch: { includeArchived: 'true', context: 'keep-me' },
    });

    fireEvent.click(await screen.findByTestId('aa-filter-button'));
    fireEvent.click(await screen.findByTestId('aa-filter-include-archived'));

    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith('/admin/analytics-areas?context=keep-me'),
    );
  });

  test('writes the Managed System filter through the host URL and preserves unrelated keys', async () => {
    const { onNavigate } = renderBridge({ initialSearch: { context: 'keep-me' } });

    fireEvent.click(await screen.findByTestId('aa-filter-button'));
    fireEvent.click(screen.getByTestId('aa-filter-managed-system'));
    fireEvent.click(await screen.findByRole('option', { name: 'Tableau' }));

    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith(
        `/admin/analytics-areas?context=keep-me&managedSystem=${SYSTEM_ID}`,
      ),
    );
  });

  test('keeps the standalone Sheet when the host does not render detail parts', async () => {
    renderBridge({
      initialSearch: { selected: AREA_ONE_ID },
      useHostDetail: false,
    });

    expect(await screen.findByTestId('aa-slide-over')).toBeInTheDocument();
    expect(screen.queryByTestId('host-aa-detail')).not.toBeInTheDocument();
  });
});
