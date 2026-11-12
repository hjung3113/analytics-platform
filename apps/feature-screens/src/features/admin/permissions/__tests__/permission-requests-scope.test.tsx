// #1844 node 1844f2 — Site·공정 requests in the existing review console (ObjectRow list + detail drawer).
// Synthetic site/room names only (ADR-0151).

import type { AdminPermissionRequestRow } from '@/lib/api/permission-reads';
import {
  scopeAdminCoveredDetailBody,
  scopeAdminDetailBody,
  scopeAdminRowBody,
  scopeCandidatesBody,
} from '@/test/fixtures/permission-scope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ useConsole: vi.fn(), mutate: vi.fn() }));

vi.mock('@ap/ui', async () => {
  const actual = await vi.importActual<typeof import('@ap/ui')>('@ap/ui');
  return { ...actual, ListShell: ({ list }: { list: ReactNode }) => <main>{list}</main> };
});
vi.mock('../use-permission-requests-console.js', () => ({
  usePermissionRequestsConsole: mocks.useConsole,
}));
vi.mock('../useDecidePermissionRequest.js', () => ({
  useDecidePermissionRequest: () => ({
    mutate: mocks.mutate,
    isPending: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock('../../settings/use-workspace-settings.js', () => ({
  useWorkspaceSettings: () => ({ data: undefined }),
}));
vi.mock('@/lib/api/me', () => ({
  useMeBridge: () => ({ data: { actor: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } } }),
}));

import { PermissionRequestDetail } from '../permission-request-detail.js';
import { PermissionRequestsScreen } from '../permission-requests-screen.js';

const SITE_ROW = scopeAdminRowBody('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'site', 'SITE-A');
const ROOM_ROW = scopeAdminRowBody('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'site_room', 'SITE-B', 'RB4');

const originalFetch = globalThis.fetch;
beforeEach(() => {
  mocks.mutate.mockReset();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://x').pathname;
    if (path === '/permission-requests/scope-candidates')
      return new Response(JSON.stringify(scopeCandidatesBody()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function withClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('review console — Site·공정 requests', () => {
  it('rows show the site/room target instead of a Managed System', () => {
    const rows = [SITE_ROW, ROOM_ROW] as AdminPermissionRequestRow[];
    mocks.useConsole.mockReturnValue({
      allRequests: rows,
      visibleRequests: rows,
      activeTab: 'pending',
      selected: null,
      selectedId: null,
      actorNames: {},
      managedSystemNames: {},
      isPending: false,
      isError: false,
      handleTabChange: vi.fn(),
      handleSelect: vi.fn(),
      handleClose: vi.fn(),
    });
    render(<PermissionRequestsScreen />);

    expect(screen.getByText('Site SITE-A 전체')).toBeInTheDocument();
    expect(screen.getByText('Site SITE-B · 공정 RB4')).toBeInTheDocument();
    expect(screen.queryByText('전체', { exact: true })).not.toBeInTheDocument();
  });

  it('the drawer shows the target, offers no explicit deny, and narrows a Site to a 공정 of the same site', async () => {
    const user = userEvent.setup();
    withClient(
      <PermissionRequestDetail request={scopeAdminDetailBody(SITE_ROW)} onClose={() => undefined} />,
    );

    expect(screen.getByText('Site SITE-A 전체')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '명시적 거부' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '승인' }));
    const scope = screen.getByRole('combobox', { name: '승인 범위' });
    expect(scope).toHaveTextContent('Site SITE-A 전체');
    scope.focus();
    await user.keyboard('{Enter}');
    // Same site only (SITE-B/SITE-C rooms are never offered); granted rooms stay grantable to another actor.
    expect(
      (await screen.findAllByRole('option', { name: /SITE-A · 공정/ })).map((o) => o.textContent),
    ).toEqual(['Site SITE-A · 공정 RA1', 'Site SITE-A · 공정 RA2', 'Site SITE-A · 공정 RA3']);
    expect(screen.getAllByRole('option')).toHaveLength(4);
    await user.click(screen.getByRole('option', { name: 'Site SITE-A · 공정 RA2' }));
    await user.click(screen.getByTestId('permission-decision-submit'));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0]?.[0]).toMatchObject({
      action: 'approve',
      grantedScope: { site: 'SITE-A', room: 'RA2' },
    });
    expect(mocks.mutate.mock.calls[0]?.[0]).not.toHaveProperty('grantedManagedSystemId');
  });

  it('a 공정 request approves as requested with no narrowing control', async () => {
    const user = userEvent.setup();
    withClient(
      <PermissionRequestDetail request={scopeAdminDetailBody(ROOM_ROW)} onClose={() => undefined} />,
    );

    expect(screen.getByText('Site SITE-B · 공정 RB4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '승인' }));
    expect(screen.queryByRole('combobox', { name: '승인 범위' })).not.toBeInTheDocument();
    await user.click(screen.getByTestId('permission-decision-submit'));

    const args = mocks.mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.action).toBe('approve');
    expect(args).not.toHaveProperty('grantedScope');
    expect(args).not.toHaveProperty('grantedManagedSystemId');
  });

  it.each([
    ['a covering Site grant', { kind: 'site' as const, site: 'SITE-B', room: null }, 'Site SITE-B 전체'],
    ['a covering 공정 grant', { kind: 'site_room' as const, site: 'SITE-B', room: 'RB4' }, 'Site SITE-B · 공정 RB4'],
  ])('the risk review names %s by its Site·공정 target, never «전체»', (_label, held, expected) => {
    withClient(
      <PermissionRequestDetail
        request={scopeAdminCoveredDetailBody(ROOM_ROW, {
          ...held,
          grantId: '99999999-9999-4999-8999-999999999999',
        })}
        onClose={() => undefined}
      />,
    );
    const review = screen.getByTestId('permission-request-risk-review');
    expect(review).toHaveTextContent(`직접 부여 · 현재 직접 부여 범위: ${expected}`);
    expect(review).not.toHaveTextContent('현재 직접 부여 범위: 전체');
  });

  it('never offers deny for scope.read even if the server lists it', () => {
    const detail = { ...scopeAdminDetailBody(ROOM_ROW), allowed_actions: ['approve', 'reject', 'deny'] as const };
    withClient(
      <PermissionRequestDetail
        request={{ ...detail, allowed_actions: [...detail.allowed_actions] }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: '거절' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '명시적 거부' })).not.toBeInTheDocument();
  });
});
