import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ManagedSystemsAdminPage } from '@/test/admin-host/screens';

const SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
const RESERVED_MESSAGE = '플랫폼이 자동으로 관리하는 키(platform, space:…)는 직접 지정하거나 바꿀 수 없습니다.';

const system = {
  id: SYSTEM_ID,
  workspace_id: '55555555-5555-4555-8555-555555555555',
  slug: 'mars',
  name: 'MARS',
  external_key: 'space:mars',
  default_owner_actor_id: null,
  default_owner_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function installFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (method === 'POST' || method === 'PATCH') {
      return json(
        {
          code: 'validation.failed',
          message: 'external_key is reserved for registry-owned systems',
          detail: { fields: [{ path: ['external_key'], code: 'reserved_external_key' }] },
        },
        422,
      );
    }
    if (url.pathname === '/me/permissions/check') return json({ state: 'approved', decision: { allow: true } });
    if (url.pathname === '/managed-systems/default-diagnostics') return json({ items: [] });
    if (url.pathname === '/managed-systems') return json({ items: [system], total: 1 });
    if (url.pathname === '/analytics-areas') return json({ items: [], total: 0 });
    if (url.pathname === '/permissions/requests') return json({ requests: [], count: 0 });
    if (url.pathname === '/managed-systems/default-candidates') return json({ owners: [], reviewers: [] });
    if (url.pathname === '/actors') return json({ actors: [] });
    if (url.pathname === '/actors/resolve') return json({ actors: [], teams: [] });
    throw new Error(`Unhandled request: ${method} ${url.pathname}`);
  });
}

function renderPage() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/admin/managed-systems',
    component: ManagedSystemsAdminPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/admin/managed-systems'] }),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('reserved external key field error (#1289 node i)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('create dialog marks the external-key input invalid and associates the message', async () => {
    installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-register-button'));
    fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'new-system' } });
    fireEvent.change(screen.getByTestId('create-name'), { target: { value: 'New system' } });
    fireEvent.change(screen.getByTestId('create-external-key'), { target: { value: 'platform' } });
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));

    const message = await screen.findByTestId('create-external-key-error');
    expect(message).toHaveTextContent(RESERVED_MESSAGE);
    const input = screen.getByTestId('create-external-key');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(message.id);
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.change(input, { target: { value: 'tableau:site' } });
    expect(screen.queryByTestId('create-external-key-error')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  test('edit dialog shows the message on the external-key input, not as a row error', async () => {
    installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-configure-mars'));
    fireEvent.change(screen.getByTestId('external-key-input-mars'), { target: { value: '' } });
    fireEvent.submit(screen.getByTestId('edit-managed-system-form-mars'));

    const message = await screen.findByTestId('external-key-error-mars');
    expect(message).toHaveTextContent(RESERVED_MESSAGE);
    const input = screen.getByTestId('external-key-input-mars');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(message.id);
    expect(screen.queryByTestId('row-error-mars')).not.toBeInTheDocument();
  });
});
