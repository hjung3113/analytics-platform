/**
 * PROTOTYPE (#1197 / #1108) — 전체 기술 Item `/log/knowledge/items` (§16.12).
 * A and B: filter line (소유 Model/SW, 유형, 검증 상태, 처리 상태, 게시 상태 default 게시됨) + table
 * `[Item ID, 제목, 소유 Model/SW, 유형, 검증/처리 상태, 갱신일]`. C: list with a split-panel preview (row click previews, a button opens the page).
 */
import { useEffect, useMemo, useState } from 'react';
import { PanelRight, Plus } from 'lucide-react';
import { encodeFilterParams, type ColumnFilterSpec } from '@ap/contracts';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { ManagementLayout, PlatformDataTable, PlatformPage, RowAction, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { Button, Checkbox, SearchInput, cn } from '@ap/ui';
import { PROCESSING_LABEL, PUBLICATION_LABEL, TYPE_LABEL, VERIFICATION_LABEL, ownerLabel, type Item } from './fixture';
import { useItems, useRevision, localPage } from './store';
import { ItemWriteDrawer, OwnerChip, StateBadges, TypeBadge, VariantSwitcher, useCanEdit, useLinks, useVariant } from './shared';
import { ItemBodyBlocks } from './ItemDetail';

const NAMES = { A: '필터 표', B: '필터 표 (A와 같음)', C: '목록 + 미리보기' } as const;
const enumSpec = (labels: Record<string, string>, multiple = true): ColumnFilterSpec => ({ kind: 'enum', options: Object.entries(labels).map(([value, label]) => ({ value, label })), ops: ['in', 'notIn'], ...(multiple ? {} : { multiple: false as const }) });
const SPECS: Record<string, ColumnFilterSpec> = {
  ownerKind: enumSpec({ model: 'Model', software: 'SW 버전' }, false),
  type: enumSpec(TYPE_LABEL),
  verification: enumSpec(VERIFICATION_LABEL),
  processing: enumSpec(PROCESSING_LABEL),
  publication: enumSpec(PUBLICATION_LABEL),
};
const LABELS = { ownerKind: '소유', type: '유형', verification: '검증 상태', processing: '처리 상태', publication: '게시 상태' };
const SORT_IDS = ['id', 'title', 'updatedAt', 'type'] as const;
// `type` is a column filter (its id is the column's); the other four are fields that are not columns. Pinned order follows §16.12.
const FIELDS: TableFilterField[] = (['ownerKind', 'verification', 'processing', 'publication'] as const).map(id => ({ id, label: { ko: LABELS[id], en: id }, spec: SPECS[id]!, pinned: { ownerKind: 1, verification: 3, processing: 4, publication: 5 }[id] }));
const DEFAULT_FILTER = encodeFilterParams([{ id: 'publication', op: 'in', value: ['published'] }]);

function ItemTable() {
  const items = useItems();
  const revision = useRevision();
  const { pageParam, setPage, navigate } = usePlatform();
  const links = useLinks();
  const q = pageParam('q') ?? '';
  const [text, setText] = useState(q);
  const urlFilters = useMemo(() => ({ key: 'filter', specs: SPECS, labels: LABELS }), []);
  const { urlState } = useTableUrlState(SORT_IDS, { filters: urlFilters });
  const columns = useMemo<PlatformColumn<Item>[]>(() => [
    { id: 'id', header: 'Item ID', size: 96, cell: r => <PlatformLink className="t-mono text-accent-primary hover:underline" href={links.item(r.id)}>{r.id}</PlatformLink> },
    { id: 'title', header: '제목', size: 220, cell: r => <span className="truncate" title={r.title}>{r.title}</span> },
    { id: 'owner', header: '소유 Model/SW', size: 190, sortable: false, exportValue: r => ownerLabel(r), cell: r => <OwnerChip item={r} /> },
    { id: 'type', header: '유형', size: 100, filter: SPECS.type, filterPinned: 2, exportValue: r => TYPE_LABEL[r.type], cell: r => <TypeBadge type={r.type} /> },
    { id: 'states', header: '검증/처리 상태', size: 236, sortable: false, exportValue: r => `${VERIFICATION_LABEL[r.verification]} / ${PROCESSING_LABEL[r.processing]}`, cell: r => <StateBadges item={r} axes={['verification', 'processing']} /> },
    { id: 'updatedAt', header: '갱신일', size: 108, cell: r => <span className="tabular whitespace-nowrap">{r.updatedAt}</span> },
  ], [links]);
  const needle = q.toLowerCase();
  return <PlatformDataTable<Item>
    title="기술 Item" ariaLabel="기술 Item 목록" columns={columns} getRowId={r => r.id} pageSize={25} urlState={urlState} filterFields={FIELDS}
    filterKey={`${q}|${revision}`} preferenceKey="proto-1197-items:v1" isRowMuted={r => r.publication !== 'published'}
    search={<SearchInput placeholder="ID·제목·소유 대상 검색" value={text} onValueChange={setText} onCommit={() => setPage({ q: text.trim() || null, page: null })} />}
    loadPage={query => localPage(items, { ...query, sorting: query.sorting.length ? query.sorting : [{ id: 'updatedAt', desc: true }] }, SPECS, undefined,
      r => !needle || `${r.id} ${r.title} ${ownerLabel(r)}`.toLowerCase().includes(needle))}
    rowAction={(r, { compact }) => <RowAction compact={compact} icon={PanelRight} label={`${r.id} 열기`} text="열기" onClick={() => navigate(links.item(r.id))} />}
  />;
}

/* C — list + split-panel preview */
function VariantC() {
  const items = useItems();
  const { pageParam, setPage } = usePlatform();
  const links = useLinks();
  const [text, setText] = useState('');
  const [onlyPublished, setOnlyPublished] = useState(true);
  const list = items.filter(i => (!onlyPublished || i.publication === 'published') && (!text || `${i.id} ${i.title} ${ownerLabel(i)}`.toLowerCase().includes(text.toLowerCase())))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const previewId = pageParam('preview') ?? list[0]?.id ?? null;
  const preview = items.find(i => i.id === previewId);
  return <div className="grid h-[calc(100vh-7.5rem)] min-h-96 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] overflow-hidden rounded-md border border-border-subtle bg-surface-card">
    <section aria-label="기술 Item 목록" className="flex min-h-0 flex-col border-r border-border-subtle">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle p-2">
        <SearchInput placeholder="ID·제목 검색" value={text} onValueChange={setText} onCommit={() => undefined} />
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary"><Checkbox checked={onlyPublished} onCheckedChange={v => setOnlyPublished(v === true)} />게시됨만</label>
        <span className="tabular ml-auto shrink-0 text-xs text-text-muted">{list.length}건</span>
      </div>
      <ul role="listbox" aria-label="기술 Item" className="min-h-0 flex-1 overflow-auto">
        {list.map(i => <li key={i.id} role="option" aria-selected={i.id === previewId} tabIndex={i.id === previewId ? 0 : -1}
          onClick={() => setPage({ preview: i.id }, { replace: true })}
          onKeyDown={e => {
            if (e.key === 'Enter') setPage({ preview: i.id }, { replace: true });
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); const el = (e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null; el?.focus(); el?.click(); }
          }}
          className={cn('grid cursor-pointer gap-1 border-b border-border-subtle px-3 py-2 outline-none hover:bg-surface-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring', i.id === previewId && 'bg-surface-row-selected')}>
          <div className="flex items-center gap-2 text-sm"><span className="t-mono text-text-secondary">{i.id}</span><span className="min-w-0 flex-1 truncate font-medium text-text-primary">{i.title}</span><span className="tabular shrink-0 text-xs text-text-muted">{i.updatedAt}</span></div>
          <div className="flex items-center gap-1.5 overflow-hidden"><OwnerChip item={i} /><TypeBadge type={i.type} /><StateBadges item={i} axes={['verification', 'processing']} /></div>
        </li>)}
      </ul>
    </section>
    <section aria-label="미리보기" className="min-h-0 overflow-auto p-4">
      {!preview ? <p className="text-sm text-text-muted">왼쪽에서 Item을 고르면 미리보기가 보입니다.</p> : <div className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1.5"><span className="t-mono text-xs text-text-muted">{preview.id} · r{preview.revisions.length}</span><h2 className="text-base font-semibold text-text-primary">{preview.title}</h2></div>
          <Button asChild size="sm"><PlatformLink href={links.item(preview.id)}>전체 화면으로 열기</PlatformLink></Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><OwnerChip item={preview} /><TypeBadge type={preview.type} /><StateBadges item={preview} /></div>
        <ItemBodyBlocks item={preview} compact />
        <p className="text-xs text-text-muted">근거 {preview.evidence.length === 0 ? '없음' : `${preview.evidence.length}건`} · 판단 이력 {preview.history.length}건 — 전체 화면에서 봅니다.</p>
      </div>}
    </section>
  </div>;
}

export default function ItemsList() {
  const variant = useVariant();
  const { pageParam, pageParams, setPage } = usePlatform();
  const canEdit = useCanEdit();
  const drawer = pageParam('drawer');
  const bare = pageParams('filter').length === 0 && pageParam('q') === null;
  useEffect(() => { if (bare && variant !== 'C') setPage({ filter: DEFAULT_FILTER }, { replace: true }); }, [bare, variant, setPage]);
  return <PlatformPage description="모든 Model·SW 버전의 기술 Item을 찾습니다. Item마다 소유 대상은 하나입니다."
    primaryAction={canEdit && <Button type="button" onClick={() => setPage({ drawer: 'new' })}><Plus className="size-3.5" aria-hidden />새 기술 Item</Button>}>
    {variant === 'C' ? <VariantC /> : <ManagementLayout table={<ItemTable />} />}
    {drawer === 'new' && <ItemWriteDrawer onClose={() => setPage({ drawer: null })} />}
    <VariantSwitcher names={NAMES} />
  </PlatformPage>;
}
