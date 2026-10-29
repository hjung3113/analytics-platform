// The two admin permission consoles under a recording test host seam (#764 g): the URL goes only through the seam,
// `autoSelect={false}` never selects on its own, `renderDetail` hands the host the detail parts, and the default keeps the
// standalone first-visible auto-select.

import type { AdminPermissionRequestRow } from '@/lib/api/permission-reads';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { adminDetailFixture } from '@/test/permission-details';
import { permissionDenyAdminItemSchema, permissionGrantAdminItemSchema } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requests: vi.fn(),
  grants: vi.fn(),
  denies: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('@/lib/api/permission-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/permission-reads')>()),
  fetchPermissionRequestsAllViaClient: mocks.requests,
}));
vi.mock('@/lib/api/permission-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/permission-admin')>()),
  fetchPermissionGrants: mocks.grants,
  fetchPermissionDenies: mocks.denies,
  fetchPermissionRequestAdminDetail: mocks.detail,
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchManagedSystems: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ isPending: false, isError: false, actors: [] }),
}));

import { PermissionGrantsScreen } from '../permission-grants-screen';
import { PermissionRequestsScreen } from '../permission-requests-screen';
import { usePermissionGrantsConsole } from '../use-permission-grants-console';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const R3 = '33333333-3333-4333-8333-333333333333';
const STALE = '99999999-9999-4999-8999-999999999999';

function row(id: string, status: AdminPermissionRequestRow['status']): AdminPermissionRequestRow {
  return {
    id,
    requester_actor_id: ACTOR,
    requested_capability: 'finding.manage',
    requested_managed_system_id: null,
    reason: 'need it',
    requested_expiration: null,
    status,
    revision: 1,
    created_at: '2026-07-10T00:00:00.000Z',
  } as AdminPermissionRequestRow;
}

function grant(id: string) {
  return permissionGrantAdminItemSchema.parse({
    id,
    actor_id: ACTOR,
    capability: 'voc.triage',
    managed_system_id: null,
    granted_by_actor_id: ACTOR,
    granted_at: '2026-07-17T00:00:00.000Z',
    expires_at: null,
  });
}

function deny(id: string) {
  return permissionDenyAdminItemSchema.parse({
    id,
    actor_id: ACTOR,
    capability: 'voc.triage',
    managed_system_id: null,
    created_by_actor_id: ACTOR,
    created_at: '2026-07-17T00:00:00.000Z',
    reason: 'no',
  });
}

type Call = { href: string; options: { replace?: boolean } | undefined };
let calls: Call[] = [];

function record(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href, 'http://platform.local').searchParams);
}

function mount(
  initial: Record<string, string>,
  screen: (host: HostSeam) => React.ReactElement,
  overrides: Partial<HostSeam> = {},
) {
  function Host() {
    const [search, set] = React.useState(initial);
    const seam = React.useMemo<HostSeam>(
      () => ({
        canLink: () => true,
        Link: ({ to, children }) => <a href={to}>{children}</a>,
        notifyError: () => {},
        notifySuccess: () => {},
        useNavigate: () => (href, options) => {
          calls.push({ href, options });
          set(record(href));
        },
        useSearch: () => search,
        useTitle: () => {},
        useHere: () => '/x',
        notify: () => 'n',
        dismiss: () => {},
        ...overrides,
      }),
      [search],
    );
    return <HostSeamProvider value={seam}>{screen(seam)}</HostSeamProvider>;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls = [];
  mocks.requests.mockReset();
  mocks.grants.mockReset();
  mocks.denies.mockReset();
  mocks.detail.mockReset();
  mocks.requests.mockResolvedValue({
    requests: [row(R1, 'pending'), row(R2, 'approved'), row(R3, 'approved')],
  });
  mocks.detail.mockImplementation((id: string) =>
    Promise.resolve(adminDetailFixture(row(id, 'pending'))),
  );
  mocks.grants.mockResolvedValue([grant(R1), grant(R2)]);
  mocks.denies.mockResolvedValue([deny(R3)]);
});
afterEach(cleanup);

describe('PermissionRequestsScreen over the host seam', () => {
  it('autoSelect=false: opening writes nothing', async () => {
    mount({}, () => <PermissionRequestsScreen autoSelect={false} renderDetail={() => null} />);
    await screen.findByText('알 수 없는 사용자 · Finding 관리');
    expect(calls).toEqual([]);
  });

  it('autoSelect default: the first visible request is replace-selected exactly once', async () => {
    mount({}, () => <PermissionRequestsScreen />);
    await waitFor(() =>
      expect(calls).toEqual([
        { href: `/admin/permissions/requests?selected=${R1}`, options: { replace: true } },
      ]),
    );
  });

  it('autoSelect=false: a tab change clears an invisible selection and never picks the first item', async () => {
    mount({ selected: R1 }, () => (
      <PermissionRequestsScreen autoSelect={false} renderDetail={() => null} />
    ));
    await waitFor(() => expect(mocks.requests).toHaveBeenCalled());
    await screen.findByRole('tab', { name: /승인됨/ });
    await waitFor(() => expect(screen.getByRole('tab', { name: /승인됨/ })).toHaveTextContent('2'));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /승인됨/ }));
    expect(calls).toEqual([
      { href: '/admin/permissions/requests?tab=approved', options: undefined },
    ]);
  });

  it('autoSelect default: a tab change selects the first visible request of the new tab', async () => {
    mount({ selected: R1 }, () => <PermissionRequestsScreen />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /승인됨/ })).toHaveTextContent('2'));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /승인됨/ }));
    expect(calls.at(-1)).toEqual({
      href: `/admin/permissions/requests?tab=approved&selected=${R2}`,
      options: undefined,
    });
  });

  it('autoSelect=false: a stale selection is replace-dropped after a successful read, never replaced by the first item', async () => {
    mount({ selected: STALE }, () => (
      <PermissionRequestsScreen autoSelect={false} renderDetail={() => null} />
    ));
    await waitFor(() =>
      expect(calls).toEqual([{ href: '/admin/permissions/requests', options: { replace: true } }]),
    );
  });

  it('autoSelect default: a stale deep-linked selection falls back to the first visible request', async () => {
    mount({ selected: STALE }, () => <PermissionRequestsScreen />);
    await waitFor(() =>
      expect(calls).toEqual([
        { href: `/admin/permissions/requests?selected=${R1}`, options: { replace: true } },
      ]),
    );
  });

  it('a failed list read never clears a deep-linked selection', async () => {
    mocks.requests.mockRejectedValue(new Error('boom'));
    mount({ selected: R1 }, () => (
      <PermissionRequestsScreen autoSelect={false} renderDetail={() => null} />
    ));
    await screen.findByText('권한 요청을 불러오지 못했습니다.');
    expect(calls).toEqual([]);
  });

  it('renderDetail receives parts whose requestClose drops the selection with a push', async () => {
    const renderDetail = vi.fn(
      (parts: { title: React.ReactNode; body: React.ReactNode; requestClose(): void }) => (
        <div data-testid="host-drawer">
          {parts.title}
          <button type="button" onClick={parts.requestClose}>
            host-close
          </button>
        </div>
      ),
    );
    mount({ selected: R1, tab: 'all' }, () => (
      <PermissionRequestsScreen autoSelect={false} renderDetail={renderDetail} />
    ));
    await screen.findByTestId('host-drawer');
    await waitFor(() =>
      expect(screen.getByTestId('host-drawer')).toHaveTextContent('Finding 관리'),
    );
    expect(screen.queryByTestId('permission-request-detail-panel')).toBeNull();
    fireEvent.click(screen.getByText('host-close'));
    expect(calls).toEqual([{ href: '/admin/permissions/requests?tab=all', options: undefined }]);
  });
});

describe('PermissionGrantsScreen over the host seam', () => {
  it('autoSelect=false: opening writes nothing', async () => {
    mount({}, () => <PermissionGrantsScreen autoSelect={false} renderDetail={() => null} />);
    await waitFor(() => expect(screen.getAllByText('voc.triage')).toHaveLength(2));
    expect(calls).toEqual([]);
  });

  it('autoSelect default: the first grant is replace-selected', async () => {
    mount({}, () => <PermissionGrantsScreen />);
    await waitFor(() =>
      expect(calls).toEqual([
        { href: `/admin/permissions/grants?selected=${R1}`, options: { replace: true } },
      ]),
    );
  });

  it('autoSelect=false: switching to denies clears an invisible selection and does not pick the first deny', async () => {
    mount({ selected: R1 }, () => (
      <PermissionGrantsScreen autoSelect={false} renderDetail={() => null} />
    ));
    await screen.findAllByRole('tab');
    await waitFor(() => expect(mocks.denies).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('tab', { name: /^차단/ })).toHaveTextContent('1'));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^차단/ }));
    expect(calls).toEqual([{ href: '/admin/permissions/grants?tab=denies', options: undefined }]);
  });

  it('autoSelect default: switching to denies selects the first deny', async () => {
    mount({ selected: R1 }, () => <PermissionGrantsScreen />);
    await screen.findAllByRole('tab');
    await waitFor(() => expect(screen.getByRole('tab', { name: /^차단/ })).toHaveTextContent('1'));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^차단/ }));
    expect(calls.at(-1)).toEqual({
      href: `/admin/permissions/grants?tab=denies&selected=${R3}`,
      options: undefined,
    });
  });

  it('autoSelect=false: a stale selection is replace-dropped after a successful read', async () => {
    mount({ selected: STALE }, () => (
      <PermissionGrantsScreen autoSelect={false} renderDetail={() => null} />
    ));
    await waitFor(() =>
      expect(calls).toEqual([{ href: '/admin/permissions/grants', options: { replace: true } }]),
    );
  });

  it('a failed list read never clears a deep-linked selection', async () => {
    mocks.grants.mockRejectedValue(new Error('boom'));
    mount({ selected: R1 }, () => (
      <PermissionGrantsScreen autoSelect={false} renderDetail={() => null} />
    ));
    await waitFor(() => expect(mocks.grants).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual([]);
  });

  it('renderDetail receives parts whose requestClose drops the selection and keeps the tab', async () => {
    const renderDetail = vi.fn((parts: { title: React.ReactNode; requestClose(): void }) => (
      <div data-testid="host-drawer">
        {parts.title}
        <button type="button" onClick={parts.requestClose}>
          host-close
        </button>
      </div>
    ));
    mount({ selected: R3, tab: 'denies' }, () => (
      <PermissionGrantsScreen autoSelect={false} renderDetail={renderDetail} />
    ));
    await screen.findByTestId('host-drawer');
    expect(screen.queryByTestId('permission-grants-detail-panel')).toBeNull();
    fireEvent.click(screen.getByText('host-close'));
    expect(calls).toEqual([{ href: '/admin/permissions/grants?tab=denies', options: undefined }]);
  });
});

describe('usePermissionGrantsConsole over the host seam', () => {
  it('a created grant selects the new grant and clears the tab in one push write', async () => {
    let created: ((id: string) => void) | undefined;
    function Probe() {
      created = usePermissionGrantsConsole({ autoSelect: false }).handleCreatedGrant;
      return null;
    }
    mount({ tab: 'denies', selected: R3 }, () => <Probe />);
    await waitFor(() => expect(created).toBeDefined());
    await waitFor(() => expect(mocks.denies).toHaveBeenCalled());
    created?.(R1);
    expect(calls).toEqual([
      { href: `/admin/permissions/grants?selected=${R1}`, options: undefined },
    ]);
  });
});

describe('the consoles draw their own title only when the host does not own it', () => {
  it.each([
    ['PermissionRequestsScreen', '권한 요청 검토', () => <PermissionRequestsScreen />],
    ['PermissionGrantsScreen', '활성 권한', () => <PermissionGrantsScreen />],
  ])('%s', async (_name, title, screenEl) => {
    const standalone = mount({}, screenEl);
    expect(await screen.findByRole('heading', { name: new RegExp(title) })).toBeTruthy();
    standalone.unmount();
    mount({}, screenEl, { hostOwnsTitle: true });
    await screen.findByRole('tablist');
    expect(screen.queryByRole('heading', { name: new RegExp(title) })).toBeNull();
  });
});
