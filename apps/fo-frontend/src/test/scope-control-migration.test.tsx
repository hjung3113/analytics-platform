import { ManagedSystemScopeControl } from '@/operator-screens/scope-picker/ManagedSystemScopeControl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
const MS_ONE = '11111111-1111-4111-8111-111111111111';
const MS_TWO = '22222222-2222-4222-8222-222222222222';
const MS_THREE = '33333333-3333-4333-8333-333333333333';
function ScopeControlHost({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <>
      <ManagedSystemScopeControl disabled={disabled} onChange={() => undefined} />
      {children}
    </>
  );
}
it('#518 disables the scope selector on a route that does not support Managed System scope', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/me')
      return json({
        actor: {
          id: 'actor',
          external_id: 'actor',
          email: 'actor@test',
          display_name: 'Actor',
          role_level: 'admin',
        },
        workspace_id: 'workspace',
      });
    if (url === '/managed-systems')
      return json({ items: [managedSystem(MS_ONE, 'Identity')], total: 1 });
    if (url === '/me/permissions/scope?capability=voc.read')
      return json({ scope: { kind: 'all' } });
    if (url.startsWith('/nav/counts')) return json({ counts: {} });
    throw new Error(`unexpected request ${url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ScopeControlHost disabled={true}>content</ScopeControlHost>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('scope-selector')).toBeInTheDocument());
    expect(screen.getByTestId('scope-selector')).toBeDisabled();
    expect(screen.getByTestId('scope-selector')).toHaveTextContent('워크스페이스 전체');
    fireEvent.click(screen.getByTestId('scope-selector'));
    expect(screen.queryByTestId('scope-option-all')).not.toBeInTheDocument();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
it('renders non-admin scope options when /me omits actor', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/me') return json({});
    if (url === '/managed-systems')
      return json({
        items: [managedSystem(MS_ONE, 'Identity'), managedSystem(MS_TWO, 'Finance')],
        total: 2,
      });
    if (url === '/nav/counts') return json({ counts: {} });
    throw new Error(`unexpected request ${url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  try {
    render(
      <QueryClientProvider client={client}>
        <ScopeControlHost disabled={false}>content</ScopeControlHost>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('scope-selector')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('scope-selector'));

    expect(screen.getByTestId('scope-name')).toHaveTextContent('전체 Managed System');
    expect(screen.getByTestId('scope-selector')).toHaveAccessibleName(
      '목록 범위, 전체 Managed System, 내 담당 범위',
    );
    expect(screen.queryByTestId('scope-union-badge')).not.toBeInTheDocument();
    expect(await screen.findByTestId(`scope-option-${MS_ONE}`)).toBeInTheDocument();
    expect(await screen.findByTestId(`scope-option-${MS_TWO}`)).toBeInTheDocument();
    // The denominator comes from the loaded system list, so this has to be
    // asserted after the options render — before that it is legitimately 0/0.
    expect(screen.getByTestId('scope-option-all')).toHaveTextContent('내 담당 0 / 2');
    expect(screen.getByTestId('scope-option-all')).toHaveTextContent('전체 Managed System');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
it('uses one scope request and dims only systems absent from the returned scope', async () => {
  const requestedUrls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === '/me')
      return json({
        actor: {
          id: 'actor',
          external_id: 'actor',
          email: 'actor@test',
          display_name: 'Actor',
          role_level: 'developer',
        },
        workspace_id: 'workspace',
      });
    if (url === '/managed-systems')
      return json({
        items: [
          managedSystem(MS_ONE, 'Identity'),
          managedSystem(MS_TWO, 'Finance'),
          managedSystem(MS_THREE, 'Sales'),
        ],
        total: 3,
      });
    if (url === '/me/permissions/scope?capability=voc.read')
      return json({ scope: { kind: 'scoped', managed_system_ids: [MS_TWO] } });
    if (url === '/nav/counts') return json({ counts: {} });
    if (url === '/saved-views?surface=voc') return json({ items: [] });
    throw new Error(`unexpected request ${url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ScopeControlHost disabled={false}>content</ScopeControlHost>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        requestedUrls.filter((url) => url === '/me/permissions/scope?capability=voc.read'),
      ).toHaveLength(1),
    );
    // #612 adds one workspace.admin check for the Admin navigation; the scope selector
    // itself still makes no per-system permission checks.
    expect(
      requestedUrls.filter(
        (url) =>
          url.startsWith('/me/permissions/check') && !url.includes('capability=workspace.admin'),
      ),
    ).toHaveLength(0);
    expect(
      requestedUrls.filter((u) => u === '/me/permissions/check?capability=workspace.admin'),
    ).toHaveLength(0);
    fireEvent.click(screen.getByTestId('scope-selector'));
    expect(await screen.findAllByLabelText('범위 밖')).toHaveLength(2);
    expect(
      screen.getByTestId(`scope-option-${MS_TWO}`).querySelector('[aria-label="범위 밖"]'),
    ).toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
it('does not dim any system when the returned scope is all', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/me')
      return json({
        actor: {
          id: 'actor',
          external_id: 'actor',
          email: 'actor@test',
          display_name: 'Actor',
          role_level: 'developer',
        },
        workspace_id: 'workspace',
      });
    if (url === '/managed-systems')
      return json({
        items: [
          managedSystem(MS_ONE, 'Identity'),
          managedSystem(MS_TWO, 'Finance'),
          managedSystem(MS_THREE, 'Sales'),
        ],
        total: 3,
      });
    if (url === '/me/permissions/scope?capability=voc.read')
      return json({ scope: { kind: 'all' } });
    if (url === '/nav/counts') return json({ counts: {} });
    if (url === '/saved-views?surface=voc') return json({ items: [] });
    throw new Error(`unexpected request ${url}`);
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as typeof globalThis.fetch;
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ScopeControlHost disabled={false}>content</ScopeControlHost>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('scope-selector')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('scope-selector'));
    expect(await screen.findAllByTestId(/^scope-option-[0-9]/)).toHaveLength(3);
    await waitFor(() => expect(screen.queryByLabelText('범위 밖')).not.toBeInTheDocument());
  } finally {
    globalThis.fetch = originalFetch;
  }
});
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
function managedSystem(id: string, name: string) {
  return {
    id,
    workspace_id: 'workspace',
    slug: name.toLowerCase(),
    name,
    external_key: null,
    default_owner_actor_id: null,
    default_owner_team_id: null,
    archived_at: null,
    archived_by_actor_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

it.each([
  ['scoped', { kind: 'scoped', managed_system_ids: [MS_TWO] }, 2, '내 담당 1 / 3'],
  ['all', { kind: 'all' }, 0, '워크스페이스 전체'],
] as const)(
  'uses the returned voc.read scope for Admins: %s',
  async (_name, scope, deniedCount, expectedAllScopeLabel) => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === '/me')
        return json({
          actor: {
            id: 'admin',
            external_id: 'admin',
            email: 'admin@test',
            display_name: 'Admin',
            role_level: 'admin',
          },
          workspace_id: 'workspace',
        });
      if (url === '/me/permissions/check?capability=workspace.admin')
        return json({ state: 'approved', decision: { allow: true } });
      if (url === '/me/permissions/scope?capability=voc.read') return json({ scope });
      if (url === '/managed-systems')
        return json({
          items: [
            managedSystem(MS_ONE, 'Identity'),
            managedSystem(MS_TWO, 'Finance'),
            managedSystem(MS_THREE, 'Sales'),
          ],
          total: 3,
        });
      if (url.startsWith('/nav/counts')) return json({ counts: {} });
      if (url === '/saved-views?surface=voc') return json({ items: [] });
      throw new Error(`unexpected request ${url}`);
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    try {
      render(
        <QueryClientProvider client={client}>
          <ScopeControlHost disabled={false}>content</ScopeControlHost>
        </QueryClientProvider>,
      );

      await waitFor(() =>
        expect(
          requestedUrls.filter((url) => url === '/me/permissions/scope?capability=voc.read'),
        ).toHaveLength(1),
      );
      fireEvent.click(screen.getByTestId('scope-selector'));
      expect(await screen.findByTestId('scope-option-all')).toHaveTextContent(
        expectedAllScopeLabel,
      );
      expect(screen.queryAllByLabelText('범위 밖')).toHaveLength(deniedCount);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
