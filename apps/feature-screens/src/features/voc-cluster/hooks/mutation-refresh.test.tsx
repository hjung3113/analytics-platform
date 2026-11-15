import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useFindingStatusMutation } from '@/features/findings/hooks/useFindingStatusMutation';
import { useRequestTaskFromFinding } from '@/features/findings/hooks/useRequestTaskFromFinding';
import { useCreateFindingFromCluster } from './useCreateFindingFromCluster';
import { useAddClusterMember } from './useAddClusterMember';
import { useRemoveClusterMember } from './useRemoveClusterMember';

vi.mock('@/lib/api/client', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/api/client')>()), apiClient: vi.fn(async () => ({ data: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } })) }));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
it('refreshes status-generated Finding progress notes', async () => {
  const { client, wrapper } = setup();
  const key = ['progress-notes', 'finding', id];
  client.setQueryData(key, { pages: [] });
  const { result } = renderHook(() => useFindingStatusMutation({ findingId: id, idempotencyKey: 'key' }), { wrapper });
  await act(async () => { await result.current.mutateAsync({ status: 'active' }); });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});
it('refreshes the Task Request queue after requesting from a Finding', async () => {
  const { client, wrapper } = setup();
  client.setQueryData(['task-requests'], { items: [] });
  const { result } = renderHook(() => useRequestTaskFromFinding({ findingId: id, idempotencyKey: 'key' }), { wrapper });
  await act(async () => { await result.current.mutateAsync({ evidence_summary: 'Synthetic evidence', requested_outcome: 'Synthetic outcome' }); });
  expect(client.getQueryState(['task-requests'])?.isInvalidated).toBe(true);
});
it('refreshes cluster detail and filtered lists after creating a Finding', async () => {
  const { client, wrapper } = setup();
  const keys = [['voc-cluster', id], ['voc-clusters', { managedSystemId: other }]];
  for (const key of keys) client.setQueryData<unknown>(key, { items: [] });
  const { result } = renderHook(() => useCreateFindingFromCluster(), { wrapper });
  await act(async () => { await result.current.mutateAsync({ clusterId: id, body: { title: 'Synthetic Finding', summary: 'Summary', severity: 'medium' } }); });
  for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});
it.each([['add', useAddClusterMember], ['remove', useRemoveClusterMember]] as const)('refreshes cluster lists after member %s', async (_name, useMutation) => {
  const { client, wrapper } = setup();
  const key = ['voc-clusters', { managedSystemId: other }];
  client.setQueryData<unknown>(key, { items: [] });
  const { result } = renderHook(() => useMutation(), { wrapper });
  await act(async () => { await result.current.mutateAsync({ clusterId: id, vocId: other }); });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
});
