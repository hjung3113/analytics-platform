import { ApiError } from '../../../lib/api/types';
import type { TaskDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskStatusTransition } from './useTaskStatusTransition';

const { notifyErrorMock, updateTaskStatusMock } = vi.hoisted(() => ({
  notifyErrorMock: vi.fn(),
  updateTaskStatusMock: vi.fn(),
}));

vi.mock('../../../lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/tasks')>()),
  updateTaskStatus: updateTaskStatusMock,
}));

vi.mock('../../../lib/host/host-seam', () => ({
  useHostSeam: () => ({ notifyError: notifyErrorMock }),
}));

const task = {
  id: '10000000-0000-0000-0000-000000000001',
  status: 'todo',
  updated_at: '2026-11-19T00:00:00.000Z',
} as TaskDto;
const detailKey = ['task', task.id] as const;
const writeError = new ApiError(500, {
  code: 'internal.unexpected',
  message: 'Temporary status write failure',
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(detailKey, task);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => useTaskStatusTransition({ mode: 'detail', detailKey }),
    { wrapper },
  );
  return { ...hook, client };
}

describe('useTaskStatusTransition detail errors', () => {
  beforeEach(() => {
    notifyErrorMock.mockReset();
    updateTaskStatusMock.mockReset();
  });

  it('keeps a mounted detail error available without a toast', async () => {
    updateTaskStatusMock.mockRejectedValueOnce(writeError);
    const { result, client } = setup();

    await act(async () => {
      await result.current
        .mutateAsync({ task, status: 'doing' })
        .catch(() => undefined);
    });

    expect(result.current.isError).toBe(true);
    expect(client.getQueryData(detailKey)).toMatchObject({ status: 'todo' });
    expect(notifyErrorMock).not.toHaveBeenCalled();
    client.clear();
  });

  it('toasts a detail write failure that arrives after the detail view unmounts', async () => {
    let rejectWrite!: (error: ApiError) => void;
    updateTaskStatusMock.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectWrite = reject)),
    );
    const { result, unmount, client } = setup();

    act(() => {
      void result.current.mutateAsync({ task, status: 'doing' }).catch(() => undefined);
    });
    await waitFor(() => expect(updateTaskStatusMock).toHaveBeenCalledOnce());
    unmount();

    await act(async () => {
      rejectWrite(writeError);
    });

    expect(client.getQueryData(detailKey)).toMatchObject({ status: 'todo' });
    expect(notifyErrorMock).toHaveBeenCalledOnce();
    expect(notifyErrorMock).toHaveBeenCalledWith(expect.any(String));
    client.clear();
  });
});
