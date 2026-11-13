// #1844 node 1844f2 — Site·공정 grants in the existing 부여 목록 and 권한 부여 form (ADR-0154 decisions 3 and 6).
// Synthetic site/room names only (ADR-0151).

import {
  directPermissionGrantSchema,
  listPermissionDeniesResponseSchema,
  listPermissionGrantsResponseSchema,
  permissionGrantAdminItemSchema,
  revokePermissionResultSchema,
} from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SCOPE_ACTOR,
  SCOPE_AT,
  scopeCandidatesBody,
  scopeGrantItemBody,
  scopeGrantOptionsBody,
} from '@/test/fixtures/permission-scope';

const apiRequestMock = vi.hoisted(() => vi.fn());
const ADMIN_ID = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

vi.mock('sonner', () => ({ Toaster: () => null, toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api/me', () => ({
  useMeBridge: () => ({ data: { actor: { id: ADMIN_ID, display_name: 'Admin One' } } }),
}));
vi.mock('../../settings/use-workspace-settings.js', () => ({
  useWorkspaceSettings: () => ({ data: undefined }),
}));
vi.mock('@ap/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/ui')>();
  return {
    ...actual,
    ListShell: ({
      toolbar,
      tabs,
      list,
      detailPanel,
    }: {
      toolbar?: { actions?: React.ReactNode };
      tabs?: React.ReactNode;
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div>
        <header>{toolbar?.actions}</header>
        {tabs}
        {list}
        {detailPanel}
      </div>
    ),
  };
});
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiRequest: apiRequestMock,
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchManagedSystems: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    isPending: false,
    isError: false,
    actors: [
      {
        id: SCOPE_ACTOR,
        display_name: 'Actor One',
        email: 'actor-one@example.com',
        actor_type: 'internal_member',
      },
    ],
  }),
}));

import { PermissionGrantsScreen } from '../permission-grants-screen';
import { permissionGrantsSearchSchema } from '../permission-grants-search';

const IN_CATALOG_ID = '11111111-1111-4111-8111-111111111111';
const REMOVED_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_ID = '33333333-3333-4333-8333-333333333333';

type Req = { method: string; path: string; body: unknown };
let requests: Req[] = [];

beforeEach(() => {
  requests = [];
  apiRequestMock.mockImplementation(
    async (
      method: string,
      path: string,
      parser: { parse: (value: unknown) => unknown },
      options?: { body?: unknown },
    ) => {
      requests.push({ method, path, body: options?.body });
      if (method === 'GET' && path === '/permissions/grants')
        return {
          data: parser.parse(
            listPermissionGrantsResponseSchema.parse({
              items: [
                scopeGrantItemBody(IN_CATALOG_ID, 'site', 'SITE-A', null, true),
                scopeGrantItemBody(REMOVED_ID, 'site_room', 'SITE-Z', 'RZ9', false),
              ],
            }),
          ),
        };
      if (method === 'GET' && path === '/permissions/denies')
        return { data: parser.parse(listPermissionDeniesResponseSchema.parse({ items: [] })) };
      if (method === 'GET' && path.startsWith('/permissions/grant-options'))
        return { data: parser.parse(scopeGrantOptionsBody(SCOPE_ACTOR, 'Actor One')) };
      if (method === 'GET' && path === '/permission-requests/scope-candidates')
        return { data: parser.parse(scopeCandidatesBody()) };
      if (method === 'POST' && path === '/permissions/grants') {
        const body = directPermissionGrantSchema.parse(options?.body);
        return {
          data: parser.parse(
            scopeGrantItemBody(
              CREATED_ID,
              body.scope_kind === 'site_room' ? 'site_room' : 'site',
              body.scope_site ?? '',
              body.scope_room ?? null,
              true,
            ),
          ),
        };
      }
      if (method === 'POST' && path.endsWith('/revoke'))
        return {
          data: parser.parse(revokePermissionResultSchema.parse({ id: REMOVED_ID, revoked_at: SCOPE_AT })),
        };
      throw new Error(`unmocked ${method} ${path}`);
    },
  );
});
afterEach(() => {
  apiRequestMock.mockReset();
  vi.restoreAllMocks();
});

function renderScreen(initialPath = '/admin/permissions/grants') {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin/permissions/grants',
    validateSearch: (raw) => permissionGrantsSearchSchema.parse(raw),
    component: PermissionGrantsScreen,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  screen.getByRole('combobox', { name }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('option', { name: option }));
}

async function openFormForActor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '권한 부여' }));
  const dialog = await screen.findByRole('dialog', { name: '권한 부여' });
  await choose(user, '대상자', 'Actor One · actor-one@example.com');
  await waitFor(() =>
    expect(within(dialog).getByTestId('direct-grant-recipient')).toHaveTextContent('Actor One'),
  );
  return dialog;
}

const grantPosts = () =>
  requests.filter((r) => r.method === 'POST' && r.path === '/permissions/grants');

describe('부여 목록 — Site·공정 grants', () => {
  it('rows show the site/room target and a «카탈로그에 없음» badge only for in_catalog: false', async () => {
    // Selected first row = the in-catalog SITE-A grant, so its drawer adds no badge.
    renderScreen(`/admin/permissions/grants?selected=${IN_CATALOG_ID}`);
    expect(await screen.findAllByText('Site SITE-A 전체')).toHaveLength(2);
    expect(screen.getByText('Site SITE-Z · 공정 RZ9')).toBeInTheDocument();
    expect(screen.getAllByText('카탈로그에 없음')).toHaveLength(1);
  });

  it('an out-of-catalog grant shows the badge in the drawer and stays revocable', async () => {
    const user = userEvent.setup();
    renderScreen(`/admin/permissions/grants?selected=${REMOVED_ID}`);

    await waitFor(() => expect(screen.getAllByText('카탈로그에 없음')).toHaveLength(2));
    expect(screen.getAllByText('Site SITE-Z · 공정 RZ9')).toHaveLength(2);
    await user.type(await screen.findByLabelText('사유 · 필수'), '카탈로그에서 빠진 공정 정리');
    const revoke = screen.getByTestId('permission-grants-submit');
    expect(revoke).toHaveTextContent('권한 취소');
    await user.click(revoke);

    await waitFor(() =>
      expect(requests.some((r) => r.method === 'POST' && r.path === `/permissions/grants/${REMOVED_ID}/revoke`)).toBe(true),
    );
  });

  it('a declared-capability row shows the declared display name beside its id (ADR-0157 decision 9)', async () => {
    const declaredGrant = permissionGrantAdminItemSchema.parse({
      id: IN_CATALOG_ID,
      actor_id: SCOPE_ACTOR,
      capability: 'ext.widget.annotate',
      managed_system_id: null,
      in_declarations: true,
      granted_by_actor_id: ADMIN_ID,
      granted_at: SCOPE_AT,
      expires_at: null,
    });
    apiRequestMock.mockImplementation(
      async (method: string, path: string, parser: { parse: (value: unknown) => unknown }) => {
        requests.push({ method, path, body: undefined });
        if (method === 'GET' && path === '/permissions/grants')
          return { data: parser.parse({ items: [declaredGrant] }) };
        if (method === 'GET' && path === '/permissions/denies') return { data: parser.parse({ items: [] }) };
        if (method === 'GET' && path === '/me/permissions/declared-capabilities')
          return {
            data: parser.parse({
              items: [{ id: 'ext.widget.annotate', display_name: 'Widget annotate', sensitive: true, requestable: false }],
            }),
          };
        throw new Error(`unmocked ${method} ${path}`);
      },
    );
    renderScreen('/admin/permissions/grants?selected=99999999-9999-4999-8999-999999999999');

    expect(await screen.findByText('Actor One · Widget annotate (ext.widget.annotate)')).toBeInTheDocument();
    expect(requests.filter((r) => r.path === '/me/permissions/declared-capabilities')).toHaveLength(1);
  });
});

describe('권한 부여 — 범위 종류', () => {
  it('defaults to 시스템 and offers 시스템 / Site 전체 / Site·공정', async () => {
    const user = userEvent.setup();
    renderScreen();
    await openFormForActor(user);

    const kind = screen.getByRole('combobox', { name: '범위 종류' });
    expect(kind).toHaveTextContent('시스템');
    kind.focus();
    await user.keyboard('{Enter}');
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      '시스템',
      'Site 전체 (이후 추가되는 공정 포함)',
      'Site·공정',
    ]);
  });

  it.each([
    {
      kind: 'Site 전체 (이후 추가되는 공정 포함)',
      site: 'SITE-C · Synthetic C',
      room: null,
      expected: { scope_kind: 'site', scope_site: 'SITE-C' },
      selected: '선택: Site·공정 조회 · Site SITE-C 전체',
    },
    {
      kind: 'Site·공정',
      site: 'SITE-A · Synthetic A',
      room: 'RA1',
      expected: { scope_kind: 'site_room', scope_site: 'SITE-A', scope_room: 'RA1' },
      selected: '선택: Site·공정 조회 · Site SITE-A · 공정 RA1',
    },
  ])('$kind posts the scope.read payload with catalog values', async ({ kind, site, room, expected, selected }) => {
    const user = userEvent.setup();
    renderScreen();
    const dialog = await openFormForActor(user);

    await choose(user, '범위 종류', kind);
    // Grant mode offers the whole catalog, including what the admin already holds (SITE-C, RA1).
    await choose(user, 'Site', site);
    if (room !== null) await choose(user, '공정', room);
    expect(within(dialog).getByTestId('direct-grant-selected')).toHaveTextContent(selected);
    await user.type(within(dialog).getByLabelText('사유 · 필수'), '운영 확인');
    await user.click(within(dialog).getByTestId('direct-grant-submit'));

    await waitFor(() => expect(grantPosts()).toHaveLength(1));
    const body = grantPosts()[0]?.body;
    expect(body).toEqual({
      actor_id: SCOPE_ACTOR,
      capability: 'scope.read',
      ...expected,
      reason: '운영 확인',
    });
    expect(directPermissionGrantSchema.parse(body)).toEqual(body);
  });

  it('Site·공정 cannot submit until a 공정 is picked', async () => {
    const user = userEvent.setup();
    renderScreen();
    const dialog = await openFormForActor(user);
    await choose(user, '범위 종류', 'Site·공정');
    await choose(user, 'Site', 'SITE-B · Synthetic B');
    await user.type(within(dialog).getByLabelText('사유 · 필수'), '운영 확인');
    expect(within(dialog).getByTestId('direct-grant-submit')).toBeDisabled();
  });
});
