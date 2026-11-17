import { QueryObserver, type FetchQueryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';

/** Keep a shared fetch enabled while an imperative caller awaits it, independently of UI observers. */
export async function readSharedQuery<T>(client: QueryClient, options: FetchQueryOptions<T, Error, T, QueryKey>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const observer = new QueryObserver(client, { ...options, enabled: true, refetchOnMount: false });
  const unsubscribe = observer.subscribe(() => {});
  let onAbort: (() => void) | undefined;
  try {
    const pending = client.fetchQuery(options);
    if (!signal) return await pending;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return await Promise.race([pending, aborted]);
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    unsubscribe();
  }
}
