import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMenuFetch, useMenuQuery } from '@ap/kernel';
import type { ColumnFilter } from '@ap/contracts';
import { modelsEndpoint, processesEndpoint, softwareVersionsEndpoint, vendorsEndpoint, type CatalogPageParams, type ModelRow, type ProcessRow, type VendorRow } from '../endpoints';

/** The lists the filter row chooses from: one read of up to 200 rows by name (the server's page-size cap), inactive ones included but disabled. */
const OPTION_PARAMS: CatalogPageParams = { q: null, page: 0, pageSize: 200, sorting: [{ id: 'name', desc: false }] };
const PICKER_PAGE = 50;

export type Option = { value: string; label: string; disabled: boolean };
type Named = { id: string; name: string; code: string; active: boolean };
export const toOption = (r: Named): Option => ({ value: r.id, label: `${r.name || r.code}${r.active ? '' : ' (비활성)'}`, disabled: !r.active });
const toOptions = (rows: readonly Named[] | undefined): Option[] => (rows ?? []).map(toOption);

/**
 * Reads only what the open tab needs. Writes invalidate these reads, so the options follow a save. The list is bounded (first 200 by name);
 * `filterSpecsFor` adds the values the address already chose, and `labels` remembers every name seen so those chips read as names.
 */
export function useCatalogOptions(need: { vendors: boolean; processes: boolean; models: boolean }) {
  // keepPrevious not used (#1365, ADR-0114): these reads never change their params (`OPTION_PARAMS`), a tab only opens or closes their gate, and a closed gate keeps nothing.
  const vendors = useMenuQuery(vendorsEndpoint, OPTION_PARAMS, need.vendors);
  const processes = useMenuQuery(processesEndpoint, OPTION_PARAMS, need.processes);
  const models = useMenuQuery(modelsEndpoint, OPTION_PARAMS, need.models);
  const rows = <T,>(q: { response: { outcome: string; data: { rows: T[] } | null } | null }): T[] | undefined => (q.response?.outcome === 'ok' ? q.response.data?.rows : undefined);
  const vendorRows = rows<VendorRow>(vendors), processRows = rows<ProcessRow>(processes), modelRows = rows<ModelRow>(models);
  const [labels] = useState(() => new Map<string, string>());
  const remember = useCallback((id: string, label: string) => { labels.set(id, label); }, [labels]);
  const result = useMemo(() => ({
    vendors: toOptions(vendorRows), processes: toOptions(processRows), models: toOptions(modelRows),
    loading: (need.vendors && !vendorRows) || (need.processes && !processRows) || (need.models && !modelRows),
  }), [vendorRows, processRows, modelRows, need.vendors, need.processes, need.models]);
  useEffect(() => {
    for (const list of [result.vendors, result.processes, result.models]) for (const o of list) labels.set(o.value, o.label);
  }, [result, labels]);
  return { ...result, labels, remember };
}

type Endpoint = typeof vendorsEndpoint | typeof processesEndpoint | typeof modelsEndpoint | typeof softwareVersionsEndpoint;
/** An SW version reads as its version label (the name is optional), not the name. */
const toSoftwareOption = (r: Named & { versionLabel?: string }): Option => ({ value: r.id, label: `${r.versionLabel || r.code}${r.name ? ` · ${r.name}` : ''}`, disabled: !r.active });
/**
 * A form picker over one declared read: server search (`q`) and load-more by page, so any row is reachable, not the first 200.
 * Only active rows are offered; `extraFilters` adds conditions (e.g. an SW version's `modelId`). The caller keeps its selected values visible (a `MultiCombobox` resolves them with `getLabel`).
 */
export function useOptionPicker(endpoint: Endpoint, enabled = true, extraFilters?: readonly ColumnFilter[]) {
  const { fetch } = useMenuFetch(endpoint as unknown as Parameters<typeof useMenuFetch<CatalogPageParams, { rows: Named[]; total: number }>>[0]);
  const fetchRef = useRef(fetch);
  useEffect(() => { fetchRef.current = fetch; });
  const filtersRef = useRef(extraFilters);
  const filterKey = JSON.stringify(extraFilters ?? []);
  useEffect(() => { filtersRef.current = extraFilters; });
  const [search, setSearch] = useState('');
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({ search: '', options: [] as Option[], total: 0, page: -1, loading: false, failed: false });
  const run = useCallback(async (text: string, page: number, signal: AbortSignal) => {
    setState(s => ({ ...s, loading: true, failed: false }));
    try {
      const params: CatalogPageParams = { q: text.trim() === '' ? null : text.trim(), page, pageSize: PICKER_PAGE, sorting: [{ id: 'name', desc: false }], filters: [{ id: 'active', op: 'in', value: ['true'] }, ...(filtersRef.current ?? [])] };
      const res = await fetchRef.current(params, signal);
      if (signal.aborted) return;
      if ((res.outcome !== 'ok' && res.outcome !== 'empty') || !res.data) { setState(s => ({ ...s, loading: false, failed: true })); return; }
      const next = res.data.rows.map(endpoint === softwareVersionsEndpoint ? toSoftwareOption : toOption);
      setState(s => page > 0 && s.search !== text ? s : ({ search: text, options: page === 0 ? next : [...s.options, ...next.filter(o => !s.options.some(x => x.value === o.value))], total: res.data!.total, page, loading: false, failed: false }));
    } catch { if (!signal.aborted) setState(s => ({ ...s, loading: false, failed: true })); }
  }, [endpoint]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const next = new AbortController();
    controller.current?.abort();
    controller.current = next;
    void run(search, 0, next.signal);
    return () => next.abort();
  }, [enabled, search, nonce, run, filterKey]);
  const loadMore = () => {
    if (state.loading || state.search !== search) return;
    const next = new AbortController();
    controller.current = next;
    void run(search, state.page + 1, next.signal);
  };
  const hasMore = state.search === search && (state.page + 1) * PICKER_PAGE < state.total;
  return { options: state.options, search, setSearch, loading: state.loading, failed: state.failed, hasMore, loadMore, retry: () => setNonce(n => n + 1) };
}
