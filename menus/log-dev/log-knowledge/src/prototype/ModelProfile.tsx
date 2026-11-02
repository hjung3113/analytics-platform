/**
 * PROTOTYPE (#1197 / #1108) — 모델 공통 프로파일 `/log/knowledge/models/:modelId` (§16.10), three variants.
 * A: stacked sections in spec order. B: hub — compact sections, ≤5-row previews, «모두 보기». C: tabs 요약 / SW 버전 / 모델 공통 Item.
 * Only Model-owned Items are listed as 모델 공통 Item; SW-owned Items stay under their SW (never shown as inherited).
 */
import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { encodeFilterParams } from '@ap/contracts';
import type { PageProps } from '@ap/kernel';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { PlatformPage, StateMessage } from '@ap/components';
import { Button, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@ap/ui';
import { SOFTWARE, SPEC_LABEL, modelById, processById, vendorById, type Item, type Model, type Software } from './fixture';
import { useItems } from './store';
import { EmptyNote, ItemLink, ItemWriteDrawer, Section, StateBadges, TypeBadge, VariantSwitcher, useCanEdit, useLinks, useVariant } from './shared';

const NAMES = { A: '섹션 쌓기', B: '허브 + 미리보기', C: '탭' } as const;

function useProfile(modelId: string) {
  const items = useItems();
  const model = modelById.get(modelId);
  const sws = SOFTWARE.filter(s => s.modelId === modelId);
  const modelItems = items.filter(i => i.ownerKind === 'model' && i.ownerId === modelId && i.publication !== 'archived');
  const swItemCount = (swId: string) => items.filter(i => i.ownerKind === 'software' && i.ownerId === swId).length;
  const swItemsTotal = sws.reduce((n, s) => n + swItemCount(s.id), 0);
  return { model, sws, modelItems, swItemCount, swItemsTotal };
}

function Meta({ model }: { model: Model }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
    <span className="t-mono text-text-primary">{model.code}</span><span aria-hidden>·</span>
    <span>{vendorById.get(model.vendorId)?.name}</span><span aria-hidden>·</span>
    <span className="flex items-center gap-1">{model.processIds.length === 0 ? <span className="text-text-muted">공정 미분류</span> : model.processIds.map(id => <StatusBadge key={id} tone="info">{processById.get(id)?.name}</StatusBadge>)}</span>
    <StatusBadge tone={model.active ? 'success' : 'neutral'}>{model.active ? '활성' : '비활성'}</StatusBadge>
  </div>;
}

function Summary({ model, clamp = true }: { model: Model; clamp?: boolean }) {
  return <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
    <dt className="text-text-muted">모델명</dt><dd>{model.name}</dd>
    <dt className="text-text-muted">설명</dt><dd className={cn('max-w-prose text-text-secondary', clamp && 'line-clamp-6')}>{model.summary}</dd>
    <dt className="text-text-muted">외부 출처</dt><dd className="text-text-secondary">{model.source}</dd>
    <dt className="text-text-muted">최근 변경</dt><dd className="tabular">{model.updatedAt}</dd>
  </dl>;
}

function SoftwareTable({ sws, itemCount, limit }: { sws: Software[]; itemCount: (id: string) => number; limit?: number }) {
  const shown = limit ? sws.slice(0, limit) : sws;
  return <table className="w-full text-sm">
    <thead><tr className="h-8 border-b border-border-subtle text-left text-xs text-text-muted">
      <th className="font-medium">버전</th><th className="font-medium">명세 상태</th><th className="text-right font-medium">기술 Item 수</th><th className="pl-6 font-medium">최종 변경</th><th className="font-medium">상태</th>
    </tr></thead>
    <tbody>{shown.map(s => <tr key={s.id} className={cn('h-9 border-b border-border-subtle last:border-b-0 hover:bg-surface-row-hover', !s.active && 'text-text-muted')}>
      <td><button type="button" className="t-mono text-accent-primary hover:underline" title="SW 프로파일(§16.11)은 이번 프로토타입 범위 밖">{s.version}</button></td>
      <td><StatusBadge tone={s.specStatus === 'approved' ? 'success' : s.specStatus === 'reviewing' ? 'warning' : 'neutral'}>{SPEC_LABEL[s.specStatus]}</StatusBadge></td>
      <td className="tabular text-right">{itemCount(s.id)}</td>
      <td className="tabular pl-6">{s.updatedAt}</td>
      <td><StatusBadge tone={s.active ? 'success' : 'neutral'}>{s.active ? '활성' : '비활성'}</StatusBadge></td>
    </tr>)}</tbody>
  </table>;
}

function ItemRows({ items, limit }: { items: Item[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  return <ul className="divide-y divide-border-subtle">{shown.map(i => <li key={i.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm">
    <ItemLink id={i.id} />
    <span className="flex min-w-0 items-center gap-2"><TypeBadge type={i.type} /><span className="truncate">{i.title}</span></span>
    <StateBadges item={i} axes={['verification', 'processing']} />
  </li>)}</ul>;
}

function NoSoftware({ canEdit }: { canEdit: boolean }) {
  return <EmptyNote text="등록된 SW 버전이 없습니다" action={canEdit ? <Button type="button" size="sm" variant="secondary"><Plus className="size-3.5" aria-hidden />SW 버전 추가</Button> : <span className="text-xs text-text-muted">SW 버전은 카탈로그 관리 권한자가 추가합니다.</span>} />;
}
function NoItems({ canEdit, onNew }: { canEdit: boolean; onNew: () => void }) {
  return <EmptyNote text="이 모델이 소유한 기술 Item이 없습니다" action={canEdit && <Button type="button" size="sm" variant="secondary" onClick={onNew}><Plus className="size-3.5" aria-hidden />새 기술 Item</Button>} />;
}
function TopViewNote() {
  return <p className="text-sm text-text-muted">연결된 Top View가 없습니다. Top View는 SW 버전마다 Studio에서 연결합니다.</p>;
}
function SwKnowledgeNote({ count }: { count: number }) {
  if (count === 0) return null;
  return <p className="text-xs text-text-muted">SW 버전이 소유한 Item {count}건은 각 SW 버전에서 봅니다 — 모델 공통으로 상속되지 않습니다.</p>;
}

function VariantA({ p, canEdit, onNew }: { p: ReturnType<typeof useProfile> & { model: Model }; canEdit: boolean; onNew: () => void }) {
  const anchors = [['summary', '모델 요약'], ['software', 'SW 버전'], ['items', '모델 공통 Item'], ['topview', 'Top View']] as const;
  return <div className="grid gap-3">
    <nav aria-label="섹션 이동" className="sticky top-[var(--page-sticky-offset,0px)] z-10 -mx-1 flex gap-1 bg-surface-canvas px-1 py-1">
      {anchors.map(([id, label]) => <a key={id} href={`#proto-${id}`} className="rounded-sm px-2 py-1 text-xs text-text-secondary hover:bg-surface-row-hover hover:text-text-primary">{label}</a>)}
    </nav>
    <div id="proto-summary"><Section title="모델 요약"><Summary model={p.model} /></Section></div>
    <div id="proto-software"><Section title="SW 버전" count={p.sws.length}>
      {p.sws.length === 0 ? <NoSoftware canEdit={canEdit} /> : <SoftwareTable sws={p.sws} itemCount={p.swItemCount} />}
    </Section></div>
    <div id="proto-items"><Section title="모델 공통 Item" count={p.modelItems.length} actions={canEdit && p.modelItems.length > 0 && <Button type="button" size="sm" variant="secondary" onClick={onNew}><Plus className="size-3.5" aria-hidden />새 기술 Item</Button>}>
      <div className="grid gap-2">{p.modelItems.length === 0 ? <NoItems canEdit={canEdit} onNew={onNew} /> : <ItemRows items={p.modelItems} />}<SwKnowledgeNote count={p.swItemsTotal} /></div>
    </Section></div>
    <div id="proto-topview"><Section title="Top View"><TopViewNote /></Section></div>
  </div>;
}

function HubCard({ title, count, more, children, className }: { title: string; count?: number; more?: ReactNode; children: ReactNode; className?: string }) {
  return <section aria-label={title} className={cn('flex flex-col rounded-md border border-border-subtle bg-surface-card', className)}>
    <header className="flex h-9 items-center justify-between border-b border-border-subtle px-3">
      <h2 className="text-sm font-semibold">{title}{count !== undefined && <span className="tabular ml-1.5 font-normal text-text-muted">{count}</span>}</h2>{more}
    </header>
    <div className="flex-1 p-3">{children}</div>
  </section>;
}
function VariantB({ p, canEdit, onNew }: { p: ReturnType<typeof useProfile> & { model: Model }; canEdit: boolean; onNew: () => void }) {
  const [open, setOpen] = useState<{ sw: boolean; items: boolean }>({ sw: false, items: false });
  const links = useLinks();
  const more = (key: 'sw' | 'items', total: number) => total > 5 && <Button type="button" size="sm" variant="link" onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))} aria-expanded={open[key]}>{open[key] ? '접기' : `모두 보기 (${total})`}</Button>;
  return <div className="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-3">
    <div className="grid gap-3">
      <HubCard title="SW 버전" count={p.sws.length} more={more('sw', p.sws.length)}>
        {p.sws.length === 0 ? <NoSoftware canEdit={canEdit} /> : <SoftwareTable sws={p.sws} itemCount={p.swItemCount} limit={open.sw ? undefined : 5} />}
      </HubCard>
      <HubCard title="모델 공통 Item" count={p.modelItems.length} more={p.modelItems.length > 5 ? more('items', p.modelItems.length) : <PlatformLink className="text-xs text-accent-primary hover:underline" href={links.items()}>전체 기술 Item</PlatformLink>}>
        <div className="grid gap-2">{p.modelItems.length === 0 ? <NoItems canEdit={canEdit} onNew={onNew} /> : <ItemRows items={p.modelItems} limit={open.items ? undefined : 5} />}<SwKnowledgeNote count={p.swItemsTotal} /></div>
      </HubCard>
    </div>
    <div className="grid gap-3">
      <HubCard title="모델 요약"><Summary model={p.model} /></HubCard>
      <HubCard title="관련 지식">
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1.5 text-sm">
          <dt className="text-text-secondary">모델 공통 Item</dt><dd className="tabular">{p.modelItems.length}</dd>
          <dt className="text-text-secondary">SW 소유 Item (SW별)</dt><dd className="tabular">{p.swItemsTotal}</dd>
          <dt className="text-text-secondary">SW 버전</dt><dd className="tabular">{p.sws.length}</dd>
        </dl>
      </HubCard>
      <HubCard title="Top View"><TopViewNote /></HubCard>
    </div>
  </div>;
}

function VariantC({ p, canEdit, onNew }: { p: ReturnType<typeof useProfile> & { model: Model }; canEdit: boolean; onNew: () => void }) {
  const { pageParam, setPage } = usePlatform();
  const tab = pageParam('tab') ?? 'summary';
  return <Tabs value={tab} onValueChange={next => setPage({ tab: next }, { replace: true })}>
    <TabsList aria-label="프로파일 구역">
      <TabsTrigger value="summary">요약</TabsTrigger>
      <TabsTrigger value="software">SW 버전<span className="tabular ml-1.5 text-text-muted">{p.sws.length}</span></TabsTrigger>
      <TabsTrigger value="items">모델 공통 Item<span className="tabular ml-1.5 text-text-muted">{p.modelItems.length}</span></TabsTrigger>
    </TabsList>
    <TabsContent value="summary" className="mt-3 grid gap-3">
      <Section title="모델 요약"><Summary model={p.model} clamp={false} /></Section>
      <Section title="Top View"><TopViewNote /></Section>
    </TabsContent>
    <TabsContent value="software" className="mt-3"><Section title="SW 버전" count={p.sws.length}>{p.sws.length === 0 ? <NoSoftware canEdit={canEdit} /> : <SoftwareTable sws={p.sws} itemCount={p.swItemCount} />}</Section></TabsContent>
    <TabsContent value="items" className="mt-3"><Section title="모델 공통 Item" count={p.modelItems.length} actions={canEdit && <Button type="button" size="sm" variant="secondary" onClick={onNew}><Plus className="size-3.5" aria-hidden />새 기술 Item</Button>}>
      <div className="grid gap-2">{p.modelItems.length === 0 ? <NoItems canEdit={canEdit} onNew={onNew} /> : <ItemRows items={p.modelItems} />}<SwKnowledgeNote count={p.swItemsTotal} /></div>
    </Section></TabsContent>
  </Tabs>;
}

export default function ModelProfile({ params }: PageProps) {
  const variant = useVariant();
  const { pageParam, setPage } = usePlatform();
  const links = useLinks();
  const canEdit = useCanEdit();
  const p = useProfile(params.modelId ?? '');
  const drawer = pageParam('drawer');
  const onNew = () => setPage({ drawer: 'new' });
  if (!p.model) return <PlatformPage title="모델 없음"><StateMessage icon={null} title="이 모델을 찾을 수 없습니다" body="주소의 모델 ID를 확인하세요." /></PlatformPage>;
  const model = p.model;
  const vendor = vendorById.get(model.vendorId)!;
  return <PlatformPage title={model.code} crumbs={[{ label: vendor.name, href: variant === 'A' ? links.models({ filter: encodeFilterParams([{ id: 'vendorId', op: 'in', value: [vendor.id] }]) }) : links.models({ node: vendor.id }) }]}
    primaryAction={canEdit && <Button type="button" variant="secondary"><Plus className="size-3.5" aria-hidden />SW 버전 추가</Button>}>
    <div className="grid gap-3">
      <Meta model={model} />
      {variant === 'A' && <VariantA p={{ ...p, model }} canEdit={canEdit} onNew={onNew} />}
      {variant === 'B' && <VariantB p={{ ...p, model }} canEdit={canEdit} onNew={onNew} />}
      {variant === 'C' && <VariantC p={{ ...p, model }} canEdit={canEdit} onNew={onNew} />}
    </div>
    {drawer === 'new' && <ItemWriteDrawer presetOwner={{ kind: 'model', id: model.id }} onClose={() => setPage({ drawer: null })} />}
    <VariantSwitcher names={NAMES} />
  </PlatformPage>;
}
