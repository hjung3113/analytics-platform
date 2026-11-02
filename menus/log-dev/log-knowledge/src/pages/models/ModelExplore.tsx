import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { ApiResponse, GroupedPageResult, TableQuery } from '@ap/contracts';
import { PlatformLink, useMenuFetch, usePlatform } from '@ap/kernel';
import { ManagementLayout, PlatformDataTable, PlatformPage, RowAction, TableUrlWarning, encodeTableSort, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { Button, SearchInput, StatusBadge } from '@ap/ui';
import { CATALOG_MANAGE_PERMISSION, MODEL_SORT_IDS, exploreModelsEndpoint, type CatalogPageParams, type ExploreModelRow } from '../../endpoints';
import { chosenIds, defaultFilterParams, isRowMuted } from '../catalogModel';
import { filterSpecsFor } from '../CatalogTable';
import { useCatalogOptions } from '../useCatalogOptions';
import { DEFAULT_SORT, instantText, splitProcesses, statusText } from './modelPresentation';

const FIELD_NAME = { active: '활성', vendorId: '제조사', processes: '공정' } as const;

function ProcessBadges({ processes }: { processes: ExploreModelRow['processes'] }) {
  if (processes.length === 0) return <span className="text-text-muted">미분류</span>;
  const { shown, hidden } = splitProcesses(processes);
  const hiddenNames = hidden.map(p => p.name).join(', ');
  return <span className="flex items-center gap-1">
    {shown.map(p => <StatusBadge key={p.id} tone="info">{p.name}</StatusBadge>)}
    {hidden.length > 0 && <span className="text-xs text-text-secondary" title={hiddenNames}>+{hidden.length}<span className="sr-only"> ({hiddenNames})</span></span>}
  </span>;
}

/**
 * 모델 탐색 (#1197 s1, owner-confirmed variant A): one server-paged table of equipment models. 제조사·공정·활성 narrow it through the
 * filter row (repeated hidden page key `filter`); a row opens the 모델 공통 프로파일 and returns here with the same table state.
 */
export default function ModelExplore() {
  const { pageParam, pageParams, setPage, linkTo, navigate, can } = usePlatform();
  const q = pageParam('q') ?? '';
  const pages = useMenuFetch(exploreModelsEndpoint as unknown as Parameters<typeof useMenuFetch<CatalogPageParams, GroupedPageResult<ExploreModelRow>>>[0]);
  const options = useCatalogOptions({ vendors: true, processes: true, models: false });
  const chosenKey = pageParams('filter').join('\n');
  const specs = useMemo(() => filterSpecsFor('model', options, chosenIds(chosenKey === '' ? [] : chosenKey.split('\n')), options.labels), [options, chosenKey]);
  const urlFilters = useMemo(() => ({ key: 'filter', specs, labels: FIELD_NAME as Record<string, string> }), [specs]);
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(MODEL_SORT_IDS, { filters: urlFilters });

  // A bare address opens with the 활성 filter and the default sort, once per arrival. The sort is written with it; the ref keeps a later explicit
  // clear (filters, then sort) from re-applying the default while the page stays open. Any state in the address at arrival also counts as seen.
  const rawSort = pageParam('sort'), rawPage = pageParam('page'), rawQ = pageParam('q'), hasFilter = pageParams('filter').length > 0;
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (rawSort === null && rawPage === null && !hasFilter && rawQ === null) setPage({ sort: encodeTableSort([DEFAULT_SORT]), filter: defaultFilterParams() }, { replace: true });
  }, [rawSort, rawPage, rawQ, hasFilter, setPage]);

  const [draft, setDraft] = useState<{ applied: string; text: string }>({ applied: q, text: q });
  if (draft.applied !== q) setDraft({ applied: q, text: q });
  const commit = () => { if (draft.text.trim() !== q) setPage({ q: draft.text.trim() === '' ? null : draft.text.trim(), page: null }); };
  const search = <SearchInput placeholder="모델 코드·이름 검색" value={draft.text} onValueChange={text => setDraft({ applied: q, text })} onCommit={commit} />;

  const columns = useMemo<PlatformColumn<ExploreModelRow>[]>(() => [
    { id: 'code', header: '모델 코드', size: 100, cell: r => <PlatformLink className="t-mono text-accent-primary hover:underline" href={linkTo('log-knowledge-model', { params: { modelId: r.id }, returnTo: true })}>{r.code}</PlatformLink> },
    { id: 'name', header: '모델명', size: 140 },
    { id: 'vendorName', header: '제조사', size: 124 },
    { id: 'processNames', header: '공정', size: 160, sortable: false, exportValue: r => r.processes.map(p => p.name).join(', '), cell: r => <ProcessBadges processes={r.processes} /> },
    { id: 'softwareCount', header: '활성 SW', size: 88, align: 'right', exportValue: r => r.softwareCount,
      cell: r => (r.softwareCount === 0 ? <span className="font-semibold text-text-warning-label">활성 SW 0</span> : <span className="tabular">{r.softwareCount}</span>) },
    { id: 'modelItemCount', header: '공통 Item', size: 88, align: 'right', sortable: false, exportValue: r => r.modelItemCount, cell: r => <span className="tabular">{r.modelItemCount}</span> },
    { id: 'active', header: '상태', size: 100, filter: specs.active, filterPinned: 1, filterLabel: FIELD_NAME.active, exportValue: r => statusText(r.active),
      cell: r => <StatusBadge tone={r.active ? 'success' : 'neutral'}>{statusText(r.active)}</StatusBadge> },
    { id: 'updatedAt', header: '최근 변경', size: 176, cell: r => <span className="tabular">{instantText(r.updatedAt)}</span> },
  ], [specs, linkTo]);

  const fields = useMemo<TableFilterField[]>(() => (['vendorId', 'processes'] as const).flatMap((id, i) => {
    const spec = specs[id];
    return spec ? [{ id, label: { ko: FIELD_NAME[id], en: FIELD_NAME[id] }, spec, pinned: i + 2 }] : [];
  }), [specs]);

  if (invalid) return <PlatformPage description="설비 모델을 제조사·공정으로 좁혀 찾고, 모델 공통 프로파일을 엽니다."><TableUrlWarning search={search} sentences={sentences} recoverKeys={recoverKeys} cause={cause} /></PlatformPage>;
  const loadPage = async (query: TableQuery, signal: AbortSignal): Promise<ApiResponse<GroupedPageResult<ExploreModelRow>>> =>
    pages.fetch({ q: q === '' ? null : q, ...query, sorting: query.sorting.length > 0 ? query.sorting : [DEFAULT_SORT] }, signal);
  return <PlatformPage description="설비 모델을 제조사·공정으로 좁혀 찾고, 모델 공통 프로파일을 엽니다."
    primaryAction={can(CATALOG_MANAGE_PERMISSION) && <Button asChild><PlatformLink href={linkTo('log-knowledge-catalog', { page: { tab: 'model', filter: defaultFilterParams() } })}>모델 등록</PlatformLink></Button>}>
    <ManagementLayout table={<PlatformDataTable<ExploreModelRow>
      title="모델 목록" ariaLabel="모델 목록" columns={columns} getRowId={r => r.id} filterKey={q} preferenceKey="log-knowledge-models:v1" pageSize={25}
      urlState={urlState} loadPage={loadPage} search={search} filterFields={fields} isRowMuted={isRowMuted}
      rowAction={(r, { compact }) => <RowAction compact={compact} icon={ExternalLink} label={`${r.code} 프로파일 열기`} text="열기" onClick={() => navigate(linkTo('log-knowledge-model', { params: { modelId: r.id }, returnTo: true }))} />}
    />} />
  </PlatformPage>;
}
