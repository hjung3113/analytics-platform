import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/api/client', () => ({ apiRequest }));

import type { Capability } from '@ap/feature-shared';
import { ManagedSystemScopeControl } from '../ManagedSystemScopeControl';
import { managedSystemsCatalogBridgeQuery } from '../../../lib/cross-system/managedSystemCatalog';

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

function renderControl(capability?: Capability) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ManagedSystemScopeControl onChange={vi.fn()} {...(capability !== undefined ? { capability } : {})} />
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
    expect(screen.getByTestId('scope-label')).toHaveTextContent('시스템');
    expect(screen.getByTestId('scope-selector')).toHaveAccessibleName(
      '시스템, 전체 시스템, 내 담당 범위',
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

  it('marks scope by the capability the menu declares (#2630)', async () => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(
      async (
        _method: string,
        url: string,
        parser: ((data: unknown) => unknown) | { parse(data: unknown): unknown },
      ) => {
        const scope = url.endsWith('capability=finding.read')
          ? { kind: 'scoped', managed_system_ids: [MS_B] }
          : { kind: 'scoped', managed_system_ids: [MS_A] };
        const body = url === '/me' ? ME('developer') : url === '/managed-systems' ? SYSTEMS : { scope };
        return { data: typeof parser === 'function' ? parser(body) : parser.parse(body) };
      },
    );
    const client = renderControl('finding.read');
    await waitFor(() =>
      expect(screen.getByTestId('scope-selector')).toHaveTextContent('내 담당: Beta'),
    );
    expect(apiRequest.mock.calls.map((call) => call[1])).not.toContain('/me/permissions/scope?capability=voc.read');
    expect(
      client.getQueryCache().getAll().map((query) => JSON.stringify(query.queryKey)),
    ).toContain(JSON.stringify(['managed-system-scope', 'actor-1', 'finding.read']));
  });

  it('switches the marks cleanly when the declared capability changes on an open picker (#2630)', async () => {
    apiRequest.mockReset();
    let releaseFinding: () => void = () => undefined;
    apiRequest.mockImplementation(
      async (
        _method: string,
        url: string,
        parser: ((data: unknown) => unknown) | { parse(data: unknown): unknown },
      ) => {
        if (url.endsWith('capability=finding.read')) await new Promise<void>((resolve) => { releaseFinding = resolve; });
        const scope = url.endsWith('capability=finding.read')
          ? { kind: 'scoped', managed_system_ids: [MS_B] }
          : { kind: 'scoped', managed_system_ids: [MS_A] };
        const body = url === '/me' ? ME('developer') : url === '/managed-systems' ? SYSTEMS : { scope };
        return { data: typeof parser === 'function' ? parser(body) : parser.parse(body) };
      },
    );
    const client = new QueryClient();
    const view = (capability?: Capability) => (
      <QueryClientProvider client={client}>
        <ManagedSystemScopeControl onChange={vi.fn()} {...(capability !== undefined ? { capability } : {})} />
      </QueryClientProvider>
    );
    const { rerender } = render(view());
    await waitFor(() => expect(screen.getByTestId('scope-selector')).toHaveTextContent('내 담당: Alpha'));
    fireEvent.click(screen.getByTestId('scope-selector'));
    await screen.findByTestId(`scope-option-${MS_B}`);
    const shielded = () => screen.queryAllByLabelText('범위 밖').length;
    expect(shielded()).toBe(1);
    rerender(view('finding.read'));
    // While the new scope loads, nothing is marked out of scope and no mark from voc.read is left.
    expect(shielded()).toBe(0);
    await act(async () => releaseFinding());
    await waitFor(() => expect(screen.getByTestId('scope-selector')).toHaveTextContent('내 담당: Beta'));
    expect(shielded()).toBe(1);
    expect(screen.getByTestId(`scope-option-${MS_A}`)).toContainElement(screen.getByLabelText('범위 밖'));
  });

  it('names two systems that share a name by their slug, and only those (#2602 label rule)', async () => {
    apiRequest.mockReset();
    const MS_C = '33333333-3333-4333-8333-333333333333';
    const shared = { items: [system(MS_A, 'Power BI'), { ...system(MS_B, 'Power BI'), slug: 'power-bi-2' }, system(MS_C, 'Tableau')], total: 3 };
    apiRequest.mockImplementation(
      async (
        _method: string,
        url: string,
        parser: ((data: unknown) => unknown) | { parse(data: unknown): unknown },
      ) => {
        const body = url === '/me' ? ME('admin') : url === '/managed-systems' ? shared : { scope: { kind: 'all' } };
        return { data: typeof parser === 'function' ? parser(body) : parser.parse(body) };
      },
    );
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ManagedSystemScopeControl value={MS_B} onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('scope-name')).toHaveTextContent('Power BI (power-bi-2)'));
    fireEvent.click(screen.getByTestId('scope-selector'));
    const options = await screen.findAllByRole('option');
    const names = options.map((option) => option.textContent ?? '');
    // The fixture slug is the lower-cased name.
    expect(names.some((name) => name.includes('Power BI (power bi)'))).toBe(true);
    expect(names.some((name) => name.includes('Power BI (power-bi-2)'))).toBe(true);
    expect(names.some((name) => name.includes('Tableau') && !name.includes('('))).toBe(true);
  });

  it('shows the workspace-wide scope for an admin', async () => {
    respond('admin', { kind: 'all' });
    renderControl();
    await waitFor(() =>
      expect(screen.getByTestId('scope-selector')).toHaveAccessibleName(
        '시스템, 전체 시스템',
      ),
    );
    expect(screen.getByTestId('scope-selector')).not.toHaveTextContent('내 담당:');
  });

  it.each([
    '04104C71-1111-4111-8111-111111111111',
    '04104c71-1111-4111-8111-111111111111',
  ])('selects the catalog system for a managedSystem link with %s', async (id) => {
    const catalogId = '04104c71-1111-4111-8111-111111111111';
    respond('developer', { kind: 'scoped', managed_system_ids: [catalogId] });
    const defaultResponse = apiRequest.getMockImplementation();
    if (!defaultResponse) throw new Error('Expected the default API fixture');
    apiRequest.mockImplementation((method, url, parser) =>
      url === '/managed-systems'
        ? Promise.resolve({ data: { items: [system(catalogId, 'Tableau')], total: 1 } })
        : defaultResponse(method, url, parser),
    );
    const client = new QueryClient();
    const onChange = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ManagedSystemScopeControl value={id} onChange={onChange} />
      </QueryClientProvider>,
    );
    const trigger = await screen.findByRole('button', { name: '시스템, Tableau' });
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: /Tableau/, selected: true })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names an archived selection from the catalog without offering it as a switch target', async () => {
    respond('admin', { kind: 'all' });
    const defaultResponse = apiRequest.getMockImplementation();
    if (!defaultResponse) throw new Error('Expected the default API fixture');
    const archived = { ...system(MS_B, 'Beta'), archived_at: '2026-01-02T00:00:00.000Z' };
    apiRequest.mockImplementation(async (method, url, parser) => {
      if (url === '/managed-systems') return { data: { items: [SYSTEMS.items[0]], total: 1 } };
      if (url.startsWith('/managed-systems?include_archived=true')) {
        return { data: { items: [SYSTEMS.items[0], archived], total: 2 } };
      }
      return defaultResponse(method, url, parser);
    });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ManagedSystemScopeControl value={MS_B} onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const trigger = await screen.findByRole('button', { name: '시스템, Beta, 보관됨' });
    expect(trigger).toHaveTextContent('Beta');
    expect(trigger).toHaveTextContent('보관됨');
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: /Alpha/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Beta/ })).toBeNull();
  });

  it('keeps a partial catalog entry with no archive timestamp in the unknown state', async () => {
    respond('admin', { kind: 'all' });
    const partial = { id: '33333333-3333-4333-8333-333333333333', name: 'Gamma' };
    apiRequest.mockImplementationOnce(async (_method, _url, parser) => ({
      data: parser.parse({ items: [partial], total: 1 }),
    }));
    const client = new QueryClient();
    await client.fetchQuery(managedSystemsCatalogBridgeQuery());
    render(
      <QueryClientProvider client={client}>
        <ManagedSystemScopeControl value={partial.id} onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const trigger = await screen.findByTestId('scope-selector');
    expect(trigger).toHaveAccessibleName('시스템, 알 수 없는 시스템');
    expect(trigger).not.toHaveTextContent('보관됨');
  });
});
