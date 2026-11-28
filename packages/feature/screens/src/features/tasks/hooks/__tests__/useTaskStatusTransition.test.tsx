import type { listTasks } from '../../../../lib/api/tasks';
import { ApiError } from '../../../../lib/api/types';
import type { ListTasksResponse, TaskDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { taskBoardColumnKey, taskBoardColumnOptions, useTaskBoardData, useTaskBoardSummary } from '../useTaskBoardData';
import { useTaskStatusTransition } from '../useTaskStatusTransition';

const { listTasksMock, notifyErrorMock, updateTaskStatusMock } = vi.hoisted(() => ({
  listTasksMock: vi.fn<typeof listTasks>(),
  notifyErrorMock: vi.fn(),
  updateTaskStatusMock: vi.fn(),
}));

vi.mock('../../../../lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/tasks')>()),
  listTasks: listTasksMock,
  updateTaskStatus: updateTaskStatusMock,
}));

vi.mock('../../../../lib/host/host-seam', () => ({
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

const backlogTask = { ...task, status: 'backlog' } as const;
const boardScope = { managedSystem: undefined, q: undefined, publicUpdate: undefined };
const filters = {};
const detailRead = vi.fn(async () => backlogTask);

async function setupBoard({ holdReview = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finishReview!: (page: ListTasksResponse) => void;
  let reviewSignal: AbortSignal | undefined;
  listTasksMock.mockImplementation(async ({ status, limit, cursor, signal } = {}) => {
    if (holdReview && status === 'review') {
      reviewSignal = signal;
      return new Promise((resolve) => (finishReview = resolve));
    }
    return {
      items: status === 'backlog' && !cursor ? [backlogTask] : [],
      page: { total: 1, cursor: 'next', has_more: limit === 50 && status === 'backlog' && !cursor },
    };
  });
  const hook = renderHook(() => {
    const board = useTaskBoardData({ scope: boardScope, filters, statusGrouping: true });
    useTaskBoardSummary(boardScope);
    useQuery({ queryKey: detailKey, queryFn: detailRead, staleTime: 30_000 });
    const caches = {
      mode: 'status' as const,
      summaryScope: boardScope,
      includesFallback: () => true,
      columnKey: (status: TaskDto['status']) => taskBoardColumnKey(boardScope, filters, status),
      ensureColumn: (status: TaskDto['status']) =>
        client.ensureInfiniteQueryData(taskBoardColumnOptions(boardScope, filters, status)),
    };
    return { board, mutation: useTaskStatusTransition(caches) };
  }, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => {
    expect(listTasksMock).toHaveBeenCalledTimes(10);
    expect(hook.result.current.board.loaded).toContainEqual(backlogTask);
  });
  await act(async () => { await hook.result.current.board.columns[0].query.fetchNextPage(); });
  listTasksMock.mockClear();
  detailRead.mockClear();
  return { ...hook, client, finishReview, reviewSignal };
}

function taskReads() {
  return listTasksMock.mock.calls.map(([options]) =>
    [options?.limit, options?.status, options?.cursor, options?.assignee],
  );
}

const moveReads = [
  [50, 'backlog', undefined, undefined],
  [50, 'backlog', 'next', undefined],
  [50, 'todo', undefined, undefined],
  [1, undefined, undefined, undefined],
  [1, undefined, undefined, 'unassigned'],
  [1, 'doing', undefined, undefined],
];

describe('useTaskStatusTransition board reconciliation', () => {
  beforeEach(() => {
    listTasksMock.mockReset();
    updateTaskStatusMock.mockReset().mockResolvedValue(backlogTask);
  });
  afterEach(() => vi.useRealTimers());

  it('re-reads both touched columns, every summary, and the detail while marking other columns stale', async () => {
    const { result, client } = await setupBoard();
    await act(async () => { await result.current.mutation.mutateAsync({ task: backlogTask, status: 'todo' }); });
    await waitFor(() => expect(result.current.mutation.isReconciling).toBe(false));
    expect(taskReads()).toHaveLength(6);
    expect(taskReads()).toEqual(expect.arrayContaining(moveReads));
    expect(detailRead).toHaveBeenCalledOnce();
    for (const column of ['doing', 'review', 'done', 'released', 'reopened'] as const) {
      expect(client.getQueryCache().find({ queryKey: taskBoardColumnKey(boardScope, filters, column) })?.isStale()).toBe(true);
    }
  });

  it('re-reads all seven columns and three summaries after a stale write', async () => {
    const { result } = await setupBoard();
    updateTaskStatusMock.mockRejectedValueOnce(new ApiError(409, { code: 'conflict.stale_write', message: 'Stale' }));
    await act(async () => {
      await result.current.mutation.mutateAsync({ task: backlogTask, status: 'todo' }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.mutation.isReconciling).toBe(false));
    expect(taskReads()).toHaveLength(11);
    expect(taskReads()).toEqual(expect.arrayContaining([
      ...moveReads,
      ...['doing', 'review', 'done', 'released', 'reopened'].map((status) => [50, status, undefined, undefined]),
    ]));
  });

  it('re-reads the union of overlapping moves once at the deadline', async () => {
    const { result } = await setupBoard();
    let finishFirst!: (value: TaskDto) => void;
    let finishSecond!: (value: TaskDto) => void;
    updateTaskStatusMock.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (finishSecond = resolve)));
    const other = { ...backlogTask, id: 'second', status: 'todo' } as const;
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => { first = result.current.mutation.mutateAsync({ task: backlogTask, status: 'todo' }); });
    await waitFor(() => expect(finishFirst).toBeTypeOf('function'));
    act(() => { second = result.current.mutation.mutateAsync({ task: other, status: 'doing' }); });
    await waitFor(() => expect(finishSecond).toBeTypeOf('function'));
    vi.useFakeTimers();
    await act(async () => {
      finishFirst(backlogTask);
      await first;
    });
    expect(listTasksMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    const reads = taskReads();
    await act(async () => { finishSecond(other); await second; });
    expect(reads).toHaveLength(7);
    expect(reads).toEqual(expect.arrayContaining([...moveReads, [50, 'doing', undefined, undefined]]));
  });

  it('allows an unrelated first page to finish during a move', async () => {
    const { result, finishReview, reviewSignal } = await setupBoard({ holdReview: true });
    await act(async () => { await result.current.mutation.mutateAsync({ task: backlogTask, status: 'todo' }); });
    expect(reviewSignal?.aborted).toBe(false);
    await act(async () => finishReview({ items: [], page: { total: 9, has_more: false } }));
    await waitFor(() => expect(result.current.board.columns[3].total).toBe(9));
  });
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
