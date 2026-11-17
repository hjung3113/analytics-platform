import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { adminDetailFixture } from '../../../../test/permission-details';
import { PermissionRequestBatchDetail } from '../permission-request-batch-detail';

const state = vi.hoisted(() => ({ details: [] as import('@ap/feature-shared').PermissionRequestAdminDetail[] }));
vi.mock('../../../../lib/api/permission-admin', async importOriginal => ({ ...(await importOriginal<typeof import('../../../../lib/api/permission-admin')>()), fetchPermissionRequestAdminDetail: async (id: string) => state.details.find(item => item.id === id) }));
vi.mock('../permission-request-detail', () => ({ PermissionRequestDetail: ({ request }: { request: { allowed_actions: string[] } }) => <output>{request.allowed_actions.join(',')}</output> }));

it('keeps approval available when a held member cannot be approved', async () => {
  const rows = ['workspace.read', 'finding.read'].map((capability, index) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`, requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', requested_capability: capability, requested_managed_system_id: null, status: 'pending' as const, revision: 1, requested_expiration: null, reason: '업무 조회', created_at: '2026-11-17T00:00:00.000Z' }));
  state.details = rows.map((row, index) => adminDetailFixture(row, false, 'allowed', index === 0 ? { allowed_actions: ['reject', 'need_more_info'], effective_access: { decision: { allow: true, via: 'role' }, scope: { kind: 'all' }, expires_at: null, granted_managed_system_id: null } } : {}));
  render(<QueryClientProvider client={new QueryClient()}><PermissionRequestBatchDetail rows={rows} id="dddddddd-dddd-4ddd-8ddd-dddddddddddd" managedSystemNames={{}} onClose={vi.fn()} /></QueryClientProvider>);
  expect(await screen.findByText(/reject,need_more_info,approve/)).toBeInTheDocument();
});
