import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';

import { HostSeamProvider, type HostSeam } from '../../../../lib/host/host-seam';
import { OwnerPermissionRequestDialog } from '../../../home/OwnerPermissionRequestDialog';
import { TriageScreen } from '../../components/triage/TriageScreen';
import { InboxScreen } from '../InboxScreen';

const SYSTEM = '10000000-0000-4000-8000-000000000001';
const OTHER_SYSTEM = '10000000-0000-4000-8000-000000000002';
const ID = '10000000-0000-4000-8000-000000000003';
const AT = '2026-11-20T00:00:00.000Z';
const REASON = 'VOC를 확인할 조회 권한이 필요합니다.';
const ROW = {
  id: ID, requested_capability: 'voc.read', requested_managed_system_id: SYSTEM,
  requested_object_type: null, requested_object_id: null, source_object_type: null,
  source_object_id: null, source_action_id: null, requested_expiration: null,
  return_route_intent: null, revision: 1, status: 'pending', reason: REASON,
  created_at: AT, updated_at: AT,
};

function mount(view: 'inbox' | 'triage', { existing, home, canOpenStatus = true }: { existing: boolean; home?: string; canOpenStatus?: boolean }) {
  let pending = existing;
  const calls = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/vocs') return Response.json({
      code: 'permission.denied', message: 'denied',
      requestable_permission: { permission: 'voc.read', managed_system_id: SYSTEM, reason_required: true },
    }, { status: 403 });
    if (path === '/me/permissions/check') return Response.json({ state: 'approved', decision: { allow: true } });
    if (path === '/me/permissions/scope') return Response.json({ scope: { kind: 'all' } });
    if (path === '/me') return Response.json({ workspace_id: 'ws', actor: { id: 'actor', display_name: 'Developer', external_id: 'dev', email: 'dev@example.test', role_level: 'developer' } });
    if (path === '/nav/counts') return Response.json({ counts: {} });
    if (path === '/managed-systems') return Response.json({ items: [], total: 0 });
    if (path === '/analytics-areas') return Response.json({ items: [] });
    if (path === '/permission-requests/mine') {
      const unrelated = [
        { ...ROW, id: '10000000-0000-4000-8000-000000000004', requested_managed_system_id: OTHER_SYSTEM },
        { ...ROW, id: '10000000-0000-4000-8000-000000000005', requested_capability: 'voc.triage' },
      ];
      return Response.json({ requests: pending ? [...unrelated, ROW] : unrelated });
    }
    if (path === '/permission-requests' && init?.method === 'POST') {
      pending = true;
      return Response.json({ id: ID, status: 'pending', created_at: AT }, { status: 201 });
    }
    if (path === `/permission-requests/${ID}`) return Response.json({
      ...ROW, requester_actor_id: ID, source_summary: null, latest_admin_question: null,
      editable_scope_candidates: [], allowed_actions: ['withdraw'],
    });
    if (path === `/permission-requests/${ID}/cancel`) {
      pending = false;
      return Response.json({ id: ID, status: 'cancelled', revision: 2, updated_at: AT });
    }
    return Response.json({ code: 'test.unhandled_request', message: path }, { status: 500 });
  });
  vi.stubGlobal('fetch', calls);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const search = { managedSystem: SYSTEM };
  const host: HostSeam = {
    canLink: to => canOpenStatus && to === '/permission-requests',
    Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
    useSearch: () => search,
    useNavigate: () => vi.fn(),
    useHere: () => `/vocs?view=${view}`,
    notifyError: vi.fn(), notifySuccess: vi.fn(),
    ...(home ? { permissionHomeHref: home } : {}),
  };
  function Page() {
    const [withdraw, setWithdraw] = useState(false);
    return <>
      {view === 'inbox' ? <InboxScreen view="inbox" renderDetail={() => null} /> : <TriageScreen />}
      <button type="button" onClick={() => setWithdraw(true)}>Open request details</button>
      {withdraw && <OwnerPermissionRequestDialog id={ID} onClose={() => setWithdraw(false)} />}
    </>;
  }
  render(<QueryClientProvider client={client}><HostSeamProvider value={host}><Page /></HostSeamProvider></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe.each([['inbox', 'VOC 처리함', 3], ['triage', '분류', 2]] as const)('%s queue denial', (view, title, level) => {
  it('shows an existing exact-target request in the card after mounting', async () => {
    mount(view, { existing: true });
    const status = await screen.findByRole('link', { name: '내 권한 요청 보기' });
    const card = status.closest<HTMLElement>('[data-request-status]');
    assert(card);
    expect(within(card).getByRole('heading', { name: title, level })).toBeInTheDocument();
    expect(within(card).getByRole('status')).toHaveTextContent('보낸 권한 요청을 검토하고 있습니다.');
    expect(within(card).queryByRole('button', { name: '권한 요청' })).toBeNull();
  });

  it('focuses the status link on submit and restores Request after withdrawal with the gate still mounted', async () => {
    mount(view, { existing: false, home: '/' });
    const request = await screen.findByRole('button', { name: '권한 요청' });
    const card = request.closest<HTMLElement>('[data-request-status]');
    assert(card);
    expect(within(card).getByRole('status')).toHaveTextContent('이 항목에 접근하려면 권한 요청이 필요합니다.');
    request.focus();
    fireEvent.click(request);
    fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
    fireEvent.submit(screen.getByTestId('permission-request-form'));
    const confirm = await screen.findByRole('button', { name: '확인' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Escape' });
    const status = await within(card).findByRole('link', { name: '내 권한 요청 보기' });
    await waitFor(() => expect(status).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Open request details' }));
    fireEvent.click(await screen.findByRole('button', { name: '요청 철회' }));
    const confirmation = screen.getByTestId('owner-withdraw-confirmation');
    fireEvent.click(within(confirmation).getByRole('button', { name: '요청 철회' }));
    expect(await within(card).findByRole('button', { name: '권한 요청' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: '내 권한 요청 보기' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: '권한 요청' }));
    expect(screen.getByTestId('permission-request-form')).toBeInTheDocument();
  });
});

it.each([{ home: '/' }, {}] as Array<{ home?: string }>)('focuses Home or the heading if the status link is unavailable (%j)', async options => {
  mount('inbox', { existing: false, canOpenStatus: false, ...options });
  const request = await screen.findByRole('button', { name: '권한 요청' });
  const card = request.closest<HTMLElement>('[data-request-status]');
  assert(card);
  fireEvent.click(request);
  fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
  fireEvent.submit(screen.getByTestId('permission-request-form'));
  fireEvent.click(await screen.findByRole('button', { name: '확인' }));
  const target = options.home
    ? within(card).getByRole('link', { name: '홈으로' })
    : within(card).getByRole('heading', { name: 'VOC 처리함' });
  await waitFor(() => expect(target).toHaveFocus());
});
