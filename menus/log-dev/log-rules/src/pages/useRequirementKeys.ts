import { useEffect, useRef, useState } from 'react';
import { useMenuFetch, useMenuQuery } from '@ap/kernel';
import { coverageEndpoint, type CoverageData } from '../endpoints';

/** Never infer absence from one page. Query lifecycle owns identity; all later pages must share its digest. */
export function useRequirementKeys(modelId: string | null, softwareId: string | null, enabled: boolean) {
  const first = useMenuQuery(coverageEndpoint, { modelId: modelId ?? '', softwareId, page: 0, pageSize: 200 }, enabled && modelId !== null);
  const { fetch } = useMenuFetch(coverageEndpoint);
  const fetchRef = useRef(fetch);
  useEffect(() => { fetchRef.current = fetch; });
  const response = first.response;
  const data = response?.outcome === 'ok' ? response.data : null;
  const [held, setHeld] = useState<{ response: typeof response; keys: Set<string> | null } | null>(null);
  useEffect(() => {
    if (!data?.computable || data.total <= 200 || modelId === null) return;
    const controller = new AbortController();
    const keys = new Set(data.rows.map(r => r.key));
    (async () => {
      for (let page = 1; page * 200 < data.total; page++) {
        const result = await fetchRef.current({ modelId, softwareId, page, pageSize: 200 }, controller.signal);
        const next: CoverageData | null = result.outcome === 'ok' ? result.data : null;
        if (!next?.computable || next.coverageDigest !== data.coverageDigest || next.rows.length === 0) throw new Error('incomplete coverage snapshot');
        for (const row of next.rows) keys.add(row.key);
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) setHeld({ response, keys });
    })().catch(() => { if (!controller.signal.aborted) setHeld({ response, keys: null }); });
    return () => controller.abort();
  }, [data, response, modelId, softwareId]);
  if (!data?.computable) return { status: 'loading' as const, data: null };
  if (data.total <= 200) return { status: 'done' as const, data: new Set(data.rows.map(r => r.key)) };
  return held?.response === response ? { status: 'done' as const, data: held.keys } : { status: 'loading' as const, data: null };
}
