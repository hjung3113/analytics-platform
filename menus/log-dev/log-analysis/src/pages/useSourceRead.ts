import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ApiResponse, EndpointSpec } from '@ap/contracts';
import { useMenuFetch, usePlatform } from '@ap/kernel';

/** A caller-driven read: abort on condition/session changes; never show the previous source body under a new identity. */
export function useSourceRead<P, T>(endpoint: EndpointSpec<P, T>, params: P, enabled = true) {
  const request = useMenuFetch(endpoint);
  const { revision, user } = usePlatform();
  const latest = useRef(request.fetch);
  useLayoutEffect(() => { latest.current = request.fetch; });
  const [round, setRound] = useState(0);
  const [activation, setActivation] = useState({ enabled, epoch: 0 });
  const epoch = activation.enabled === enabled ? activation.epoch : activation.epoch + 1;
  if (activation.enabled !== enabled) setActivation({ enabled, epoch });
  const key = JSON.stringify([endpoint.id, params, revision, user.id, round, enabled, epoch]);
  const [settled, setSettled] = useState<{ key: string; response: ApiResponse<T> | null; cancelled: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const ready = request.ready;
  useEffect(() => {
    if (!enabled || !ready) return;
    const abort = new AbortController();
    controller.current = abort;
    void latest.current(params, abort.signal).then(response => {
      if (!abort.signal.aborted) setSettled({ key, response, cancelled: response.message === 'aborted' });
    }).catch(() => {
      if (!abort.signal.aborted) setSettled({ key, response: null, cancelled: false });
    });
    return () => abort.abort();
    // key is the serialized request identity; params objects are rebuilt during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key includes every param and session field; latest updates in layout effect
  }, [key, enabled, ready]);
  const result = settled?.key === key ? settled : null;
  return { response: result?.response ?? null, loading: enabled && ready && result === null, cancelled: result?.cancelled ?? false, failed: result !== null && !result.cancelled && (!result.response || result.response.outcome !== 'ok'), cancel: () => { controller.current?.abort(); setSettled({ key, response: null, cancelled: true }); }, retry: () => setRound(n => n + 1) };
}
