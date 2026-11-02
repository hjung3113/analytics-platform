/**
 * PROTOTYPE (#1197 / #1108) — Item 상세 `/log/knowledge/items/:itemId` (§16.12 ASCII layout, §3.2 fields).
 * A: spec layout — body 2/3 (four separate blocks, opinion set apart from fact) + evidence 1/3, 판단 변경 이력 below.
 * B: body + right column with tabs 근거 / 판단 이력 / 리비전. C: full-width tabs 본문 / 근거 / 판단 이력 / 리비전 under a summary strip.
 * The owner is exactly one Model or SW version; there is no share/move action (derive makes a new Item instead).
 */
import { ArrowRight, GitBranch, Lock, Pencil, Plus, Scale } from 'lucide-react';
import type { PageProps } from '@ap/kernel';
import { usePlatform } from '@ap/kernel';
import { PlatformPage, StateMessage } from '@ap/components';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@ap/ui';
import { AXIS_LABEL, EVIDENCE_KIND_LABEL, type Item } from './fixture';
import { useItems } from './store';
import { AssessDrawer, ItemLink, ItemWriteDrawer, OwnerChip, Section, StateBadge, StateBadges, TypeBadge, VariantSwitcher, stateLabel, useCanEdit, useVariant } from './shared';

const NAMES = { A: '본문 2/3 + 근거 1/3', B: '본문 + 근거·이력 탭', C: '전체 폭 탭' } as const;

function Block({ title, kind, children }: { title: string; kind: 'fact' | 'opinion'; children: string }) {
  return <section aria-label={title} className={cn('grid gap-1.5 rounded-md p-3', kind === 'fact' ? 'border border-border-subtle bg-surface-card' : 'border border-dashed border-border-strong bg-surface-sunken')}>
    <h3 className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
      {title}{kind === 'opinion' && <span className="rounded-sm border border-border-default px-1 text-tiny font-normal text-text-muted">의견 · 사실 아님</span>}
    </h3>
    <p className={cn('text-sm leading-6 text-text-primary', !children && 'text-text-muted')}>{children || '입력 없음'}</p>
  </section>;
}

/** The four §3.2 body sections: 관찰 사실 and 기대·기준 are fact; 분석 의견 is opinion and never merges into fact. */
export function ItemBodyBlocks({ item, compact }: { item: Item; compact?: boolean }) {
  return <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2', !compact && 'gap-3')}>
    <Block title="관찰 사실" kind="fact">{item.body.observed}</Block>
    <Block title="기대·기준" kind="fact">{item.body.expected}</Block>
    <Block title="분석 의견" kind="opinion">{item.body.analysis}</Block>
    <Block title="개선 방향" kind="fact">{item.body.improvement}</Block>
  </div>;
}

function EvidenceList({ item, canEdit }: { item: Item; canEdit: boolean }) {
  if (item.evidence.length === 0) return <div className="grid gap-2 rounded-md bg-surface-sunken p-3 text-sm text-text-secondary">
    <p>등록된 근거 없음</p>
    {canEdit ? <Button type="button" size="sm" variant="secondary" className="justify-self-start"><Plus className="size-3.5" aria-hidden />근거 추가</Button> : <p className="text-xs text-text-muted">근거는 작성자와 검토자가 추가합니다.</p>}
  </div>;
  return <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{item.evidence.map(e => <li key={e.id} className="grid gap-1 rounded-md border border-border-subtle p-2.5 text-sm">
    <span className="text-xs text-text-muted">{EVIDENCE_KIND_LABEL[e.kind]}</span>
    <span className="font-medium text-text-primary">{e.label}</span>
    <span className="t-mono text-xs text-text-secondary">{e.location}</span>
    {e.access === 'restricted'
      ? <span className="flex items-center gap-1 text-xs text-text-warning-label"><Lock className="size-3" aria-hidden />원문 권한 없음 — 요약 불가</span>
      : <span className="text-xs text-text-muted">{e.detail}</span>}
  </li>)}</ul>;
}

function LinkList({ item, all }: { item: Item; all: Item[] }) {
  const derived = all.filter(i => i.links.some(l => l.kind === 'derived_from' && l.itemId === item.id));
  const rows = [
    ...item.links.map(l => ({ key: `${l.kind}-${l.itemId}`, label: l.kind === 'derived_from' ? `파생 원본${l.rev ? ` (r${l.rev})` : ''}` : l.kind === 'similar' ? '유사' : '관련', id: l.itemId })),
    ...derived.map(d => ({ key: `child-${d.id}`, label: `이 Item에서 파생${d.links.find(l => l.itemId === item.id)?.rev ? ` (r${d.links.find(l => l.itemId === item.id)!.rev} 기준)` : ''}`, id: d.id })),
  ];
  if (rows.length === 0) return <p className="text-sm text-text-muted">연결된 Item이 없습니다.</p>;
  return <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">{rows.map(r => {
    const target = all.find(i => i.id === r.id);
    return <li key={r.key} className="grid gap-0.5 text-sm">
      <span className="text-xs text-text-muted">{r.label}</span>
      <span className="flex min-w-0 items-center gap-2"><span className="shrink-0 whitespace-nowrap"><ItemLink id={r.id} /></span><span className="truncate text-text-secondary">{target?.title ?? '보관되었거나 볼 수 없는 Item'}</span></span>
      {target && <span className="flex min-w-0 pl-0.5"><OwnerChip item={target} /></span>}
    </li>;
  })}</ul>;
}

function Timeline({ item }: { item: Item }) {
  const events = [...item.history].reverse();
  return <ol className="grid gap-0" aria-label="판단 변경 이력 (최신 먼저)">{events.map((a, i) => <li key={a.id} className="relative grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
    <div className="tabular pt-0.5 text-xs text-text-muted">{a.at}<br /><span className="text-text-secondary">{a.actor}</span></div>
    <div className={cn('grid gap-1 border-l-2 pl-3', i === 0 ? 'border-accent-primary' : 'border-border-subtle')}>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-xs font-semibold text-text-secondary">{AXIS_LABEL[a.axis]}</span>
        {a.from && <span className="text-text-muted line-through decoration-text-muted">{stateLabel(a.axis, a.from)}</span>}
        <ArrowRight className="size-3 text-text-muted" aria-label="에서" />
        <StateBadge axis={a.axis} value={a.to} />
      </div>
      <p className="text-sm text-text-primary">{a.reason}</p>
      {a.evidenceId && <span className="text-xs text-accent-primary">근거: {item.evidence.find(e => e.id === a.evidenceId)?.label ?? a.evidenceId}</span>}
    </div>
  </li>)}</ol>;
}

function Revisions({ item }: { item: Item }) {
  return <ol className="grid grid-cols-[minmax(0,1fr)] gap-1.5">{[...item.revisions].reverse().map((r, i) => <li key={r.rev} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 text-sm">
    <span className={cn('t-mono', i === 0 ? 'font-semibold text-text-primary' : 'text-text-secondary')}>r{r.rev}</span>
    <span className="grid"><span className={i === 0 ? 'text-text-primary' : 'text-text-secondary'}>{r.note}{i === 0 && <span className="ml-1.5 text-xs text-text-muted">현재</span>}</span><span className="tabular text-xs text-text-muted">{r.at} · {r.by}</span></span>
  </li>)}</ol>;
}

function Header({ item, canEdit, onAssess, onDerive }: { item: Item; canEdit: boolean; onAssess: () => void; onDerive: () => void }) {
  return <header className="grid gap-2">
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <h2 className="min-w-64 flex-1 text-lg font-semibold leading-7 text-text-primary">{item.title}</h2>
      {canEdit && <div className="flex shrink-0 items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDerive}><GitBranch className="size-3.5" aria-hidden />관련 Item으로 신규 작성</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onAssess}><Scale className="size-3.5" aria-hidden />판단 변경</Button>
        <Button type="button" size="sm" variant="ghost"><Pencil className="size-3.5" aria-hidden />수정</Button>
      </div>}
    </div>
    <div className="flex flex-wrap items-center gap-1.5"><OwnerChip item={item} /><TypeBadge type={item.type} /><StateBadges item={item} /></div>
    <p className="text-xs text-text-muted">{item.category} · 태그 {item.tags.join(', ') || '없음'} · 작성 {item.author} {item.createdAt} · 갱신 {item.updatedAt} · r{item.revisions.length}</p>
  </header>;
}

export default function ItemDetail({ params }: PageProps) {
  const variant = useVariant();
  const items = useItems();
  const { pageParam, setPage } = usePlatform();
  const canEdit = useCanEdit();
  const item = items.find(i => i.id === params.itemId);
  const drawer = pageParam('drawer');
  const close = () => setPage({ drawer: null });
  if (!item) return <PlatformPage title={params.itemId ?? 'Item'}><StateMessage icon={null} title="이 Item을 찾을 수 없습니다" body="보관되었거나 주소가 틀렸습니다." /></PlatformPage>;
  const head = <Header item={item} canEdit={canEdit} onAssess={() => setPage({ drawer: 'assess' })} onDerive={() => setPage({ drawer: 'derive' })} />;
  const tabCount = (n: number) => <span className="tabular ml-1.5 text-text-muted">{n}</span>;
  return <PlatformPage title={item.id}>
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 *:min-w-0">
      {variant === 'A' && <>
        {head}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4">
          <ItemBodyBlocks item={item} />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
            <Section title="근거" count={item.evidence.length}><EvidenceList item={item} canEdit={canEdit} /></Section>
            <Section title="연결 Item"><LinkList item={item} all={items} /></Section>
            <Section title="리비전" count={item.revisions.length}><Revisions item={item} /></Section>
          </div>
        </div>
        <Section title="판단 변경 이력" count={item.history.length}><Timeline item={item} /></Section>
      </>}
      {variant === 'B' && <>
        {head}
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-4">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3"><ItemBodyBlocks item={item} /><Section title="연결 Item"><LinkList item={item} all={items} /></Section></div>
          <div className="sticky top-[var(--page-sticky-offset,0px)] rounded-md border border-border-subtle bg-surface-card p-3"><Tabs defaultValue="evidence">
            <TabsList aria-label="근거와 이력">
              <TabsTrigger value="evidence">근거{tabCount(item.evidence.length)}</TabsTrigger>
              <TabsTrigger value="history">판단 이력{tabCount(item.history.length)}</TabsTrigger>
              <TabsTrigger value="revisions">리비전{tabCount(item.revisions.length)}</TabsTrigger>
            </TabsList>
            <TabsContent value="evidence" className="pt-3"><EvidenceList item={item} canEdit={canEdit} /></TabsContent>
            <TabsContent value="history" className="pt-3"><Timeline item={item} /></TabsContent>
            <TabsContent value="revisions" className="pt-3"><Revisions item={item} /></TabsContent>
          </Tabs></div>
        </div>
      </>}
      {variant === 'C' && <>
        {head}
        <Tabs value={pageParam('tab') ?? 'body'} onValueChange={tab => setPage({ tab }, { replace: true })}>
          <TabsList aria-label="Item 구역">
            <TabsTrigger value="body">본문</TabsTrigger>
            <TabsTrigger value="evidence">근거{tabCount(item.evidence.length)}</TabsTrigger>
            <TabsTrigger value="history">판단 이력{tabCount(item.history.length)}</TabsTrigger>
            <TabsTrigger value="revisions">리비전{tabCount(item.revisions.length)}</TabsTrigger>
          </TabsList>
          <TabsContent value="body" className="mt-3 grid grid-cols-2 gap-3">
            <div className="grid content-start gap-3"><Block title="관찰 사실" kind="fact">{item.body.observed}</Block><Block title="기대·기준" kind="fact">{item.body.expected}</Block></div>
            <div className="grid content-start gap-3"><Block title="분석 의견" kind="opinion">{item.body.analysis}</Block><Block title="개선 방향" kind="fact">{item.body.improvement}</Block></div>
            <div className="col-span-2"><Section title="연결 Item"><LinkList item={item} all={items} /></Section></div>
          </TabsContent>
          <TabsContent value="evidence" className="mt-3"><Section title="근거" count={item.evidence.length}><EvidenceList item={item} canEdit={canEdit} /></Section></TabsContent>
          <TabsContent value="history" className="mt-3"><Section title="판단 변경 이력" count={item.history.length}><Timeline item={item} /></Section></TabsContent>
          <TabsContent value="revisions" className="mt-3"><Section title="리비전" count={item.revisions.length}><Revisions item={item} /></Section></TabsContent>
        </Tabs>
      </>}
    </div>
    {drawer === 'assess' && <AssessDrawer item={item} onClose={close} />}
    {drawer === 'derive' && <ItemWriteDrawer source={item} onClose={close} />}
    <VariantSwitcher names={NAMES} />
  </PlatformPage>;
}
