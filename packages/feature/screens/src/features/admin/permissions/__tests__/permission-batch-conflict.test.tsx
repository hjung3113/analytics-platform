import { QueryClient, QueryClientProvider, useQueries } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { ApiError } from '../../../../lib/api/types';
import { permissionRequestAdminDetailKey } from '../../../../lib/api/permission-admin';
import { useDecidePermissionRequest } from '../useDecidePermissionRequest';

vi.mock('../../../../lib/api/permission-groups', () => ({ decidePermissionRequestBatch: vi.fn(async () => { throw new ApiError(409, { code: 'conflict.stale_write', message: 'stale' }); }) }));

it('refetches every observed batch member after a revision conflict', async () => {
  const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  const selected = ids[0];
  if (!selected) throw new Error('Missing selected request');
  const reads = vi.fn(async (_id: string) => ({ revision: 2 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const hook = renderHook(() => {
    useQueries({ queries: ids.map(id => ({ queryKey: permissionRequestAdminDetailKey(id), queryFn: () => reads(id) })) });
    return useDecidePermissionRequest();
  }, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
  reads.mockClear();
  await act(async () => { hook.result.current.mutate({ id: selected, expectedRevision: 1, action: 'approve', reason: '검토', idempotencyKey: selected, batch: { id: selected, revisions: Object.fromEntries(ids.map(id => [id, 1])), approveIds: ids } }); });
  await waitFor(() => { for (const id of ids) expect(reads).toHaveBeenCalledWith(id); });
});
