import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clientCorrelationId, type ApiResponse, type Outcome } from '@ap/contracts';

/**
 * Internal (not exported from the package): the lifecycle of a cursor-paged list whose first page is read elsewhere
 * (a `usePlatformQuery`) and whose later pages are appended on demand. Domain-blind — items, ids and the order
 * come from the caller. ADR-0085.
 */
export type CursorMoreStatus = 'idle' | 'loading' | 'error' | 'end';
export type CursorMoreError = { outcome: Exclude<Outcome, 'ok' | 'empty'>; message: string; correlationId: string };
export type CursorMoreLast = { seq: number; added: number; firstId: string | null };
export type CursorMore = {
  status: CursorMoreStatus;
  /** Fetches the next page. Retries the same cursor after an error; does nothing while loading, at the end or after `forbidden`. */
  load: () => void;
  error: CursorMoreError | null;
  /** New object on every successful `load` (`seq` + 1); null until one succeeds and again when the first page is replaced. */
  last: CursorMoreLast | null;
};
/**
 * The first page, as the caller read it. `key` is the read generation: it changes on every new first-page read (identity
 * change or refetch, whatever object the adapter answers with) and means "start over". While `settled` is false the
 * first page is being read again and no appended page is shown.
 */
export type FirstPage<T> = { key: number; settled: boolean; items: readonly T[]; nextCursor: string | null };
export type CursorPage<T> = { items: readonly T[]; nextCursor?: string | null };

type Tail<T> = { key: number; appended: readonly T[]; cursor: string | null; seen: readonly string[]; status: 'idle' | 'loading' | 'error'; error: CursorMoreError | null; last: CursorMoreLast | null };

function freshTail<T>(first: FirstPage<T>): Tail<T> {
  return { key: first.key, appended: [], cursor: first.nextCursor, seen: [], status: 'idle', error: null, last: null };
}

export function useCursorPages<T>(
  first: FirstPage<T> | null,
  run: (cursor: string, signal: AbortSignal) => Promise<ApiResponse<CursorPage<T>>>,
  { id, order }: { id: (item: T) => string; order: (a: T, b: T) => number },
): { items: readonly T[]; more: CursorMore } {
  const [state, setState] = useState<Tail<T> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runRef = useRef(run);
  const idRef = useRef(id);
  const orderRef = useRef(order);
  useLayoutEffect(() => { runRef.current = run; idRef.current = id; orderRef.current = order; });

  const tail = first && first.settled && state?.key === first.key ? state : null;
  const firstKey = first?.key;
  const settled = first?.settled ?? false;
  // A superseded first page (identity change, refetch, unmount) abandons the request that was appending to it.
  useEffect(() => () => { controllerRef.current?.abort(); controllerRef.current = null; }, [firstKey, settled]);

  const load = useCallback(() => {
    if (!first || !first.settled || controllerRef.current) return;
    const current = tail ?? freshTail(first);
    const cursor = current.cursor;
    if (cursor === null || current.error?.outcome === 'forbidden') return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const base = (prev: Tail<T> | null): Tail<T> => prev?.key === first.key ? prev : current;
    setState(prev => ({ ...base(prev), status: 'loading', error: null }));
    const fail = (error: CursorMoreError) => setState(prev => ({ ...base(prev), status: 'error', error }));
    runRef.current(cursor, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      controllerRef.current = null;
      if (response.outcome !== 'ok' && response.outcome !== 'empty') {
        fail({ outcome: response.outcome, message: response.message ?? '', correlationId: response.correlationId });
        return;
      }
      const next = response.data?.nextCursor ?? null;
      const seen = [...current.seen, cursor];
      if (next !== null && seen.includes(next)) {
        fail({ outcome: 'error', message: 'Cursor did not advance', correlationId: response.correlationId });
        return;
      }
      setState(prev => {
        const b = base(prev);
        const known = new Set([...first.items, ...b.appended].map(item => idRef.current(item)));
        const added: T[] = [];
        for (const item of response.data?.items ?? []) {
          const key = idRef.current(item);
          if (known.has(key)) continue;
          known.add(key);
          added.push(item);
        }
        const firstAdded = [...added].sort(orderRef.current)[0];
        return {
          ...b, appended: [...b.appended, ...added], cursor: next, seen, status: 'idle', error: null,
          last: { seq: (b.last?.seq ?? 0) + 1, added: added.length, firstId: firstAdded ? idRef.current(firstAdded) : null },
        };
      });
    }).catch(error => {
      if (controller.signal.aborted) return;
      controllerRef.current = null;
      fail({ outcome: 'error', message: String(error), correlationId: clientCorrelationId() });
    });
  }, [first, tail]);

  return useMemo(() => {
    const cursor = tail ? tail.cursor : first?.nextCursor ?? null;
    const status: CursorMoreStatus = cursor === null ? 'end'
      : !tail ? 'idle'
      : tail.status;
    return {
      items: tail ? [...(first?.items ?? []), ...tail.appended] : first?.items ?? [],
      more: { status, load, error: cursor === null ? null : tail?.error ?? null, last: tail?.last ?? null },
    };
  }, [first, tail, load]);
}
