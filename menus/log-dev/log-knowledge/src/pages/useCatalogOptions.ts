import { useMemo } from 'react';
import { useMenuQuery } from '@ap/kernel';
import { modelsEndpoint, processesEndpoint, vendorsEndpoint, type CatalogPageParams, type ModelRow, type ProcessRow, type VendorRow } from '../endpoints';

/** The lists the filters and forms choose from: one read of up to 200 rows by name (the server's page-size cap), inactive ones included but disabled. */
const OPTION_PARAMS: CatalogPageParams = { q: null, page: 0, pageSize: 200, sorting: [{ id: 'name', desc: false }] };

export type Option = { value: string; label: string; disabled: boolean };
const toOptions = (rows: readonly { id: string; name: string; code: string; active: boolean }[] | undefined): Option[] =>
  (rows ?? []).map(r => ({ value: r.id, label: `${r.name || r.code}${r.active ? '' : ' (비활성)'}`, disabled: !r.active }));

/** Reads only what the open tab needs. Writes invalidate these reads, so the options follow a save. */
export function useCatalogOptions(need: { vendors: boolean; processes: boolean; models: boolean }) {
  const vendors = useMenuQuery(vendorsEndpoint, OPTION_PARAMS, need.vendors);
  const processes = useMenuQuery(processesEndpoint, OPTION_PARAMS, need.processes);
  const models = useMenuQuery(modelsEndpoint, OPTION_PARAMS, need.models);
  const rows = <T,>(q: { response: { outcome: string; data: { rows: T[] } | null } | null }): T[] | undefined => (q.response?.outcome === 'ok' ? q.response.data?.rows : undefined);
  const vendorRows = rows<VendorRow>(vendors), processRows = rows<ProcessRow>(processes), modelRows = rows<ModelRow>(models);
  return useMemo(() => ({
    vendors: toOptions(vendorRows), processes: toOptions(processRows), models: toOptions(modelRows),
    loading: (need.vendors && !vendorRows) || (need.processes && !processRows) || (need.models && !modelRows),
  }), [vendorRows, processRows, modelRows, need.vendors, need.processes, need.models]);
}
