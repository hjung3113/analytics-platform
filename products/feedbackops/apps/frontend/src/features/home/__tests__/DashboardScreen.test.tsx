// D1–D3 — the bridge-safe dashboard body and its refresh. fetch is mocked directly (house style) with the bridge's `/api/fo` base path.

import { configureApiClient } from '@/lib/api/client';
import { COVERAGE_METRIC_IDS } from '@/lib/copy/coverage';
import { HOME_COPY, HOME_QUEUE_COPY } from '@/lib/copy/home';
import { type HostLinkProps, type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { dashboardSummarySchema } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardScreen, HOME_COVERAGE_HREF, refreshDashboard } from '../DashboardScreen';

const summary = dashboardSummarySchema.parse({
  computed_at: '2026-10-24T00:00:00.000Z',
  kpis: { open_voc: 1 },
  action_queues: [
    {
      id: 'actionable-finding-no-execution',
      severity: 'warn',
      count: 2,
      next_action: { label: 'Request', route: '/findings', intent: 'request' },
      secondary_action: null,
    },
    {
      id: 'unassigned-voc',
      severity: 'urgent',
      count: 0,
      next_action: { label: 'Review', route: '/vocs?view=triage', intent: 'review' },
      secondary_action: null,
    },
  ],
  coverage: [{ id: COVERAGE_METRIC_IDS[0], value: 1, total: 4, percent: 25, status: 'bad' }],
  by_managed_system: [],
});
const me = {
  actor: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    external_id: 'e1',
    email: 'a@b.c',
    display_name: '지원',
    role_level: 'developer',
  },
  workspace_id: 'ws',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function installFetch(overrides: Record<string, unknown> = {}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://x').pathname;
    const body: Record<string, unknown> = {
      '/api/fo/me': me,
      '/api/fo/dashboard/summary': summary,
      '/api/fo/tasks': { items: [], page: { has_more: false } },
      '/api/fo/task-requests': { items: [], page: { has_more: false } },
      '/api/fo/permission-requests/mine': { requests: [] },
      '/api/fo/me/answerable-surveys': { items: [], page: { has_more: false } },
      ...overrides,
    };
    return path in body ? json(body[path]) : new Response('not mocked', { status: 500 });
  }) as typeof fetch;
}

function mount(canLink: HostSeam['canLink'] = () => true, managedSystemId?: string) {
  const seam = {
    canLink,
    Link: ({ to, children, className }: HostLinkProps) =>
      canLink(to) ? (
        <a href={to} className={className}>
          {children}
        </a>
      ) : (
        <span className={className}>{children}</span>
      ),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  } satisfies HostSeam;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HostSeamProvider value={seam}>
        <DashboardScreen {...(managedSystemId !== undefined ? { managedSystemId } : {})} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  configureApiClient({ basePath: '/api/fo' });
  installFetch();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('DashboardScreen', () => {
  it('D1 renders the queue, work, coverage and open-request sections without the standalone head, tabs or recovery queue', async () => {
    mount();
    expect(await screen.findByTestId('home-action-queues')).toBeTruthy();
    expect(await screen.findByTestId('home-coverage')).toBeTruthy();
    expect(screen.getByTestId('home-my-work')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '내게 배정됨' })).toBeTruthy();
    expect(screen.getByTestId('home-queue-actionable-finding-no-execution')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: HOME_COPY.refresh })).toBeNull();
    expect(screen.queryByRole('link', { name: HOME_COPY.newVoc })).toBeNull();
    expect(screen.queryByTestId('recovery-queue')).toBeNull();
  });

  it('D3 renders operator links through the seam: linked where canLink, plain text where not', async () => {
    installFetch({
      '/api/fo/tasks': {
        items: [{ id: 't1', display_id: 'T-1', title: '복구', status: 'in_progress' }],
        page: { has_more: false },
      },
    });
    const view = mount(
      (to) => !to.startsWith('/findings') && !to.startsWith('/tasks') && to !== HOME_COVERAGE_HREF,
    );
    const queue = await screen.findByTestId('home-queue-actionable-finding-no-execution');
    expect(within(queue).queryByRole('link')).toBeNull();
    // UX-3: an inert row or heading action carries no arrow.
    const row = await screen.findByText(/T-1/);
    expect(row.closest('[class*="min-h-row-default"]')?.querySelector('svg')).toBeNull();
    expect(screen.getByText(HOME_COPY.viewCoverage).querySelector('svg')).toBeNull();
    // F3: an unavailable destination is inert text, not a primary-button-shaped span with hover.
    expect(queue.querySelector('[class*="bg-accent-primary"], [class*="hover:"]')).toBeNull();
    expect(
      within(queue).getByText(HOME_QUEUE_COPY['actionable-finding-no-execution'].primaryAction),
    ).toBeTruthy();
    expect(
      within(await screen.findByTestId('home-zero-queues'))
        .getByRole('link')
        .getAttribute('href'),
    ).toBe('/vocs?view=triage');
    view.unmount();
    mount();
    const linked = await screen.findByTestId('home-queue-actionable-finding-no-execution');
    expect(
      within(linked)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toContain('/findings');
  });
});

describe('DashboardScreen scope status', () => {
  const empty = { ...summary, action_queues: [], coverage: [] };

  it('D4 says why the queue and coverage are hidden when only personal work shows', async () => {
    installFetch({ '/api/fo/dashboard/summary': empty });
    mount();
    expect((await screen.findByTestId('home-scope-status')).textContent).toBe(
      HOME_COPY.subtitle([], []),
    );
    expect(screen.getByTestId('home-scope-status').textContent).toContain(
      'Managed System 담당 범위',
    );
  });

  it('D4 stays silent when there is a queue or coverage', async () => {
    mount();
    await screen.findByTestId('home-action-queues');
    expect(screen.queryByTestId('home-scope-status')).toBeNull();
  });
});

describe('refreshDashboard', () => {
  it.each([[undefined], ['ms-1']])(
    'D2 invalidates only the dashboard summary key (scope %s)',
    (id) => {
      const client = new QueryClient();
      const spy = vi.spyOn(client, 'invalidateQueries');
      refreshDashboard(client, id);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ queryKey: ['dashboard-summary', id] });
    },
  );
});
