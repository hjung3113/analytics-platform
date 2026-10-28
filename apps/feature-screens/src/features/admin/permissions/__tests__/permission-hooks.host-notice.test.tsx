import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const permissionApi = vi.hoisted(() => ({
  createDirectPermissionGrant: vi.fn(),
  revokePermission: vi.fn(),
}));

vi.mock('@/lib/api/permission-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/permission-admin')>()),
  ...permissionApi,
}));

import { errorMapper, mapUnknownError } from '@/lib/api/errorMapper';
import { ApiError } from '@/lib/api/types';
import { ADMIN_PERMISSIONS_COPY } from '@/lib/copy/admin-permissions';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { DirectPermissionGrant, PermissionGrantAdminItem } from '@ap/feature-shared';
import { useDirectPermissionGrant } from '../useDirectPermissionGrant';
import { useRevokePermission } from '../useRevokePermission';

const grantResult = { id: 'grant-1' } as PermissionGrantAdminItem;
const grantBody = {
  actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  capability: 'voc.read',
  managed_system_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reason: 'approved for operations',
} as DirectPermissionGrant;
const failure = new ApiError(409, {
  code: 'conflict.permission_not_active',
  message: 'permission is not active',
});
const notify = vi.fn(() => 'notice-1');
const seam: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  notify,
  dismiss: () => {},
};

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HostSeamProvider value={seam}>{children}</HostSeamProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  notify.mockReset().mockReturnValue('notice-1');
  permissionApi.createDirectPermissionGrant.mockReset();
  permissionApi.revokePermission.mockReset();
});

describe('permission hooks notify through HostSeam', () => {
  it('notifies on direct grant success and error', async () => {
    const cacheReturnedGrant = vi.fn();
    const { result, rerender } = renderHook(() => useDirectPermissionGrant(cacheReturnedGrant), {
      wrapper,
    });
    permissionApi.createDirectPermissionGrant.mockResolvedValueOnce(grantResult);

    await act(async () => {
      await result.current.mutateAsync({ body: grantBody, idempotencyKey: 'grant-key' });
    });
    expect(notify).toHaveBeenLastCalledWith({
      tone: 'success',
      message: ADMIN_PERMISSIONS_COPY.directGrant.success,
    });
    expect(cacheReturnedGrant).toHaveBeenCalledWith(grantResult);

    notify.mockClear();
    permissionApi.createDirectPermissionGrant.mockRejectedValueOnce(failure);
    rerender();
    await act(async () => {
      await expect(
        result.current.mutateAsync({ body: grantBody, idempotencyKey: 'grant-key' }),
      ).rejects.toBe(failure);
    });
    expect(notify).toHaveBeenCalledWith({
      tone: 'error',
      message: mapUnknownError(failure).message,
    });
  });

  it('notifies on permission revoke success and error', async () => {
    const { result, rerender } = renderHook(() => useRevokePermission(), { wrapper });
    permissionApi.revokePermission.mockResolvedValueOnce({});

    await act(async () => {
      await result.current.mutateAsync({
        kind: 'grants',
        id: 'grant-1',
        reason: 'no longer needed',
        idempotencyKey: 'revoke-key',
      });
    });
    expect(notify).toHaveBeenLastCalledWith({
      tone: 'success',
      message: ADMIN_PERMISSIONS_COPY.revokeSuccess,
    });

    notify.mockClear();
    permissionApi.revokePermission.mockRejectedValueOnce(failure);
    rerender();
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          kind: 'grants',
          id: 'grant-1',
          reason: 'no longer needed',
          idempotencyKey: 'revoke-key',
        }),
      ).rejects.toBe(failure);
    });
    expect(notify).toHaveBeenCalledWith({
      tone: 'error',
      message: errorMapper(failure.envelope).message,
    });
  });
});
