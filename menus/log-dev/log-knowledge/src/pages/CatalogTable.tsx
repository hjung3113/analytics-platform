import { useMemo, useState, type RefObject } from 'react';
import { PanelRight } from 'lucide-react';
import type { ApiResponse, ColumnFilterSpec, GroupedPageResult, TableQuery } from '@ap/contracts';
import { useMenuFetch, usePlatform } from '@ap/kernel';
import { PlatformDataTable, RowAction, TableUrlWarning, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { Button, SearchInput, StatusBadge } from '@ap/ui';
import {
  MODEL_SORT_IDS, PROCESS_SORT_IDS, SOFTWARE_SORT_IDS, VENDOR_SORT_IDS, modelFilterSpecs, modelsEndpoint, processFilterSpecs, processesEndpoint,
  softwareFilterSpecs, softwareVersionsEndpoint, vendorFilterSpecs, vendorsEndpoint, type CatalogPageParams, type ModelRow, type ProcessRow, type VendorRow,
} from '../endpoints';
import { TAB_LABEL, childLink, isRowMuted, softwareSummary, tabPatch, type CatalogKind, type CatalogRow } from './catalogModel';
import type { Option } from './useCatalogOptions';

const ENDPOINTS = { vendor: vendorsEndpoint, process: processesEndpoint, model: modelsEndpoint, software: softwareVersionsEndpoint } as const;
const SORT_IDS = { vendor: VENDOR_SORT_IDS, process: PROCESS_SORT_IDS, model: MODEL_SORT_IDS, software: SOFTWARE_SORT_IDS } as const;
const SPECS = { vendor: vendorFilterSpecs, process: processFilterSpecs, model: modelFilterSpecs, software: softwareFilterSpecs } as const;
const FIELD_NAME = { active: '상태', vendorId: '제조사', processes: '공정', modelId: '모델' } as const;
const NOUN = { vendor: '제조사', process: '공정', model: '모델', software: 'SW 버전' } as const;

/** The ids the URL codec and the filter line know for a tab: the wire specs with the lists the screen reads for the id fields. */
export function filterSpecsFor(kind: CatalogKind, options: { vendors: Option[]; processes: Option[]; models: Option[] }): Record<string, ColumnFilterSpec> {
  const specs: Record<string, ColumnFilterSpec> = { ...SPECS[kind] };
  const withOptions = (id: string, list: Option[]) => { const spec = specs[id]; if (spec) specs[id] = { ...spec, options: list.map(({ value, label }) => ({ value, label })) } as ColumnFilterSpec; };
  withOptions('vendorId', options.vendors); withOptions('processes', options.processes); withOptions('modelId', options.models);
  return specs;
}

function Count({ n, label, onOpen }: { n: number; label: string; onOpen: () => void }) {
  return <span className="tabular"><Button type="button" variant="link" size="sm" aria-label={label} onClick={onOpen}>{n}</Button></span>;
}

export function CatalogTable({ kind, q, focus, rowsRef, options, onTotal }: {
  kind: CatalogKind; q: string; focus: string | null;
  /** Rows of the pages this tab has read, by id: the drawer opens a row from here before it asks the server. */
  rowsRef: RefObject<Map<string, CatalogRow>>;
  options: { vendors: Option[]; processes: Option[]; models: Option[] };
  onTotal: (kind: CatalogKind, total: number) => void;
}) {
  const { setPage } = usePlatform();
  const endpoint = ENDPOINTS[kind] as unknown as Parameters<typeof useMenuFetch<CatalogPageParams, GroupedPageResult<CatalogRow>>>[0];
  const pages = useMenuFetch(endpoint);
  const specs = useMemo(() => filterSpecsFor(kind, options), [kind, options]);
  const urlFilters = useMemo(() => ({ key: 'filter', specs, labels: FIELD_NAME as Record<string, string> }), [specs]);
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(SORT_IDS[kind], { filters: urlFilters });
  const [draft, setDraft] = useState<{ applied: string; text: string }>({ applied: q, text: q });
  if (draft.applied !== q) setDraft({ applied: q, text: q });
  const commit = () => { if (draft.text.trim() !== q) setPage({ q: draft.text.trim() === '' ? null : draft.text.trim(), page: null }); };
  const search = <SearchInput placeholder={`${NOUN[kind]} 코드·이름 검색`} value={draft.text} onValueChange={text => setDraft({ applied: q, text })} onCommit={commit} />;

  const columns = useMemo<PlatformColumn<CatalogRow>[]>(() => {
    const open = (row: CatalogRow) => setPage(tabPatch(childLink(row, kind)));
    const code: PlatformColumn<CatalogRow> = { id: 'code', header: kind === 'software' ? '버전' : '코드', size: 140, cell: r => <span className="t-mono">{r.code}</span> };
    const status: PlatformColumn<CatalogRow> = {
      id: 'active', header: '상태', size: 96, filter: specs.active, filterPinned: 1, exportValue: r => (r.active ? '활성' : '비활성'),
      cell: r => <StatusBadge tone={r.active ? 'success' : 'neutral'}>{r.active ? '활성' : '비활성'}</StatusBadge>,
    };
    const name: PlatformColumn<CatalogRow> = { id: 'name', header: '이름', size: 200, cell: r => r.name || '—' };
    const updated: PlatformColumn<CatalogRow> = { id: 'updatedAt', header: '수정일', size: 120, cell: r => <span className="tabular">{r.updatedAt.slice(0, 10)}</span> };
    if (kind === 'vendor' || kind === 'process') {
      return [code, status, name, {
        id: 'modelCount', header: '모델 수', size: 96, align: 'right', exportValue: r => (r as VendorRow | ProcessRow).modelCount,
        cell: r => <Count n={(r as VendorRow | ProcessRow).modelCount} label={`${r.name} 모델 보기`} onOpen={() => open(r)} />,
      }, updated];
    }
    if (kind === 'model') {
      const models = (r: CatalogRow) => r as ModelRow;
      return [code, status, name,
        { id: 'vendorName', header: '제조사', size: 140, cell: r => models(r).vendorName },
        { id: 'processNames', header: '공정', size: 200, sortable: false, exportValue: r => models(r).processes.map(p => p.name).join(', '),
          cell: r => models(r).processes.length === 0 ? <span className="text-text-muted">미분류</span>
            : <span className="flex flex-wrap gap-1">{models(r).processes.map(p => <StatusBadge key={p.id} tone="info">{p.name}</StatusBadge>)}</span> },
        { id: 'softwareCount', header: 'SW 버전', size: 150, exportValue: r => softwareSummary(models(r)),
          cell: r => models(r).softwareCount === 0 ? '—' : <span className="inline-flex items-baseline gap-1.5">
            <span className="t-mono">{models(r).latestSoftwareLabel}</span>
            {models(r).softwareCount > 1 && <Count n={models(r).softwareCount - 1} label={`${r.name} SW 버전 ${models(r).softwareCount}개 보기`} onOpen={() => open(r)} />}
          </span> },
        updated];
    }
    return [{ ...code, id: 'versionLabel' }, status, name, updated];
  }, [kind, specs, setPage]);

  const fields = useMemo<TableFilterField[]>(() => (['vendorId', 'processes', 'modelId'] as const).flatMap((id, i) => {
    const spec = specs[id];
    return spec ? [{ id, label: { ko: FIELD_NAME[id], en: FIELD_NAME[id] }, spec, pinned: i + 2 }] : [];
  }), [specs]);

  if (invalid) return <TableUrlWarning search={search} sentences={sentences} recoverKeys={recoverKeys} cause={cause} />;
  const loadPage = async (query: TableQuery, signal: AbortSignal): Promise<ApiResponse<GroupedPageResult<CatalogRow>>> => {
    const response = await pages.fetch({ q: q === '' ? null : q, ...query }, signal);
    if (response.outcome === 'ok' && response.data) {
      for (const row of response.data.rows) rowsRef.current.set(row.id, row);
      onTotal(kind, response.data.total);
    }
    return response;
  };
  return <PlatformDataTable<CatalogRow>
    title={`${TAB_LABEL[kind]} 목록`} ariaLabel={`${TAB_LABEL[kind]} 목록`} columns={columns} getRowId={r => r.id}
    filterKey={q} preferenceKey={`log-knowledge-catalog:${kind}:v1`} activeRowId={focus} pageSize={25} urlState={urlState}
    loadPage={loadPage} search={search} filterFields={fields} isRowMuted={isRowMuted}
    rowAction={(r, { compact }) => <RowAction compact={compact} icon={PanelRight} label={`${r.code} 수정`} text="수정" onClick={() => setPage({ focus: r.id })} />}
  />;
}
