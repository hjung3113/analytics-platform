import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { ApiResponse, ColumnFilterSpec, PageResult, TableQuery } from '@ap/contracts';
import { PlatformLink, useMenuFetch, usePlatform } from '@ap/kernel';
import { ManagementLayout, PlatformDataTable, PlatformPage, RowAction, TableUrlWarning, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { SearchInput } from '@ap/ui';
import { ITEM_SORT_IDS, itemFilterSpecs, itemsEndpoint, type CatalogPageParams, type ItemRow } from '../../endpoints';
import { OwnerChip, StateBadge, TypeBadge } from './ItemBadges';
import { defaultFilterParams, instantText, isRowMuted, itemNoLabel, ownerText, stateLabel, typeLabel } from './itemModel';

/** Column sizes (px) sum to 88+220+170+92+136+136+140 = 982; with the 128 px row-end 열기 column that is 1110, inside the ~1180 px content width at 1440×900 (sidebar beside it), so no horizontal scroll. */
const FIELD_NAME = { ownerKind: '소유', typeCode: '유형', verificationState: '검증 상태', processingState: '처리 상태', publicationState: '게시 상태' } as const;
/** Filter row order: 소유, 유형, 검증 상태, 처리 상태, 게시 상태. A field that is also a column (유형, 검증, 처리) rides on its column; the shared id space allows no second declaration. */
const FIELD_PINNED = { ownerKind: 1, publicationState: 5 } as const;
const SPECS: Record<string, ColumnFilterSpec> = Object.fromEntries(Object.keys(FIELD_NAME).map(id => [id, itemFilterSpecs[id]!]));

function ItemTable({ q }: { q: string }) {
  const { setPage, linkTo } = usePlatform();
  const pages = useMenuFetch(itemsEndpoint) as unknown as ReturnType<typeof useMenuFetch<CatalogPageParams, PageResult<ItemRow>>>;
  const urlFilters = useMemo(() => ({ key: 'filter', specs: SPECS, labels: FIELD_NAME as Record<string, string> }), []);
  const { urlState, invalid, sentences, recoverKeys, cause } = useTableUrlState(ITEM_SORT_IDS, { filters: urlFilters });
  const [draft, setDraft] = useState<{ applied: string; text: string }>({ applied: q, text: q });
  if (draft.applied !== q) setDraft({ applied: q, text: q });
  const commit = () => { if (draft.text.trim() !== q) setPage({ q: draft.text.trim() === '' ? null : draft.text.trim(), page: null }); };
  const search = <SearchInput placeholder="제목·Item ID(KI-12) 검색" value={draft.text} onValueChange={text => setDraft({ applied: q, text })} onCommit={commit} />;
  const href = (row: ItemRow) => linkTo('log-knowledge-item', { params: { itemId: row.id }, returnTo: true });

  const columns = useMemo<PlatformColumn<ItemRow>[]>(() => [
    { id: 'itemNo', header: 'Item ID', size: 100, exportValue: r => itemNoLabel(r.itemNo),
      cell: r => <PlatformLink className="t-mono text-accent-primary hover:underline" href={href(r)}>{itemNoLabel(r.itemNo)}</PlatformLink> },
    // A muted row alone would not say why: an archived item carries its 게시 state next to the title (no extra column).
    { id: 'title', header: '제목', size: 172, cell: r => <span className="flex min-w-0 items-center gap-1.5"><span className="truncate" title={r.title}>{r.title}</span>{r.publicationState !== 'published' && <StateBadge axis="publication" value={r.publicationState} />}</span> },
    { id: 'owner', header: '소유', size: 160, sortable: false, exportValue: r => `${r.owner.kind === 'software' ? 'SW' : '모델'} ${ownerText(r.owner)}`, cell: r => <OwnerChip owner={r.owner} /> },
    { id: 'typeCode', header: '유형', size: 92, sortable: false, filter: SPECS.typeCode, filterPinned: 2, exportValue: r => typeLabel(r.typeCode), cell: r => <TypeBadge code={r.typeCode} /> },
    { id: 'verificationState', header: '검증', size: 130, sortable: false, filter: SPECS.verificationState, filterPinned: 3, exportValue: r => stateLabel('verification', r.verificationState), cell: r => <StateBadge axis="verification" value={r.verificationState} /> },
    { id: 'processingState', header: '처리', size: 130, sortable: false, filter: SPECS.processingState, filterPinned: 4, exportValue: r => stateLabel('processing', r.processingState), cell: r => <StateBadge axis="processing" value={r.processingState} /> },
    { id: 'updatedAt', header: '갱신일', size: 172, cell: r => <span className="tabular whitespace-nowrap">{instantText(r.updatedAt)}</span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `href` only reads `linkTo`, which is stable per route
  ], [linkTo]);
  const fields = useMemo<TableFilterField[]>(() => (Object.keys(FIELD_PINNED) as (keyof typeof FIELD_PINNED)[]).map(id => (
    { id, label: { ko: FIELD_NAME[id], en: id }, spec: SPECS[id]!, pinned: FIELD_PINNED[id] })), []);

  if (invalid) return <TableUrlWarning search={search} sentences={sentences} recoverKeys={recoverKeys} cause={cause} />;
  const loadPage = async (query: TableQuery, signal: AbortSignal): Promise<ApiResponse<PageResult<ItemRow>>> =>
    pages.fetch({ q: q === '' ? null : q, ...query } as CatalogPageParams, signal);
  return <PlatformDataTable<ItemRow>
    title="기술 Item 목록" ariaLabel="기술 Item 목록" columns={columns} getRowId={r => r.id} filterKey={q}
    preferenceKey="log-knowledge-items:v1" pageSize={25} urlState={urlState} loadPage={loadPage} search={search}
    filterFields={fields} isRowMuted={isRowMuted}
    rowAction={(r, { compact }) => <RowAction compact={compact} icon={ExternalLink} label={`${itemNoLabel(r.itemNo)} 열기`} text="열기" link={<PlatformLink href={href(r)} />} />}
  />;
}

/**
 * 전체 기술 Item (#1197 s2, owner-confirmed variant A): one server-paged table of every model's and SW version's items. A bare address
 * opens with the 게시 상태 filter at 게시됨 (the server's default made visible); archived items show, muted, only when the filter asks.
 */
export default function ItemList() {
  const { pageParam, pageParams, setPage } = usePlatform();
  const q = pageParam('q') ?? '';
  const bare = pageParams('filter').length === 0 && pageParam('q') === null;
  useEffect(() => { if (bare) setPage({ filter: defaultFilterParams() }, { replace: true }); }, [bare, setPage]);
  return <PlatformPage description="모든 모델·SW 버전의 기술 Item을 찾습니다. Item마다 소유 대상은 하나입니다.">
    <ManagementLayout table={<ItemTable q={q} />} />
  </PlatformPage>;
}
