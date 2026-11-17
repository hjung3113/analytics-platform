import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PermissionRequestsScreen } from '../permission-requests-screen';
import { adminDetailFixture } from '../../../../test/permission-details';
import { formatDateTime } from '../../../../lib/format/datetime';

const state = vi.hoisted(() => ({ rows: [] as import('@ap/feature-shared').PermissionRequestAdminDetail[], focus: '' }));
vi.mock('../../../../lib/host/useHostSearchWriter', () => ({ useHostSearchWriter: () => { const [search, write] = useState({ selected: state.focus, tab: 'all' }); return { search, write }; } }));
vi.mock('../../../../lib/api/permission-reads', async importOriginal => ({ ...(await importOriginal<typeof import('../../../../lib/api/permission-reads')>()), fetchPermissionRequestsAllViaClient: async () => ({ requests: state.rows }) }));
vi.mock('../../../../lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors: () => ({ actors: [] }) }));
vi.mock('../../../../lib/cross-system/useManagedSystemNames', () => ({ managedSystemsCatalogQuery: () => ({ queryKey: ['test-systems'], queryFn: async () => ({ items: [] }) }) }));
vi.mock('../permission-request-batch-detail', () => ({ PermissionRequestBatchDetail: ({ rows, id }: { rows: { id: string }[]; id: string }) => <output data-testid="batch-detail" data-batch={id}>{rows.map(row => row.id).join(',')}</output> }));
vi.mock('@ap/ui', async importOriginal => ({ ...(await importOriginal<typeof import('@ap/ui')>()), ListShell: ({ list, tabs, detailPanel }: { list: ReactNode; tabs: ReactNode; detailPanel: ReactNode }) => <main>{tabs}<section data-testid="review-list">{list}</section>{detailPanel}</main> }));
afterEach(() => vi.clearAllMocks());
const batchId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const rows = ['workspace.read', 'finding.read'].map((capability, index) => adminDetailFixture({ id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`, requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', requested_capability: capability, requested_managed_system_id: null, status: 'pending', revision: 1, requested_expiration: null, reason: '업무 조회', created_at: '2026-11-17T00:00:00.000Z', batch_id: batchId, permission_group: { id: batchId, name: '업무 조회' } }));
const first = rows[0];
const second = rows[1];
if (!first || !second) throw new Error('Expected two batch fixtures');

it.each(['pending', 'decided'])('groups review rows, hides ids, formats dates and opens any batch member: %s', async mode => {
  state.rows = rows.map((row, index) => ({ ...row, status: mode === 'pending' ? 'pending' : index === 0 ? 'rejected' : 'approved' }));
  state.focus = second.id;
  render(<QueryClientProvider client={new QueryClient()}><PermissionRequestsScreen autoSelect={false} /></QueryClientProvider>);
  expect(await screen.findByTestId('batch-detail')).toHaveAttribute('data-batch', batchId);
  expect(screen.getByTestId('batch-detail')).toHaveTextContent(second.id);
  const list = screen.getByTestId('review-list');
  expect(list.textContent?.match(/권한 그룹 «업무 조회»/g)).toHaveLength(1);
  expect(list).toHaveTextContent('권한 2개');
  expect(list).toHaveTextContent(formatDateTime(first.created_at));
  for (const row of rows) { expect(list).not.toHaveTextContent(row.id); expect(list).not.toHaveTextContent(row.id.slice(0, 8)); }
  if (mode === 'decided') expect(list).toHaveTextContent('승인 1 · 거절 1');
});
