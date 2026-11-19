import type { TaskRequestDto } from '@ap/feature-shared';
import { type QueryClient, skipToken, useQuery } from '@tanstack/react-query';

type TaskRequestRead = { order: number; item: TaskRequestDto };
type TaskRequestReadState =
  | { denied: true; order: number; latest?: TaskRequestRead }
  | { denied: false; latest: TaskRequestRead };
type TaskRequestReadStates = Record<string, TaskRequestReadState | undefined>;

let readOrder = 0;

export function startTaskRequestRead(): number {
  return ++readOrder;
}

const readKey = ['task-request-read-denial'] as const;

export function taskRequestReadStateKey(id: string): string {
  return id.toLowerCase();
}

export function useTaskRequestReadStates() {
  // This cache belongs to the feature session. Keep the denial and the winning
  // projection across filter changes and the ordinary queue/detail cache expiry.
  return useQuery<TaskRequestReadStates>({ queryKey: readKey, queryFn: skipToken, gcTime: Infinity }).data;
}

export function recordTaskRequestDenial(client: QueryClient, id: string): void {
  const order = startTaskRequestRead();
  const key = taskRequestReadStateKey(id);
  client.setQueryData<TaskRequestReadStates>(readKey, (states) => ({ ...states, [key]: { denied: true, order } }));
}

export function recordTaskRequestReads(
  client: QueryClient,
  items: readonly TaskRequestDto[],
  order: number,
  recoversDenial = false,
): void {
  client.setQueryData<TaskRequestReadStates>(readKey, (states) => {
    if (!states) return undefined;
    let next: TaskRequestReadStates | undefined;
    for (const item of items) {
      const key = taskRequestReadStateKey(item.id);
      const state = states[key];
      if (!state || (state.denied && order <= state.order)) continue;
      // Order reads by start so a late earlier response, a cached page, or
      // a new page containing other IDs cannot restore old fields.
      const latest = state.latest && state.latest.order > order ? state.latest : { order, item };
      const recovered = state.denied && recoversDenial;
      if (recovered || latest !== state.latest) {
        (next ??= { ...states })[key] = recovered ? { denied: false, latest } : { ...state, latest };
      }
    }
    return next;
  });
}

export function recordTaskRequestDecision(client: QueryClient, item: TaskRequestDto): void {
  const key = taskRequestReadStateKey(item.id);
  client.setQueryData<TaskRequestReadStates>(readKey, (states) => {
    const state = states?.[key];
    if (!state || state.denied) return undefined;
    if (Date.parse(item.updated_at) < Date.parse(state.latest.item.updated_at)) return undefined;
    // The decision updates the request fields. Its payload does not project source access.
    const latest = { ...state.latest, item: { ...item, source: state.latest.item.source } };
    return { ...states, [key]: { denied: false, latest } };
  });
}

export function applyTaskRequestVocSource(item: TaskRequestDto, state: TaskRequestReadState | undefined): TaskRequestDto {
  if (item.source_type !== 'voc' || !state) return item;
  const source = state.denied ? undefined : state.latest.item.source;
  return source === item.source ? item : { ...item, source };
}
