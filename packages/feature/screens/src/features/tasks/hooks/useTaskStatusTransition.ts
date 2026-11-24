import { mapUnknownError } from '../../../lib/api/errorMapper';
import { mintIdempotencyKey } from '../../../lib/api/idempotency';
import { updateTaskStatus } from '../../../lib/api/tasks';
import { ApiError } from '../../../lib/api/types';
import { useHostSeam } from '../../../lib/host/host-seam';
import { invalidateRecovery } from '../../../lib/query/recovery';
import type { ListTasksResponse, TaskDetailDto, TaskDto, TaskStatus } from '@ap/feature-shared';
import {
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  hashKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';
import { type TaskBoardScope, TASK_BOARD_STATUS_COLUMNS, TASK_BOARD_SUMMARY_KINDS, taskBoardSummaryKey } from './useTaskBoardData';

type ColumnPages = InfiniteData<ListTasksResponse, string | undefined>;
type Position = { page: number; index: number };

type BoardLists =
  | {
      mode: 'status';
      includesFallback: (task: TaskDto) => boolean;
      columnKey: (status: TaskStatus) => QueryKey;
      /** Loads a column's first page when no cache exists so the moved card can render there. */
      ensureColumn: (status: TaskStatus) => Promise<unknown>;
    }
  | { mode: 'open'; openKey: QueryKey };

/** Where the board's caches live right now; read at each invocation. */
export type TaskBoardCaches =
  | (BoardLists & { summaryScope?: TaskBoardScope })
  | { mode: 'detail'; detailKey: QueryKey };

// One invocation's own delta. Rollback undoes exactly this, never a whole-column snapshot.
type Delta = {
  taskId: string;
  scopeKey: string;
  token: number;
  previous: TaskDto;
  target: TaskStatus;
  sourceKey: QueryKey | null;
  targetKey: QueryKey | null;
  sourceRemovedAt: Position | null;
  sourceTotalAdjusted: boolean;
  targetInserted: boolean;
  targetTotalAdjusted: boolean;
  openKey: QueryKey | null;
  openPrevious: { item: TaskDto; index: number } | null;
  detailKey: QueryKey | null;
  readKeys: QueryKey[];
};

const CLOSED: readonly TaskStatus[] = ['done', 'released'];
const REFETCH_DEADLINE_MS = 1_500;

function summaryKeys(scope?: TaskBoardScope) {
  return scope ? Object.values(TASK_BOARD_SUMMARY_KINDS).map((kind) => taskBoardSummaryKey(kind, scope)) : [];
}

type Reconciliation = { keys: Map<string, QueryKey>; broad: boolean };

function isStaleWrite(error: unknown) {
  return error instanceof ApiError && error.code === 'conflict.stale_write';
}

function stripDetail(task: TaskDto): TaskDto {
  const { source: _source, ...rest } = task as TaskDto & { source?: unknown };
  return rest;
}

function findPosition(data: ColumnPages | undefined, taskId: string): Position | null {
  if (!data) return null;
  for (const [page, response] of data.pages.entries()) {
    const index = response.items.findIndex((item) => item.id === taskId);
    if (index >= 0) return { page, index };
  }
  return null;
}

function withoutTask(data: ColumnPages, taskId: string): ColumnPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== taskId),
    })),
  };
}

function withTotal(data: ColumnPages, delta: number): ColumnPages {
  const [first, ...rest] = data.pages;
  const total = first?.page?.total;
  if (!first || !first.page || total === undefined) return data;
  return {
    ...data,
    pages: [{ ...first, page: { ...first.page, total: Math.max(0, total + delta) } }, ...rest],
  };
}

function hasTotal(data: ColumnPages | undefined): boolean {
  return data?.pages[0]?.page?.total !== undefined;
}

function withTaskAt(data: ColumnPages, task: TaskDto, at: Position | null): ColumnPages {
  const cleaned = withoutTask(data, task.id);
  const pageIndex = Math.min(at?.page ?? 0, cleaned.pages.length - 1);
  return {
    ...cleaned,
    pages: cleaned.pages.map((page, index) => {
      if (index !== pageIndex) return page;
      const items = [...page.items];
      items.splice(Math.min(at?.index ?? 0, items.length), 0, task);
      return { ...page, items };
    }),
  };
}

function locate(
  client: QueryClient,
  caches: Extract<TaskBoardCaches, { mode: 'status' }>,
  task: TaskDto,
): TaskStatus {
  // A queued second move can carry a stale Task object; trust the loaded cache first.
  for (const status of TASK_BOARD_STATUS_COLUMNS) {
    const data = client.getQueryData<ColumnPages>(caches.columnKey(status));
    if (findPosition(data, task.id)) return status;
  }
  return task.status;
}

export function useTaskStatusTransition(caches: TaskBoardCaches, scopeKey = '') {
  const client = useQueryClient();
  const { notifyError } = useHostSeam();
  const mutationTokens = React.useRef(new Map<string, number>());
  const pendingDeltas = React.useRef(new Set<Delta>());
  const queued = React.useRef<Reconciliation | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = React.useRef(false);
  const currentBoard = React.useRef({ caches, scopeKey });
  const reads = React.useRef(0);
  const [isReconciling, setIsReconciling] = React.useState(false);

  const flush = React.useCallback(() => {
    const batch = queued.current;
    if (!batch) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    queued.current = null;
    for (const delta of pendingDeltas.current) {
      for (const key of delta.readKeys) batch.keys.set(hashKey(key), key);
    }
    reads.current += 1;
    if (mounted.current) setIsReconciling(true);
    if (batch.broad) {
      for (const query of client.getQueryCache().findAll({ queryKey: ['tasks'], type: 'active' })) {
        batch.keys.set(query.queryHash, query.queryKey);
      }
    }
    const activeKeys = Array.from(batch.keys.values(), (queryKey) => ({
      queryKey, exact: true, type: 'active' as const,
    }));
    // Refetch alone can reuse an in-flight first read with no cached data.
    const cancellations = Promise.all(activeKeys.map((key) =>
      client.cancelQueries({
        ...key,
        fetchStatus: 'fetching',
        predicate: (query) => query.state.data === undefined,
      }),
    ));
    // Cancellation reverts query state, so mark it stale after cancelling.
    void client.invalidateQueries({ queryKey: ['tasks'], refetchType: 'none' });
    const touched = activeKeys.map(async (active) => {
      await cancellations;
      const { queryKey } = active;
      if (queryKey[0] === 'task') {
        void client.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
      }
      await client.refetchQueries(active);
    });
    void Promise.all(touched).finally(() => {
      reads.current -= 1;
      if (mounted.current && reads.current === 0 && !queued.current) {
        setIsReconciling(false);
      }
    });
  }, [client]);

  React.useLayoutEffect(() => {
    currentBoard.current = { caches, scopeKey };
  }, [caches, scopeKey]);

  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flush();
    };
  }, [flush]);

  const previousScope = React.useRef(scopeKey);
  React.useEffect(() => {
    if (previousScope.current !== scopeKey) flush();
    previousScope.current = scopeKey;
  }, [scopeKey, flush]);

  React.useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual)
          return;
        // A deadline read may finish with moves still outstanding. Rebase each invocation's
        // delta on fresh server pages, so its later rollback undoes only the reapplied change.
        const key = event.query.queryHash;
        for (const delta of pendingDeltas.current) {
          if (mutationTokens.current.get(delta.taskId) !== delta.token) continue;
          if (delta.sourceKey && hashKey(delta.sourceKey) === key) {
            client.setQueryData<ColumnPages>(delta.sourceKey, (old) => {
              if (!old) return old;
              const position = findPosition(old, delta.taskId);
              const item = position ? old.pages[position.page]?.items[position.index] : undefined;
              if (item) delta.previous = item;
              delta.sourceRemovedAt = position;
              delta.sourceTotalAdjusted = hasTotal(old);
              return withTotal(withoutTask(old, delta.taskId), -1);
            });
          }
          if (delta.targetKey && hashKey(delta.targetKey) === key) {
            client.setQueryData<ColumnPages>(delta.targetKey, (old) => {
              if (!old) return old;
              const alreadyHere = findPosition(old, delta.taskId) !== null;
              delta.targetInserted = !alreadyHere;
              delta.targetTotalAdjusted = !alreadyHere && hasTotal(old);
              const next = withTaskAt(old, { ...delta.previous, status: delta.target }, null);
              return delta.targetTotalAdjusted ? withTotal(next, 1) : next;
            });
          }
          if (delta.openKey && hashKey(delta.openKey) === key) {
            client.setQueryData<ListTasksResponse>(delta.openKey, (old) => {
              if (!old) return old;
              const index = old.items.findIndex((item) => item.id === delta.taskId);
              const item = old.items[index];
              delta.openPrevious = item ? { item, index } : null;
              return {
                ...old,
                items: CLOSED.includes(delta.target)
                  ? old.items.filter((item) => item.id !== delta.taskId)
                  : old.items.map((item) =>
                      item.id === delta.taskId ? { ...item, status: delta.target } : item,
                    ),
              };
            });
          }
          if (delta.detailKey && hashKey(delta.detailKey) === key) {
            client.setQueryData<TaskDetailDto>(delta.detailKey, (old) => {
              if (!old) return old;
              delta.previous = stripDetail(old);
              return { ...old, status: delta.target };
            });
          }
        }
      }),
    [client],
  );

  function queueReconciliation(delta: Delta | undefined, { broad }: { broad: boolean }) {
    const batch = (queued.current ??= { keys: new Map(), broad: false });
    batch.broad ||= broad || !mounted.current;
    for (const key of delta?.readKeys ?? []) batch.keys.set(hashKey(key), key);
    const active = currentBoard.current;
    if (delta && delta.scopeKey !== active.scopeKey && active.caches.mode !== 'detail') {
      const board = active.caches;
      const lists = board.mode === 'open'
        ? [board.openKey]
        : [board.columnKey(delta.previous.status), board.columnKey(delta.target)];
      for (const key of [...lists, ...summaryKeys(board.summaryScope)]) batch.keys.set(hashKey(key), key);
    }
    // onSettled still counts this invocation. Never extend the oldest settlement's deadline.
    const overlapping = client.isMutating({ mutationKey: ['task-status-transition'] }) > 1;
    if (!overlapping || !mounted.current) {
      flush();
      return;
    }
    setIsReconciling(true);
    void client.invalidateQueries({ queryKey: ['tasks'], refetchType: 'none' });
    if (timer.current === null) timer.current = setTimeout(flush, REFETCH_DEADLINE_MS);
  }

  function rollback(delta: Delta) {
    if (delta.targetKey && delta.targetInserted) {
      client.setQueryData<ColumnPages>(delta.targetKey, (old) => {
        if (!old) return old;
        const pos = findPosition(old, delta.taskId);
        const here = pos ? old.pages[pos.page]?.items[pos.index] : undefined;
        // Only remove the membership this invocation inserted.
        const next = here?.status === delta.target ? withoutTask(old, delta.taskId) : old;
        return delta.targetTotalAdjusted ? withTotal(next, -1) : next;
      });
    } else if (delta.targetKey && delta.targetTotalAdjusted) {
      client.setQueryData<ColumnPages>(delta.targetKey, (old) => old && withTotal(old, -1));
    }
    if (delta.sourceKey) {
      client.setQueryData<ColumnPages>(delta.sourceKey, (old) => {
        if (!old) return old;
        const restored = delta.sourceRemovedAt
          ? withTaskAt(old, delta.previous, delta.sourceRemovedAt)
          : old;
        return delta.sourceTotalAdjusted ? withTotal(restored, 1) : restored;
      });
    }
    if (delta.openKey && delta.openPrevious) {
      const { item, index } = delta.openPrevious;
      client.setQueryData<ListTasksResponse>(delta.openKey, (old) => {
        if (!old) return old;
        const items = old.items.filter((candidate) => candidate.id !== item.id);
        items.splice(Math.min(index, items.length), 0, item);
        return { ...old, items };
      });
    }
    if (delta.detailKey) {
      client.setQueryData<TaskDetailDto>(delta.detailKey, (old) =>
        old ? { ...old, status: delta.previous.status } : old,
      );
    }
  }

  const mutation = useMutation({
    mutationKey: ['task-status-transition'],
    mutationFn: ({ task, status }: { task: TaskDto; status: TaskStatus }) =>
      updateTaskStatus(task.id, status, { ifMatch: task.updated_at, idempotencyKey: mintIdempotencyKey() }),
    onMutate: async ({ task, status }): Promise<Delta> => {
      const token = (mutationTokens.current.get(task.id) ?? 0) + 1;
      mutationTokens.current.set(task.id, token);
      const delta: Delta = {
        taskId: task.id,
        scopeKey,
        token,
        previous: stripDetail(task),
        target: status,
        sourceKey: null,
        targetKey: null,
        sourceRemovedAt: null,
        sourceTotalAdjusted: false,
        targetInserted: false,
        targetTotalAdjusted: false,
        openKey: null,
        openPrevious: null,
        detailKey: null,
        readKeys: [['task', task.id]],
      };
      if (caches.mode !== 'detail') delta.readKeys.push(...summaryKeys(caches.summaryScope));
      if (caches.mode === 'open') {
        delta.readKeys.push(caches.openKey);
        const beforeCancel = client.getQueryData<ListTasksResponse>(caches.openKey);
        if (beforeCancel?.items.some((item) => item.id === task.id)) {
          await client.cancelQueries({ queryKey: caches.openKey, exact: true });
        }
        const open = client.getQueryData<ListTasksResponse>(caches.openKey);
        const index = open?.items.findIndex((item) => item.id === task.id) ?? -1;
        const item = open?.items[index];
        if (open && item) {
          delta.openKey = caches.openKey;
          delta.openPrevious = { item, index };
          client.setQueryData<ListTasksResponse>(caches.openKey, {
            ...open,
            items: CLOSED.includes(status)
              ? open.items.filter((candidate) => candidate.id !== task.id)
              : open.items.map((candidate) =>
                  candidate.id === task.id ? { ...candidate, status } : candidate,
                ),
          });
        }
        pendingDeltas.current.add(delta);
        return delta;
      }
      if (caches.mode === 'detail') {
        if (client.getQueryData(caches.detailKey)) {
          await client.cancelQueries({ queryKey: caches.detailKey, exact: true });
        }
        const detail = client.getQueryData<TaskDetailDto>(caches.detailKey);
        if (detail) {
          delta.detailKey = caches.detailKey;
          delta.previous = stripDetail(detail);
          client.setQueryData<TaskDetailDto>(caches.detailKey, {
            ...detail,
            status,
          });
        }
        pendingDeltas.current.add(delta);
        return delta;
      }
      const sourceStatus = locate(client, caches, task);
      const sourceKey = caches.columnKey(sourceStatus);
      const targetKey = caches.columnKey(status);
      delta.readKeys.push(sourceKey, targetKey);
      if (sourceStatus === status) return delta;
      const sourceBeforeLoad = client.getQueryData<ColumnPages>(sourceKey);
      if (!findPosition(sourceBeforeLoad, task.id) && !caches.includesFallback(task)) return delta;
      // A destination without data cannot render the moved card: load it before writing.
      if (!client.getQueryData(targetKey)) await caches.ensureColumn(status);
      await Promise.all([sourceKey, targetKey]
        .filter((key) => client.getQueryData(key) !== undefined)
        .map((queryKey) => client.cancelQueries({ queryKey, exact: true })));
      const source = client.getQueryData<ColumnPages>(sourceKey);
      const position = findPosition(source, task.id);
      const current = position ? source?.pages[position.page]?.items[position.index] : undefined;
      delta.previous = stripDetail(current ?? task);
      if (source) {
        delta.sourceKey = sourceKey;
        delta.sourceRemovedAt = position;
        delta.sourceTotalAdjusted = hasTotal(source);
        client.setQueryData<ColumnPages>(sourceKey, withTotal(withoutTask(source, task.id), -1));
      }
      const target = client.getQueryData<ColumnPages>(targetKey);
      if (target) {
        delta.targetKey = targetKey;
        delta.targetInserted = true;
        delta.targetTotalAdjusted = hasTotal(target);
        client.setQueryData<ColumnPages>(
          targetKey,
          withTotal(withTaskAt(target, { ...delta.previous, status }, null), 1),
        );
      }
      pendingDeltas.current.add(delta);
      return delta;
    },
    onError: (error, _variables, context) => {
      if (context) pendingDeltas.current.delete(context);
      const latest = context && mutationTokens.current.get(context.taskId) === context.token;
      if (context && latest) rollback(context);
      if (isStaleWrite(error)) queueReconciliation(context, { broad: true });
      if (caches.mode !== 'detail' || !mounted.current)
        notifyError(mapUnknownError(error).message);
    },
    onSuccess: (data, _variables, context) => {
      if (context) pendingDeltas.current.delete(context);
      if (context?.detailKey) client.setQueryData(context.detailKey, data);
      void invalidateRecovery(client);
    },
    onSettled: (_data, error, _variables, context) => {
      const staleWrite = isStaleWrite(error);
      if (!staleWrite || queued.current) {
        queueReconciliation(context, { broad: caches.mode === 'detail' || staleWrite });
      }
    },
  });
  return { ...mutation, isReconciling };
}
