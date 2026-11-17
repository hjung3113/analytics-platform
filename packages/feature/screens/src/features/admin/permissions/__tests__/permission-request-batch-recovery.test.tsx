import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { adminDetailFixture } from '../../../../test/permission-details';
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
