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

import { ManagedSystemsAdminPage } from '../screens';

const SYSTEM_ID = '33333333-3333-4333-8333-333333333333';

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
          message: 'slug must match lower-kebab pattern',
          detail: { fields: [{ path: ['slug'], code: 'invalid_slug_format' }] },
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

describe('rejected slug format (#2574)', () => {
  afterEach(() => vi.restoreAllMocks());

  test('shows the server rejection on the slug field, focuses it, and keeps the dialog message empty', async () => {
    installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-register-button'));
    fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'Bad Slug!' } });
    fireEvent.change(screen.getByTestId('create-name'), { target: { value: 'New system' } });
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));

    const input = screen.getByTestId('create-slug');
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    const message = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(message).toHaveTextContent('슬러그는 영문 소문자로 시작하고 영문 소문자·숫자·하이픈(-)만 씁니다. 예: power-bi');
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.queryByTestId('create-error')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'new-system' } });
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  test('marks both required fields as text and focuses the first missing one', async () => {
    installFetch();
    renderPage();
    fireEvent.click(await screen.findByTestId('ms-register-button'));
    fireEvent.change(screen.getByTestId('create-slug'), { target: { value: 'new-system' } });
    fireEvent.submit(screen.getByTestId('create-managed-system-form'));

    const name = screen.getByTestId('create-name');
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('create-slug')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('이름').closest('label')).toHaveTextContent('필수');
  });
});
