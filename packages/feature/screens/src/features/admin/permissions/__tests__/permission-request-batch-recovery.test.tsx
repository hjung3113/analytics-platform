import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { adminDetailFixture } from '../../../../test/permission-details';
import { scopeAdminDetailBody, scopeAdminRowBody } from '../../../../test/fixtures/permission-scope';
import { configureApiClient } from '../../../../lib/api/client';
import { permissionRequestAdminDetailKey } from '../../../../lib/api/permission-admin';
import { PermissionRequestBatchDetail } from '../permission-request-batch-detail';

const batch = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const initial = ['workspace.read', 'finding.read'].map((capability, index) => adminDetailFixture({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`, requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', requested_capability: capability,
  requested_managed_system_id: null, status: 'pending', revision: 1, requested_expiration: null, reason: '업무 조회',
  created_at: '2026-11-17T00:00:00.000Z', batch_id: batch,
}));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); configureApiClient({ basePath: '' }); });

it.each(['supported', 'unsupported'] as const)('requires a safe batch POST when a checklist change leaves the narrowing %s', async mode => {
  const [first, second] = initial;
  if (!first || !second) throw new Error('Expected two batch fixtures');
  const system = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const survey = {
    ...first,
    requested_capability: 'survey.export',
    approval_scope_candidates: [{ managed_system_id: null }, { managed_system_id: system }],
  };
  const other = mode === 'supported'
    ? { ...second, requested_capability: 'survey.export', requested_managed_system_id: system,
        approval_scope_candidates: [{ managed_system_id: system }] }
    : { ...second, requested_capability: 'explorer.export' };
  const items = [survey, other];
  const rows = items.map(({ id, requester_actor_id, requested_capability,
    requested_managed_system_id, status, revision, requested_expiration, reason, created_at }) => ({
    id, requester_actor_id, requested_capability, requested_managed_system_id, status, revision,
    requested_expiration, reason, created_at, batch_id: batch,
  }));
  const posts = vi.fn((_body: unknown) => json({
    batch_id: batch,
    items: [{ id: survey.id, status: 'approved' }, { id: other.id, status: 'rejected' }],
  }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/permissions/requests/batch/${batch}/decide` && init?.method === 'POST')
      return posts(JSON.parse(String(init.body)));
    const item = items.find(member => url.endsWith(member.id));
    if (item) return json(item);
    return json({ code: 'internal.unexpected', message: 'unmocked' }, 500);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PermissionRequestBatchDetail rows={rows} id={batch} managedSystemNames={{ [system]: 'Alpha' }}
        approvalSystemNames={{ [system]: 'Alpha' }} onClose={vi.fn()}
        renderDetail={({ body, footer }) => <><main>{body}</main><footer>{footer}</footer></>} />
    </QueryClientProvider>,
  );
  await screen.findByTestId('permission-decision-section');
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const otherCheck = screen.getAllByRole('checkbox')[1];
  if (!otherCheck) throw new Error('Expected the second checklist item');
  if (mode === 'unsupported') fireEvent.click(otherCheck);
  fireEvent.click(screen.getByRole('radio', { name: 'Alpha' }));
  fireEvent.click(otherCheck);
  fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'Review export scope' } });
  const submit = screen.getByTestId('permission-decision-submit');
  if (mode === 'unsupported') {
    fireEvent.click(submit);
    await act(async () => { await Promise.resolve(); });
    expect(posts).not.toHaveBeenCalled();
    expect(submit).toBeDisabled();
    fireEvent.click(otherCheck);
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Alpha' }));
  }
  fireEvent.click(submit);
  await waitFor(() => expect(posts).toHaveBeenCalledTimes(1));
  expect(posts).toHaveBeenCalledWith({
    action: 'approve',
    expected_revisions: { [survey.id]: survey.revision, [other.id]: other.revision },
    approve_ids: [survey.id],
    reason: 'Review export scope',
    granted_managed_system_id: system,
  });
});

it.each([
  { kind: 'site', room: null },
  { kind: 'site_room', room: 'RA1' },
] as const)('requires requested-scope recovery when only a $kind request is checked', async ({ kind, room }) => {
  const [first, second] = initial;
  if (!first || !second) throw new Error('Expected two batch fixtures');
  const system = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const scopeRow = { ...scopeAdminRowBody(second.id, kind, 'SITE-A', room), batch_id: batch };
  const scoped = scopeAdminDetailBody(scopeRow);
  const surveyRow = {
    id: first.id,
    requester_actor_id: scoped.requester_actor_id,
    requested_capability: 'survey.export',
    requested_managed_system_id: null,
    status: first.status,
    revision: first.revision,
    requested_expiration: first.requested_expiration,
    reason: first.reason,
    created_at: first.created_at,
    batch_id: batch,
  };
  const survey = {
    ...first,
    ...surveyRow,
    requester: scoped.requester,
    approval_scope_candidates: [{ managed_system_id: null }, { managed_system_id: system }],
  };
  const posts = vi.fn((_body: unknown) => json({
    batch_id: batch,
    items: [{ id: survey.id, status: 'rejected' }, { id: scoped.id, status: 'approved' }],
  }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/permissions/requests/batch/${batch}/decide` && init?.method === 'POST')
      return posts(JSON.parse(String(init.body)));
    const item = [survey, scoped].find(member => url.endsWith(member.id));
    if (item) return json(item);
    return json({ code: 'internal.unexpected', message: 'unmocked' }, 500);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PermissionRequestBatchDetail rows={[surveyRow, scopeRow]} id={batch}
        managedSystemNames={{ [system]: 'Alpha' }} approvalSystemNames={{ [system]: 'Alpha' }} onClose={vi.fn()}
        renderDetail={({ body, footer }) => <><main>{body}</main><footer>{footer}</footer></>} />
    </QueryClientProvider>,
  );
  await screen.findByTestId('permission-decision-section');
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const scopeCheck = screen.getByRole('checkbox', { name: 'Site·공정 조회' });
  fireEvent.click(scopeCheck);
  fireEvent.click(screen.getByRole('radio', { name: 'Alpha' }));
  fireEvent.click(scopeCheck);
  fireEvent.click(screen.getByRole('checkbox', { name: '설문 데이터 내보내기' }));
  fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'Review requested scope' } });
  const submit = screen.getByTestId('permission-decision-submit');
  expect(submit).toBeDisabled();
  expect(screen.queryByRole('radio', { name: '전체 시스템' })).not.toBeInTheDocument();
  const requested = screen.getByRole('radio', { name: '항목별 요청 범위' });
  expect(requested).toBeEnabled();
  fireEvent.click(requested);
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(posts).toHaveBeenCalledTimes(1));
  expect(posts).toHaveBeenCalledWith({
    action: 'approve',
    expected_revisions: { [survey.id]: survey.revision, [scoped.id]: scoped.revision },
    approve_ids: [scoped.id],
    reason: 'Review requested scope',
  });
});

it.each(['background', 'conflict'] as const)('preserves same-revision drafts and latches recovery after a batch %s change', async mode => {
  let items = initial;
  const posts = vi.fn(() => {
    items = initial.map(item => ({ ...item, revision: 2 }));
    return json({ code: 'conflict.stale_write', message: 'stale' }, 409);
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/decide')) return posts();
    const item = items.find(item => url.endsWith(item.id));
    if (item) return json(item);
    throw new Error(url);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><PermissionRequestBatchDetail rows={initial.map(({ id, requester_actor_id, requested_capability, requested_managed_system_id, status, revision, requested_expiration, reason, created_at }) => ({ id, requester_actor_id, requested_capability, requested_managed_system_id, status, revision, requested_expiration, reason, created_at }))} id={batch} managedSystemNames={{}} onClose={vi.fn()} /></QueryClientProvider>);
  await screen.findByTestId('permission-decision-section');
  fireEvent.click(screen.getByRole('button', { name: '거절' }));
  fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'draft review reason' } });
  await act(async () => { await client.invalidateQueries({ queryKey: ['permission-requests', 'admin-detail'] }); });
  expect(screen.getByLabelText(/^사유/)).toHaveValue('draft review reason');
  if (mode === 'background') {
    items = initial.map((item, index) => ({ ...item, revision: index === 1 ? 2 : 1 }));
    const second = items[1];
    if (!second) throw new Error('fixture');
    await act(async () => { await client.invalidateQueries({ queryKey: permissionRequestAdminDetailKey(second.id) }); });
  } else {
    fireEvent.click(screen.getByTestId('permission-decision-submit'));
    await waitFor(() => expect(posts).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('permission-request-stale-alert')).toBeInTheDocument();
  }
  expect(await screen.findByTestId('permission-decision-reset-notice')).toHaveTextContent('draft review reason');
  expect(screen.getByLabelText(/^사유/)).toHaveValue('');
  expect(screen.getByTestId('permission-decision-submit')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '거절' }));
  expect(screen.queryByTestId('permission-decision-reset-notice')).not.toBeInTheDocument();
  expect(screen.queryByTestId('permission-request-stale-alert')).not.toBeInTheDocument();
});

it('recognizes its own successful whole-batch decision without a discarded-draft warning', async () => {
  let items = initial;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/decide')) {
      items = initial.map(item => ({ ...item, revision: 2, status: 'rejected' as const, allowed_actions: [] }));
      return json({ batch_id: batch, items: items.map(item => ({ id: item.id, status: item.status })) });
    }
    const item = items.find(item => url.endsWith(item.id));
    if (item) return json(item);
    throw new Error(url);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><PermissionRequestBatchDetail rows={initial.map(({ id, requester_actor_id, requested_capability, requested_managed_system_id, status, revision, requested_expiration, reason, created_at }) => ({ id, requester_actor_id, requested_capability, requested_managed_system_id, status, revision, requested_expiration, reason, created_at }))} id={batch} managedSystemNames={{}} onClose={vi.fn()} /></QueryClientProvider>);
  await screen.findByTestId('permission-decision-section');
  fireEvent.click(screen.getByRole('button', { name: '거절' }));
  fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'reviewed here' } });
  fireEvent.click(screen.getByTestId('permission-decision-submit'));
  await screen.findByText('승인 0 · 거절 2');
  expect(screen.queryByTestId('permission-decision-reset-notice')).not.toBeInTheDocument();
  expect(screen.queryByTestId('permission-request-stale-alert')).not.toBeInTheDocument();
});

it('recognizes its own decision when an untouched closed member stays in the batch (C7)', async () => {
  const [open, closedSource] = initial;
  if (!open || !closedSource) throw new Error('fixture');
  const closed = { ...closedSource, status: 'cancelled' as const, revision: 2, allowed_actions: [] };
  let items = [open, closed];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/decide')) {
      items = [{ ...open, status: 'needs_more_info' as const, revision: 2 }, closed];
      return json({ batch_id: batch, items: [{ id: open.id, status: 'needs_more_info' }] });
    }
    const item = items.find(item => url.endsWith(item.id));
    if (item) return json(item);
    throw new Error(url);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><PermissionRequestBatchDetail rows={items.map(({ id, requester_actor_id, requested_capability, requested_managed_system_id, status, revision, requested_expiration, reason, created_at }) => ({ id, requester_actor_id, requested_capability, requested_managed_system_id, status, revision, requested_expiration, reason, created_at }))} id={batch} managedSystemNames={{}} onClose={vi.fn()} /></QueryClientProvider>);
  await screen.findByTestId('permission-decision-section');
  fireEvent.click(screen.getByRole('button', { name: '추가 정보 요청' }));
  fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: 'please add detail' } });
  fireEvent.click(screen.getByTestId('permission-decision-submit'));
  await waitFor(() => expect(client.getQueryData(permissionRequestAdminDetailKey(open.id))).toMatchObject({ revision: 2 }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByTestId('permission-decision-reset-notice')).not.toBeInTheDocument();
  expect(screen.queryByTestId('permission-request-stale-alert')).not.toBeInTheDocument();
});
