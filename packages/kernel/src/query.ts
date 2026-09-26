import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from './platform';
import { type ApiResponse, serializeGlobal } from '@ap/contracts';

export type QueryState<T> = {
  /** loading: no result for the current Context yet. refreshing: same Context re-query, prior result kept. */
  status: 'loading' | 'refreshing' | 'done';
  response: ApiResponse<T> | null;
  refetch: () => void;
};

/**
 * Platform request lifecycle (§11/§19). The identity of a result is (adapter revision, user, global Context, page inputs):
 * when it changes the previous result is hidden immediately and late responses are discarded. The revision covers
 * server-side changes the URL cannot show (session switch, dev response scenario).
 */
export function usePlatformQuery<T>(run: (signal: AbortSignal) => Promise<ApiResponse<T>>, pageInputs: unknown = null, enabled = true): QueryState<T> {
  const { global, user, revision } = usePlatform();
  const identity = JSON.stringify([revision, user.id, serializeGlobal(global), pageInputs]);
  const [result, setResult] = useState<{ identity: string; response: ApiResponse<T> } | null>(null);
  const [tick, setTick] = useState(0);
  const [inFlight, setInFlight] = useState<{ identity: string; tick: number } | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setInFlight({ identity, tick });
    runRef.current(controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setResult({ identity, response });
      setInFlight(null);
    }).catch(error => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      setResult({ identity, response: { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'client-' + Date.now().toString(16), message: String(error) } });
      setInFlight(null);
    });
    return () => controller.abort();
  }, [identity, tick, enabled]);

  const refetch = useCallback(() => setTick(t => t + 1), []);
  const current = result?.identity === identity ? result.response : null;
  const busy = inFlight?.identity === identity || (enabled && !current);
  return { status: !current ? 'loading' : busy ? 'refreshing' : 'done', response: current, refetch };
}
