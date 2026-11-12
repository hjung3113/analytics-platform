// #1844 node 1844f2 — Site·공정 targets on the requester's 권한 요청 page (ADR-0154 decision 6, advisor major 3).
// Synthetic site/room names only (ADR-0151).

import { configureApiClient } from '@/lib/api/client';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import {
  scopeCandidatesBody,
  scopeCreateResultBody,
  scopeMineRowBody,
} from '@/test/fixtures/permission-scope';
import { createPermissionRequestSchema } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionRequestsScreen } from '../PermissionRequestsScreen';

const ID_SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbc1';
const ID_ROOM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbc2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { path: string; method: string; body: unknown };
let calls: Call[] = [];
let listRows: unknown[] = [];

function installFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname;
    const method = init?.method ?? 'GET';
    calls.push({ path, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    if (path === '/api/features/managed-systems') return json({ items: [], total: 0 });
    if (path === '/api/features/permission-requests/scope-candidates')
      return json(scopeCandidatesBody());
    if (path === '/api/features/permission-requests/mine') return json({ requests: listRows });
    if (path === '/api/features/permission-requests' && method === 'POST')
      return json(scopeCreateResultBody(ID_ROOM, 'site_room', 'SITE-A', 'RA2'), 201);
    if (path.endsWith('/cancel') && method === 'POST')
      return json({
        id: ID_ROOM,
        status: 'cancelled',
        revision: 3,
        updated_at: '2026-11-12T00:00:00.000Z',
        requested_scope_kind: 'site_room',
        requested_scope_site: 'SITE-A',
        requested_scope_room: 'RA2',
      });
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
}

function mount() {
  const seam = {
    canLink: () => false,
    Link: () => null,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  } satisfies HostSeam;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <PermissionRequestsScreen />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  return { seam, user: userEvent.setup() };
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  screen.getByRole('combobox', { name }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('option', { name: option }));
}

async function optionsOf(user: ReturnType<typeof userEvent.setup>, name: string) {
  screen.getByRole('combobox', { name }).focus();
  await user.keyboard('{Enter}');
  const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
  await user.keyboard('{Escape}');
  return options;
}

const posts = () =>
  calls.filter((c) => c.method === 'POST' && c.path === '/api/features/permission-requests');
const reasonBox = () => screen.getByRole('textbox', { name: /사유/ });

const originalFetch = globalThis.fetch;
beforeEach(() => {
  configureApiClient({ basePath: '/api/features' });
  listRows = [];
  installFetch();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  configureApiClient({ basePath: '' });
});

describe('새 권한 요청 — Site·공정', () => {
  it('defaults to 기능 (today\'s form) and offers 기능 / Site 전체 / Site·공정', async () => {
    const { user } = mount();
    expect(screen.getByRole('combobox', { name: '요청 대상' })).toHaveTextContent('기능');
    expect(screen.getByRole('combobox', { name: '기능' })).toBeInTheDocument();
    expect(await optionsOf(user, '요청 대상')).toEqual([
      '기능',
      'Site 전체 (이후 추가되는 공정 포함)',
      'Site·공정',
    ]);
  });

  it('Site·공정 lists only ungranted 공정 from the candidate read and posts the 1844c shape', async () => {
    const { seam, user } = mount();
    await choose(user, '요청 대상', 'Site·공정');
    expect(screen.queryByRole('combobox', { name: '기능' })).not.toBeInTheDocument();

    // SITE-C is held whole; SITE-A and SITE-B still have open rooms.
    expect(await optionsOf(user, 'Site')).toEqual(['SITE-A · Synthetic A', 'SITE-B · Synthetic B']);
    await choose(user, 'Site', 'SITE-A · Synthetic A');
    expect(await optionsOf(user, '공정')).toEqual(['RA2', 'RA3']);
    await choose(user, '공정', 'RA2');
    await user.type(reasonBox(), '공정 조회가 필요합니다');
    await user.click(screen.getByRole('button', { name: '요청 보내기' }));

    await waitFor(() => expect(seam.notifySuccess).toHaveBeenCalledWith('권한 요청을 보냈습니다'));
    const body = posts()[0]?.body;
    expect(body).toEqual({
      requested_capability: 'scope.read',
      requested_scope_kind: 'site_room',
      requested_scope_site: 'SITE-A',
      requested_scope_room: 'RA2',
      reason: '공정 조회가 필요합니다',
    });
    expect(createPermissionRequestSchema.parse(body)).toEqual(body);
  });

  it('Site 전체 sends no room; a missing Site blocks the submit with a field error', async () => {
    const { user } = mount();
    await choose(user, '요청 대상', 'Site 전체 (이후 추가되는 공정 포함)');
    expect(await optionsOf(user, 'Site')).toEqual(['SITE-A · Synthetic A', 'SITE-B · Synthetic B']);
    expect(screen.queryByRole('combobox', { name: '공정' })).not.toBeInTheDocument();

    await user.type(reasonBox(), 'Site 조회');
    await user.click(screen.getByRole('button', { name: '요청 보내기' }));
    expect(await screen.findByText('Site를 선택하세요.')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);

    await choose(user, 'Site', 'SITE-B · Synthetic B');
    await user.click(screen.getByRole('button', { name: '요청 보내기' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({
      requested_capability: 'scope.read',
      requested_scope_kind: 'site',
      requested_scope_site: 'SITE-B',
      reason: 'Site 조회',
    });
  });
});

describe('내 권한 요청 — Site·공정 rows', () => {
  it('shows the site/room target and status, and withdraws a pending room request', async () => {
    listRows = [
      scopeMineRowBody(ID_ROOM, 'pending', 'site_room', 'SITE-A', 'RA2'),
      scopeMineRowBody(ID_SITE, 'approved', 'site', 'SITE-B'),
    ];
    const { seam, user } = mount();

    const roomRow = (await screen.findByText('Site SITE-A · 공정 RA2')).closest('li');
    const siteRow = screen.getByText('Site SITE-B 전체').closest('li');
    if (!roomRow || !siteRow) throw new Error('rows missing');
    expect(within(roomRow).getByText('대기 중')).toBeInTheDocument();
    expect(within(siteRow).getByText('승인됨')).toBeInTheDocument();
    expect(within(siteRow).queryByRole('button', { name: /철회/ })).not.toBeInTheDocument();

    await user.click(within(roomRow).getByRole('button', { name: '요청 철회: Site SITE-A · 공정 RA2' }));
    await user.click(within(roomRow).getByRole('button', { name: '철회' }));

    await waitFor(() => expect(seam.notifySuccess).toHaveBeenCalled());
    const cancel = calls.find((c) => c.path === `/api/features/permission-requests/${ID_ROOM}/cancel`);
    expect(cancel?.body).toEqual({ expected_revision: 2 });
  });
});
