import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus } from 'lucide-react';
import { type ApiResponse, type ColumnFilterSpec, type PageResult, type TableQuery } from '@ap/contracts';
import { PlatformLink, useMenuFetch, usePlatform } from '@ap/kernel';
import { ManagementLayout, PlatformDataTable, PlatformPage, RowAction, TableUrlWarning, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { Button, SearchInput } from '@ap/ui';
import { ITEM_PUBLISH_PERMISSION, ITEM_SORT_IDS, itemFilterSpecs, itemsEndpoint, modelsEndpoint, type CatalogPageParams, type ItemRow, type ModelRow } from '../../endpoints';
import { OwnerChip, StateBadge, TypeBadge } from './ItemBadges';
import { ItemWriteDrawer } from './ItemWriteDrawer';
import { chosenOwnerModelIds, defaultFilterParams, instantText, isRowMuted, itemNoLabel, ownerText, stateLabel, typeLabel } from './itemModel';

/** Column sizes (px) sum to 88+220+170+92+136+136+140 = 982; with the 128 px row-end 열기 column that is 1110, inside the ~1180 px content width at 1440×900 (sidebar beside it), so no horizontal scroll. */
const FIELD_NAME = { ownerKind: '소유', ownerModelId: '모델', typeCode: '유형', verificationState: '검증 상태', processingState: '처리 상태', publicationState: '게시 상태' } as const;
/** Filter row order: 소유, 유형, 검증 상태, 처리 상태, 게시 상태. A field that is also a column (유형, 검증, 처리) rides on its column; the shared id space allows no second declaration. */
const FIELD_PINNED = { ownerKind: 1, publicationState: 5 } as const;
const SPECS: Record<string, ColumnFilterSpec> = Object.fromEntries(Object.keys(FIELD_NAME).map(id => [id, itemFilterSpecs[id]!]));

/** Names of the models the address filters on (`ownerModelId`), read by id in one catalog read; the id itself reads until the name arrives. */
function useModelNames(ids: readonly string[]): ReadonlyMap<string, string> {
  const { fetch } = useMenuFetch(modelsEndpoint) as unknown as ReturnType<typeof useMenuFetch<CatalogPageParams, PageResult<ModelRow>>>;
  const fetchRef = useRef(fetch);
  useEffect(() => { fetchRef.current = fetch; });
  const key = ids.join(',');
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    if (key === '') return;
    const controller = new AbortController();
    void fetchRef.current({ q: null, page: 0, pageSize: 200, sorting: [{ id: 'name', desc: false }], filters: [{ id: 'id', op: 'in', value: key.split(',') }] }, controller.signal).then(res => {
      if (controller.signal.aborted || (res.outcome !== 'ok' && res.outcome !== 'empty') || !res.data) return;
      setNames(new Map(res.data.rows.map(r => [r.id, r.name || r.code] as const)));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [key]);
  return names;
}

function ItemTable({ q }: { q: string }) {
  const { setPage, linkTo, pageParams } = usePlatform();
  const pages = useMenuFetch(itemsEndpoint) as unknown as ReturnType<typeof useMenuFetch<CatalogPageParams, PageResult<ItemRow>>>;
  const chosenKey = pageParams('filter').join('\n');
  const ownerModels = useMemo(() => chosenOwnerModelIds(chosenKey === '' ? [] : chosenKey.split('\n')), [chosenKey]);
  const modelNames = useModelNames(ownerModels);
  // The 모델 filter exists only while the address carries it (the profile's 모두 보기): its options are exactly the chosen models, named once read.
  const specs = useMemo<Record<string, ColumnFilterSpec>>(() => ({
    ...SPECS, ownerModelId: { kind: 'enum', options: ownerModels.map(value => ({ value, label: modelNames.get(value) ?? value })), ops: ['in', 'notIn'] },
  }), [ownerModels, modelNames]);
  const urlFilters = useMemo(() => ({ key: 'filter', specs, labels: FIELD_NAME as Record<string, string> }), [specs]);
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
  const fields = useMemo<TableFilterField[]>(() => [
    ...(Object.keys(FIELD_PINNED) as (keyof typeof FIELD_PINNED)[]).map(id => ({ id, label: { ko: FIELD_NAME[id], en: id }, spec: SPECS[id]!, pinned: FIELD_PINNED[id] })),
    ...(ownerModels.length > 0 ? [{ id: 'ownerModelId', label: { ko: FIELD_NAME.ownerModelId, en: 'ownerModelId' }, spec: specs['ownerModelId']!, pinned: 6 }] : []),
  ], [ownerModels, specs]);

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
  // Only holders of the publish right see write controls; the server stays the authority.
  const { can } = usePlatform();
  const canWrite = can(ITEM_PUBLISH_PERMISSION);
  const creating = canWrite && pageParam('focus') === 'new';
  const owner = pageParam('owner');
  return <PlatformPage description="모든 모델·SW 버전의 기술 Item을 찾습니다. Item마다 소유 대상은 하나입니다."
    primaryAction={canWrite ? <Button type="button" onClick={() => setPage({ focus: 'new' })}><Plus className="size-3.5" aria-hidden />새 기술 Item</Button> : undefined}>
    {creating && <ItemWriteDrawer target={{ mode: 'create', ownerModelId: owner ?? '' }} onClose={() => setPage({ focus: null, owner: null })} />}
    <ManagementLayout table={<ItemTable q={q} />} />
  </PlatformPage>;
}
