import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiRequest }));

import { ManagedSystemScopeControl } from '../ManagedSystemScopeControl';

const ME = (roleLevel: string) => ({
  actor: {
    id: 'actor-1',
    external_id: 'x',
    email: 'a@b',
    display_name: 'A',
    role_level: roleLevel,
  },
  workspace_id: 'w',
});
const MS_A = '11111111-1111-4111-8111-111111111111';
const MS_B = '22222222-2222-4222-8222-222222222222';
const system = (id: string, name: string) => ({
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
});
const SYSTEMS = { items: [system(MS_A, 'Alpha'), system(MS_B, 'Beta')], total: 2 };

function respond(roleLevel: string, scope: unknown) {
  apiRequest.mockImplementation(
    async (
      _method: string,
      url: string,
      parser: ((data: unknown) => unknown) | { parse(data: unknown): unknown },
    ) => {
      const body = url === '/me' ? ME(roleLevel) : url === '/managed-systems' ? SYSTEMS : { scope };
      return { data: typeof parser === 'function' ? parser(body) : parser.parse(body) };
    },
  );
}

function renderControl() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ManagedSystemScopeControl onChange={vi.fn()} />
    </QueryClientProvider>,
  );
  return client;
}

describe('ManagedSystemScopeControl', () => {
  it('reads through the client with the standalone AppFrame query keys', async () => {
    respond('developer', { kind: 'scoped', managed_system_ids: [MS_A] });
    const client = renderControl();
    await waitFor(() =>
      expect(screen.getByTestId('scope-selector')).toHaveTextContent('내 담당: Alpha'),
    );
    expect(screen.getByTestId('scope-label')).toHaveTextContent('목록 범위');
    expect(screen.getByTestId('scope-selector')).toHaveAccessibleName(
      '전체 Managed System, 내 담당 범위',
    );
    expect(apiRequest.mock.calls.map((call) => call[1]).sort()).toEqual([
      '/managed-systems',
      '/me',
      '/me/permissions/scope?capability=voc.read',
    ]);
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => JSON.stringify(query.queryKey))
        .sort(),
    ).toEqual(
      expect.arrayContaining([
        JSON.stringify(['managed-system-scope', 'actor-1', 'voc.read']),
        JSON.stringify(['managed-systems', 'scope-selector']),
        JSON.stringify(['me']),
      ]),
    );
  });

  it('shows the workspace-wide scope for an admin', async () => {
    respond('admin', { kind: 'all' });
    renderControl();
    await waitFor(() =>
      expect(screen.getByTestId('scope-selector')).toHaveAccessibleName('전체 Managed System'),
    );
    expect(screen.getByTestId('scope-selector')).not.toHaveTextContent('내 담당:');
  });
});
