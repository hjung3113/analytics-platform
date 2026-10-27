import { useEffect, useRef, useState, type RefObject } from 'react';
import { clientCorrelationId, serializeGlobal, type ApiResponse, type PageQuery, type PageResult, type PageSort } from '@ap/contracts';
import { usePlatform, useQueryContext } from '@ap/kernel';
import type { TableUrlState } from './PlatformDataTable';

type PagedRowsInput<T> = {
  loadPage: (query: PageQuery, signal: AbortSignal) => Promise<ApiResponse<PageResult<T>>>;
  filterKey: string;
  urlState: TableUrlState | undefined;
  pageSize: number;
  /** The table's active sort (`urlState.sorting` when controlled). */
  activeSorting: PageSort[];
  viewport: RefObject<HTMLDivElement | null>;
  /** Runs inside the Context-change effect, after the page reset: the table clears selection and aborts export/copy there. */
  onContextChange: () => void;
};

/**
 * Server paging for the table: Context identity, the effective page, the load effect with its own AbortController,
 * and the settled/loading view of the last response. Effect order matters: the Context reset runs before the load.
 */
export function usePagedRows<T>(input: PagedRowsInput<T>) {
  const { filterKey, urlState, pageSize, activeSorting, viewport } = input;
  const { user, revision } = usePlatform();
  const global = useQueryContext();
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ identity: string; response: ApiResponse<PageResult<T>> } | null>(null);

  // Context identity: global Context narrowed to the applied Condition preset (06 §15) + user + page filters + adapter revision. Selection never survives a Context change (DESIGN Tables).
  const contextIdentity = JSON.stringify([serializeGlobal(global), user.id, filterKey, revision]);
  const lastContext = useRef(contextIdentity);
  const hasUrlState = !!urlState;
  const effectivePage = urlState ? (urlState.page ?? 1) - 1 : lastContext.current === contextIdentity ? page : 0;
  const contextChangeRef = useRef(input.onContextChange);
  contextChangeRef.current = input.onContextChange;
  useEffect(() => {
    if (lastContext.current !== contextIdentity) {
      lastContext.current = contextIdentity; if (!hasUrlState) setPage(0); contextChangeRef.current();
      if (viewport.current) viewport.current.scrollTop = 0;
    }
  }, [contextIdentity, hasUrlState, viewport]);
  const requestIdentity = JSON.stringify([contextIdentity, effectivePage, activeSorting, retry]);
  const loadRef = useRef(input.loadPage);
  loadRef.current = input.loadPage;
  useEffect(() => {
    const controller = new AbortController();
    loadRef.current({ page: effectivePage, pageSize, sorting: activeSorting }, controller.signal)
      .then(response => { if (!controller.signal.aborted) setResult({ identity: requestIdentity, response }); })
      .catch(error => {
        // Only the table's own abort cancels (#186, like the Kernel #183): a menu loadPage that rejects with
        // its own DOMException('…','AbortError') (internal timeout) is an error result, never swallowed.
        if (controller.signal.aborted) return;
        setResult({
          identity: requestIdentity,
          response: {
            outcome: 'error', data: null, assessments: [], trust: null,
            correlationId: clientCorrelationId(), message: String(error),
          },
        });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestIdentity already encodes page, sort and page size; the effect re-runs only when it changes
  }, [requestIdentity]);

  // Same Context (page/sort/retry) keeps the last rows visible while loading; a new Context hides them.
  const sameContext = result !== null && JSON.parse(result.identity)[0] === contextIdentity;
  const shown = sameContext ? result!.response : null;
  const shownPage = shown
    ? (JSON.parse(result!.identity) as [string, number])[1]
    : effectivePage;
  const loading = result?.identity !== requestIdentity;
  const data = shown?.outcome === 'ok' ? shown.data! : { rows: [] as T[], total: shown?.data?.total ?? 0 };

  const pageCount = Math.max(1, Math.ceil(data.total / pageSize));
  // 06 §19: a failed lookup (error·timeout·forbidden·too_large) is not a zero — only a successful
  // response (ok, or empty which IS a successful zero) may state a count or offer pages.
  const success = shown !== null && (shown.outcome === 'ok' || shown.outcome === 'empty');
  // #314: a successful page past the end. While the clamped refetch is in flight the status line keeps the
  // loading text; once that response has settled and the clamp was already notified (a consumer may ignore it),
  // it falls back to count + total pages only — never "9/3", never a page number that was not received.
  const outOfRange = success && shownPage >= pageCount;
  // `result.identity` repeats for the same page (9 → 3 → 9). Remember the result object so this effect
  // re-running on that same object does not clamp twice; a later response is a new object and clamps again.
  const clampedFor = useRef<typeof result>(null);
  useEffect(() => {
    if (loading || !outOfRange || result === null) return;
    if (clampedFor.current === result) return;
    clampedFor.current = result;
    if (urlState) urlState.onChange({ sorting: activeSorting, page: pageCount === 1 ? null : pageCount }, 'clamp');
    else setPage(pageCount - 1);
  }, [loading, outOfRange, result, pageCount, activeSorting, urlState]);

  return { setPage, retry: () => setRetry(r => r + 1), effectivePage, shown, shownPage, loading, data, pageCount, success, outOfRange };
}
