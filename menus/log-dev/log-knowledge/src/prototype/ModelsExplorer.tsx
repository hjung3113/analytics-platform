/**
 * PROTOTYPE (#1197 / #1108) — 모델 탐색 `/log/knowledge/models`, three variants on one route (`?variant=A|B|C`).
 * A: filtered table (ADR-0105 one filter line). B: lazy 제조사 → 모델 tree + table of the selected node (공정 is a filter: N:M).
 * C: Miller columns 제조사 → 모델 → SW 버전 with a detail pane.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { encodeFilterParams, type ColumnFilterSpec } from '@ap/contracts';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { ManagementLayout, PlatformDataTable, PlatformPage, RowAction, useTableUrlState, type PlatformColumn, type TableFilterField } from '@ap/components';
import { Button, Input, SearchInput, StatusBadge, cn } from '@ap/ui';
import { ITEMS, MODELS, PROCESSES, SOFTWARE, SPEC_LABEL, VENDORS, modelById, processById, softwareById, vendorById } from './fixture';
import { HierarchyTree, type TreeNode } from './HierarchyTree';
import { localPage } from './store';
import { VariantSwitcher, useCanEdit, useLinks, useVariant } from './shared';

const NAMES = { A: '필터 표', B: '트리 + 표', C: 'Miller 열' } as const;

type ModelRow = { id: string; code: string; name: string; vendorId: string; vendorName: string; processes: string[]; softwareCount: number; active: boolean; updatedAt: string };
const ROWS: ModelRow[] = MODELS.map(m => ({
  id: m.id, code: m.code, name: m.name, vendorId: m.vendorId, vendorName: vendorById.get(m.vendorId)!.name, processes: m.processIds,
  softwareCount: SOFTWARE.filter(s => s.modelId === m.id).length, active: m.active, updatedAt: m.updatedAt,
}));
const SORT_IDS = ['code', 'name', 'vendorName', 'softwareCount', 'active', 'updatedAt'] as const;
const ACTIVE_SPEC: ColumnFilterSpec = { kind: 'enum', options: [{ value: 'true', label: '활성' }, { value: 'false', label: '비활성' }], ops: ['in'], multiple: false };
const SPECS: Record<string, ColumnFilterSpec> = {
  active: ACTIVE_SPEC,
  vendorId: { kind: 'enum', options: VENDORS.map(v => ({ value: v.id, label: v.name })), ops: ['in'], multiple: false },
  processes: { kind: 'enum', options: PROCESSES.map(p => ({ value: p.id, label: p.name })), ops: ['in', 'isEmpty'], cell: 'many' },
};
const LABELS = { active: '활성 상태', vendorId: '제조사', processes: '공정' };
const accessor = (row: ModelRow, id: string) => (id === 'active' ? String(row.active) : (row as unknown as Record<string, unknown>)[id]);
const DEFAULT_FILTER = encodeFilterParams([{ id: 'active', op: 'in', value: ['true'] }]);

function ProcessBadges({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <span className="text-text-muted">미분류</span>;
  const shown = ids.slice(0, 2), rest = ids.slice(2);
  return <span className="flex items-center gap-1">
    {shown.map(id => <StatusBadge key={id} tone="info">{processById.get(id)?.name}</StatusBadge>)}
    {rest.length > 0 && <span className="text-xs text-text-secondary" title={rest.map(id => processById.get(id)?.name).join(', ')}>
      +{rest.length}<span className="sr-only"> ({rest.map(id => processById.get(id)?.name).join(', ')})</span>
    </span>}
  </span>;
}

function useModelColumns(withVendor: boolean): PlatformColumn<ModelRow>[] {
  const links = useLinks();
  return useMemo(() => {
    const cols: PlatformColumn<ModelRow>[] = [
      { id: 'code', header: '모델 코드', size: 120, cell: r => <PlatformLink className="t-mono text-accent-primary hover:underline" href={links.model(r.id)}>{r.code}</PlatformLink> },
      { id: 'name', header: '모델명', size: 160 },
      { id: 'vendorName', header: '제조사', size: 120, filter: SPECS.vendorId, filterPinned: 1, filterLabel: '제조사' },
      { id: 'processes', header: '공정', size: 176, sortable: false, filter: SPECS.processes, filterPinned: 2, exportValue: r => r.processes.map(id => processById.get(id)?.name).join(', '), cell: r => <ProcessBadges ids={r.processes} /> },
      { id: 'softwareCount', header: 'SW 버전', size: 92, align: 'right', cell: r => (r.softwareCount === 0 ? <span className="text-text-warning-label">SW 0</span> : <span className="tabular">{r.softwareCount}</span>) },
      { id: 'active', header: '상태', size: 84, filter: ACTIVE_SPEC, filterPinned: 3, filterLabel: '활성 상태', exportValue: r => (r.active ? '활성' : '비활성'), cell: r => <StatusBadge tone={r.active ? 'success' : 'neutral'}>{r.active ? '활성' : '비활성'}</StatusBadge> },
      { id: 'updatedAt', header: '최근 변경', size: 112, cell: r => <span className="tabular">{r.updatedAt}</span> },
    ];
    // The vendor column's id is the display field; its filter is the vendorId field (the filter line names it 제조사).
    return withVendor ? cols.map(c => (c.id === 'vendorName' ? { ...c, filter: undefined, filterPinned: undefined } : c)) : cols.filter(c => c.id !== 'vendorName');
  }, [links, withVendor]);
}

function ModelTable({ scopeVendor, title }: { scopeVendor?: string | null; title: string }) {
  const { pageParam, setPage, navigate } = usePlatform();
  const links = useLinks();
  const q = pageParam('q') ?? '';
  const [text, setText] = useState(q);
  const urlFilters = useMemo(() => ({ key: 'filter', specs: SPECS, labels: LABELS }), []);
  const { urlState } = useTableUrlState(SORT_IDS, { filters: urlFilters });
  const columns = useModelColumns(!scopeVendor);
  const fields = useMemo<TableFilterField[]>(() => (scopeVendor ? [] : [{ id: 'vendorId', label: { ko: '제조사', en: 'Vendor' }, spec: SPECS.vendorId!, pinned: 1 }]), [scopeVendor]);
  const needle = q.toLowerCase();
  return <PlatformDataTable<ModelRow>
    title={title} ariaLabel={title} columns={columns} getRowId={r => r.id} pageSize={25} urlState={urlState} filterFields={fields}
    filterKey={`${q}|${scopeVendor ?? ''}`} preferenceKey={`proto-1197-models:${scopeVendor ? 'scoped' : 'all'}:v1`} isRowMuted={r => !r.active}
    search={<SearchInput placeholder="모델·제조사 검색" value={text} onValueChange={setText} onCommit={() => setPage({ q: text.trim() || null, page: null })} />}
    loadPage={query => localPage(ROWS, { ...query, sorting: query.sorting.length ? query.sorting : [{ id: 'code', desc: false }] }, SPECS, accessor,
      r => (!scopeVendor || r.vendorId === scopeVendor) && (!needle || `${r.code} ${r.name} ${r.vendorName}`.toLowerCase().includes(needle)))}
    rowAction={(r, { compact }) => <RowAction compact={compact} icon={ExternalLink} label={`${r.code} 프로파일 열기`} text="열기" onClick={() => navigate(links.model(r.id))} />}
  />;
}

/* A — one filtered table */
function VariantA() {
  return <ManagementLayout table={<ModelTable title="모델 목록" />} />;
}

/* B — lazy tree + table of the selected node */
function VariantB() {
  const { pageParam, setPage, navigate } = usePlatform();
  const links = useLinks();
  const node = pageParam('node') ?? VENDORS[0]!.id;
  const roots = useMemo<TreeNode[]>(() => VENDORS.map(v => ({
    id: v.id, label: v.name, meta: ROWS.filter(r => r.vendorId === v.id).length,
    children: () => ROWS.filter(r => r.vendorId === v.id).sort((a, b) => a.code.localeCompare(b.code)).map(r => ({ id: r.id, label: r.code, muted: !r.active, meta: r.softwareCount === 0 ? 'SW 0' : r.softwareCount })),
  })), []);
  const vendor = vendorById.get(node) ?? vendorById.get(modelById.get(node)?.vendorId ?? '') ?? VENDORS[0]!;
  return <div className="grid grid-cols-[14rem_minmax(0,1fr)] items-start gap-3">
    <nav aria-label="제조사 탐색" className="sticky top-[var(--page-sticky-offset,0px)] max-h-[calc(100vh-6rem)] overflow-auto rounded-md border border-border-subtle bg-surface-card p-2">
      <p className="px-1 pb-2 text-xs text-text-muted">제조사 → 모델 · 공정은 표의 필터로 좁힙니다</p>
      <HierarchyTree label="제조사와 모델" roots={roots} selectedId={node} defaultExpanded={[vendor.id]}
        onSelect={id => (modelById.has(id) ? navigate(links.model(id)) : setPage({ node: id, page: null }))}
        onActivate={id => (modelById.has(id) ? navigate(links.model(id)) : setPage({ node: id, page: null }))} />
    </nav>
    <ModelTable key={vendor.id} scopeVendor={vendor.id} title={`${vendor.name} 모델`} />
  </div>;
}

/* C — Miller columns */
function Column({ title, count, children, search }: { title: string; count: number; children: React.ReactNode; search?: React.ReactNode }) {
  return <section aria-label={title} className="flex min-h-0 min-w-0 flex-col border-r border-border-subtle last:border-r-0">
    <header className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle px-3 text-xs font-semibold text-text-secondary">{title}<span className="tabular font-normal text-text-muted">{count}</span></header>
    {search && <div className="shrink-0 border-b border-border-subtle p-2">{search}</div>}
    <ul role="listbox" aria-label={title} className="min-h-0 flex-1 overflow-auto p-1">{children}</ul>
  </section>;
}
function Option({ selected, onSelect, children, muted }: { selected: boolean; onSelect: () => void; children: React.ReactNode; muted?: boolean }) {
  return <li role="option" aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={onSelect}
    onKeyDown={e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); ((e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null)?.focus(); }
    }}
    className={cn('flex h-8 cursor-pointer items-center justify-between gap-2 rounded-sm px-2 text-sm outline-none hover:bg-surface-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
      selected && 'bg-surface-row-selected font-medium', muted && 'text-text-muted')}>{children}</li>;
}
function VariantC() {
  const { pageParam, setPage } = usePlatform();
  const links = useLinks();
  const canEdit = useCanEdit();
  const vendorId = pageParam('node') ?? VENDORS[0]!.id;
  const modelId = pageParam('model');
  const swId = pageParam('sw');
  const [filter, setFilter] = useState('');
  const models = ROWS.filter(r => r.vendorId === vendorId && (!filter || `${r.code} ${r.name}`.toLowerCase().includes(filter.toLowerCase()))).sort((a, b) => a.code.localeCompare(b.code));
  const model = modelId ? modelById.get(modelId) : undefined;
  const sws = model ? SOFTWARE.filter(s => s.modelId === model.id) : [];
  const sw = swId ? softwareById.get(swId) : undefined;
  const itemCount = (ownerId: string) => ITEMS.filter(i => i.ownerId === ownerId).length;
  return <div className="grid h-[calc(100vh-7.5rem)] min-h-96 grid-cols-[13rem_15rem_13rem_minmax(0,1fr)] overflow-hidden rounded-md border border-border-subtle bg-surface-card">
    <Column title="제조사" count={VENDORS.length}>
      {VENDORS.map(v => <Option key={v.id} selected={v.id === vendorId} onSelect={() => setPage({ node: v.id, model: null, sw: null }, { replace: true })}>
        <span className="truncate">{v.name}</span><span className="tabular text-xs text-text-muted">{ROWS.filter(r => r.vendorId === v.id).length}</span>
      </Option>)}
    </Column>
    <Column title="모델" count={models.length} search={<Input aria-label="모델 좁히기" placeholder="모델 좁히기" value={filter} onChange={e => setFilter(e.target.value)} className="h-8" />}>
      {models.map(m => <Option key={m.id} selected={m.id === modelId} muted={!m.active} onSelect={() => setPage({ model: m.id, sw: null }, { replace: true })}>
        <span className="t-mono truncate">{m.code}</span><span className="tabular text-xs text-text-muted">{m.softwareCount === 0 ? 'SW 0' : `SW ${m.softwareCount}`}</span>
      </Option>)}
    </Column>
    <Column title="SW 버전" count={sws.length}>
      {!model ? <li className="p-2 text-xs text-text-muted">모델을 고르세요</li>
        : sws.length === 0 ? <li className="grid gap-2 p-2 text-xs text-text-secondary">등록된 SW 버전이 없습니다{canEdit && <Button size="sm" variant="secondary" className="justify-self-start">SW 버전 추가</Button>}</li>
          : sws.map(s => <Option key={s.id} selected={s.id === swId} muted={!s.active} onSelect={() => setPage({ sw: s.id }, { replace: true })}>
            <span className="t-mono">{s.version}</span><span className="text-xs text-text-muted">{SPEC_LABEL[s.specStatus]}</span>
          </Option>)}
    </Column>
    <section aria-label="선택 항목 요약" className="min-w-0 overflow-auto p-4">
      {!model ? <p className="text-sm text-text-muted">제조사 → 모델 → SW 버전 순으로 좁힙니다. 모델을 고르면 요약이 여기에 보입니다.</p> : <div className="grid gap-4">
        <div>
          <p className="text-xs text-text-muted">{vendorById.get(model.vendorId)?.name}</p>
          <h2 className="text-lg font-semibold text-text-primary"><span className="t-mono">{model.code}</span>{sw && <span className="t-mono text-text-secondary"> / {sw.version}</span>}</h2>
          <p className="text-sm text-text-secondary">{model.name}</p>
        </div>
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="text-text-muted">공정</dt><dd><ProcessBadges ids={model.processIds} /></dd>
          <dt className="text-text-muted">상태</dt><dd><StatusBadge tone={model.active ? 'success' : 'neutral'}>{model.active ? '활성' : '비활성'}</StatusBadge></dd>
          <dt className="text-text-muted">SW 버전</dt><dd className="tabular">{sws.length === 0 ? 'SW 0' : `${sws.length}개`}</dd>
          <dt className="text-text-muted">모델 공통 Item</dt><dd className="tabular">{itemCount(model.id)}건</dd>
          {sw && <><dt className="text-text-muted">SW 명세</dt><dd>{SPEC_LABEL[sw.specStatus]}</dd><dt className="text-text-muted">SW Item</dt><dd className="tabular">{itemCount(sw.id)}건</dd></>}
        </dl>
        <Button asChild size="sm" className="justify-self-start"><PlatformLink href={links.model(model.id)}>모델 프로파일 열기</PlatformLink></Button>
      </div>}
    </section>
  </div>;
}

export default function ModelsExplorer() {
  const variant = useVariant();
  const { pageParam, pageParams, setPage } = usePlatform();
  const canEdit = useCanEdit();
  // A bare address starts with 활성 only (§16.6 기본 활성); an address that already says anything keeps it.
  const bare = pageParam('filter') === null && pageParams('filter').length === 0 && pageParam('q') === null && pageParam('node') === null;
  useEffect(() => { if (bare && variant !== 'C') setPage({ filter: DEFAULT_FILTER }, { replace: true }); }, [bare, variant, setPage]);
  return <PlatformPage description="제조사·공정별 모델과 SW 버전을 조회합니다" primaryAction={canEdit && <Button type="button">모델 등록</Button>}>
    {variant === 'A' && <VariantA />}
    {variant === 'B' && <VariantB />}
    {variant === 'C' && <VariantC />}
    <VariantSwitcher names={NAMES} />
  </PlatformPage>;
}
