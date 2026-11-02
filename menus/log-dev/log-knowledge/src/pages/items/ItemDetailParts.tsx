import { ArrowRight } from 'lucide-react';
import { PlatformLink, usePlatform } from '@ap/kernel';
import { cn } from '@ap/ui';
import type { ItemAssessment, ItemDetail, ItemEvidence, ItemLinkRow } from '../../endpoints';
import { OwnerChip, StateBadge } from './ItemBadges';
import { AXIS_LABEL, AXIS_OF_DIMENSION, instantText, itemNoLabel, shortActor, stateLabel } from './itemModel';

/** A server instant, rendered through the kernel `formatInstant` in the viewer's zone (`instantText`). */
export const stamp = instantText;

export function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return <section aria-label={title} className="grid min-w-0 gap-2 rounded-md border border-border-subtle bg-surface-card p-3">
    <h3 className="flex items-center gap-2 text-xs font-semibold text-text-secondary">{title}{count !== undefined && <span className="tabular font-normal text-text-muted">{count}</span>}</h3>
    {children}
  </section>;
}

function Block({ title, kind, text }: { title: string; kind: 'fact' | 'opinion'; text: string | null }) {
  const empty = text === null || text.trim() === '';
  return <section aria-label={title} data-kind={kind}
    className={cn('grid gap-1.5 rounded-md p-3', kind === 'fact' ? 'border border-border-subtle bg-surface-card' : 'border border-dashed border-border-strong bg-surface-sunken')}>
    <h3 className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
      {title}{kind === 'opinion' && <span className="rounded-sm border border-border-default px-1 text-tiny font-normal text-text-muted">의견 · 사실 아님</span>}
    </h3>
    <p className={cn('whitespace-pre-wrap text-sm leading-6', empty ? 'text-text-muted' : 'text-text-primary')}>{empty ? '기록 없음' : text}</p>
  </section>;
}

/** The four body blocks: 관찰 사실 and 기대·기준 are fact; 분석 의견 is opinion and never merges into fact (ADR-0109, design §3.3). */
export function ItemBodyBlocks({ revision }: { revision: ItemDetail['revision'] }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
    <Block title="관찰 사실" kind="fact" text={revision.observation} />
    <Block title="기대·기준" kind="fact" text={revision.expected} />
    <Block title="분석 의견" kind="opinion" text={revision.analysisOpinion} />
    <Block title="개선 방향" kind="fact" text={revision.improvement} />
  </div>;
}

export function EvidenceList({ evidence }: { evidence: readonly ItemEvidence[] }) {
  if (evidence.length === 0) return <p className="rounded-md bg-surface-sunken p-3 text-sm text-text-secondary">등록된 근거 없음</p>;
  const rows = (e: ItemEvidence): [string, string | null, boolean?][] => [
    ['출처', e.sourceOwner], ['참조', e.sourceRef, true], ['버전', e.sourceVersion], ['해시', e.contentHash, true], ['위치', e.locator, true], ['메모', e.note],
  ];
  return <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{evidence.map(e => <li key={e.ordinal} className="grid gap-1 rounded-md border border-border-subtle p-2.5 text-sm">
    <span className="text-xs font-semibold text-text-secondary">{e.sourceKind}</span>
    <dl className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
      {rows(e).filter(([, value]) => value !== null && value !== '').map(([label, value, mono]) => <div key={label} className="contents">
        <dt className="text-text-muted">{label}</dt><dd className={cn('break-all text-text-primary', mono && 't-mono')}>{value}</dd>
      </div>)}
    </dl>
  </li>)}</ul>;
}

/** `derived_from` outgoing = this item was derived from the other (파생 원본); incoming = the other was derived from this one. */
function linkLabel(link: ItemLinkRow): string {
  if (link.kind === 'related') return '관련';
  const rev = link.sourceRevisionNo === null ? '' : link.direction === 'outgoing' ? ` (원본 r${link.sourceRevisionNo} 기준)` : ` (이 Item r${link.sourceRevisionNo} 기준)`;
  return `${link.direction === 'outgoing' ? '파생 원본' : '이 Item에서 파생'}${rev}`;
}

export function LinkList({ links }: { links: readonly ItemLinkRow[] }) {
  const { linkTo } = usePlatform();
  if (links.length === 0) return <p className="text-sm text-text-muted">연결된 Item이 없습니다.</p>;
  return <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">{links.map(l => <li key={`${l.kind}-${l.direction}-${l.itemId}`} className="grid gap-0.5 text-sm">
    <span className="text-xs text-text-muted">{linkLabel(l)}</span>
    <span className="flex min-w-0 items-center gap-2">
      <PlatformLink className="t-mono shrink-0 whitespace-nowrap text-accent-primary hover:underline" href={linkTo('log-knowledge-item', { params: { itemId: l.itemId } })}>{itemNoLabel(l.itemNo)}</PlatformLink>
      <span className="truncate text-text-secondary" title={l.title}>{l.title}</span>
    </span>
    <span className="flex min-w-0 pl-0.5"><OwnerChip owner={l.owner} /></span>
  </li>)}</ul>;
}

export function RevisionList({ revisions, latest, viewing, onSelect }: {
  revisions: ItemDetail['revisions']; latest: number; viewing: number; onSelect: (revisionNo: number) => void;
}) {
  return <ol className="grid grid-cols-[minmax(0,1fr)] gap-1">{revisions.map(r => {
    const current = r.revisionNo === latest, shown = r.revisionNo === viewing;
    return <li key={r.revisionNo}>
      <button type="button" aria-current={shown ? 'true' : undefined} onClick={() => onSelect(r.revisionNo)}
        className={cn('grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-2 rounded-sm px-1.5 py-1 text-left text-sm hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring', shown && 'bg-surface-row-selected')}>
        <span className={cn('t-mono', shown ? 'font-semibold text-text-primary' : 'text-text-secondary')}>r{r.revisionNo}</span>
        <span className="grid min-w-0">
          <span className={cn('truncate', shown ? 'text-text-primary' : 'text-text-secondary')}>{r.changeNote ?? r.title}{current && <span className="ml-1.5 text-xs text-text-muted">현재</span>}</span>
          <span className="tabular text-xs text-text-muted">{stamp(r.publishedAt)} · <span title={r.publishedBy}>{shortActor(r.publishedBy)}</span></span>
        </span>
      </button>
    </li>;
  })}</ol>;
}

/** 판단 변경 이력: one entry per assessment event, newest first (the server's order). */
export function AssessmentTimeline({ assessments }: { assessments: readonly ItemAssessment[] }) {
  if (assessments.length === 0) return <p className="text-sm text-text-muted">판단 변경 이력이 없습니다.</p>;
  return <ol className="grid gap-0" aria-label="판단 변경 이력 (최신 먼저)">{assessments.map((a, i) => {
    const axis = AXIS_OF_DIMENSION[a.dimension];
    return <li key={a.id} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
      <div className="tabular pt-0.5 text-xs text-text-muted">{stamp(a.observedAt)}<br /><span className="text-text-secondary" title={a.actorId}>{shortActor(a.actorId)}</span></div>
      <div className={cn('grid gap-1 border-l-2 pl-3', i === 0 ? 'border-accent-primary' : 'border-border-subtle')}>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs font-semibold text-text-secondary">{axis ? AXIS_LABEL[axis] : a.dimension}</span>
          <span className="text-text-muted line-through decoration-text-muted">{axis ? stateLabel(axis, a.priorState) : a.priorState}</span>
          <ArrowRight className="size-3 text-text-muted" aria-label="에서" />
          {axis ? <StateBadge axis={axis} value={a.newState} /> : <span>{a.newState}</span>}
          <span className="t-mono ml-1 text-xs text-text-muted">r{a.basedOnRevisionNo} 기준</span>
        </div>
        <p className="text-sm text-text-primary">{a.rationale}</p>
      </div>
    </li>;
  })}</ol>;
}
