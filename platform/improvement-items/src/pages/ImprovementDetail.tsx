import { useState } from 'react';
import { formatInstant } from '@ap/contracts';
import { PlatformLink, useMenuQuery, usePlatform } from '@ap/kernel';
import { PlatformPage, QueryView, ReturnLink } from '@ap/components';
import { Button } from '@ap/ui';
import { MANAGE_PERMISSION, detailEndpoint, eventsEndpoint, itemsEndpoint, type ItemRow, type Target } from '../endpoints';
import { useCopy } from '../copy';
import { formatTarget } from '../model';
import { OriginSummary } from './OriginSummary';
import { ItemStatus, Section } from './parts';
import { QuestReference } from './QuestReference';
import { StatusMoves } from './StatusMove';
import { EffectCheck, useEffectComparison } from './EffectCheck';
function ChangeHistory({ itemId }: { itemId: string }) {
  const c = useCopy();
  const [page, setPage] = useState(0);
  const query = useMenuQuery(eventsEndpoint, { itemId, page, pageSize: 20 });
  return <Section title={c.history}><QueryView query={query}>{data => <><ol className="space-y-4">{data.rows.map(event => <li key={event.id} className="space-y-1 border-l border-border-subtle pl-3"><p className="text-sm">{eventLabel(event.eventType, c.lang)}</p><p className="text-xs text-text-secondary">{event.actor.displayName} · {formatInstant(event.occurredAt, c.lang, 'Asia/Seoul')} KST</p>{event.reason && <p className="break-words text-sm">{event.reason}</p>}<ChangeSummary changes={event.changes} /></li>)}</ol>{data.rows.length === 0 && <p className="text-sm text-text-secondary">{c.noHistory}</p>}<div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{c.previous}</Button><Button variant="secondary" size="sm" disabled={(page + 1) * 20 >= data.total} onClick={() => setPage(p => p + 1)}>{c.next}</Button></div></>}</QueryView></Section>;
}
function eventLabel(type: string, lang: 'ko' | 'en') {
  const labels: Record<string, [string, string]> = { created: ['개선 아이템 생성', 'Item created'], updated: ['내용 변경', 'Content updated'], status_changed: ['상태 변경', 'Status changed'], assigned: ['담당 변경', 'Assignee changed'], quest_linked: ['과제(Quest) 연결 변경', 'Quest link changed'], reopened: ['다시 열기', 'Reopened'] };
  return labels[type]?.[lang === 'ko' ? 0 : 1] ?? type;
}
function ChangeSummary({ changes }: { changes: Record<string, unknown> }) {
  const c = useCopy();
  const before = changes.before as Record<string, unknown> | undefined, after = changes.after as Record<string, unknown> | undefined;
  const label = (s: unknown) => typeof s === 'string' && s in c.statuses ? c.statuses[s as ItemRow['status']] : '';
  return before?.status && after?.status ? <p className="text-xs text-text-secondary">{label(before.status)} → {label(after.status)}</p> : null;
}
function TargetHistory({ target }: { target: Target }) {
  const c = useCopy(), { linkTo } = usePlatform();
  const [page, setPage] = useState(0);
  const query = useMenuQuery(itemsEndpoint, { page, pageSize: 10, sorting: [{ id: 'createdAt', desc: true }], targetKind: target.kind, targetKey: target.externalKey });
  return <div className="space-y-3"><p className="text-sm">{formatTarget(target, c)}</p><QueryView query={query}>{data => <><ul className="space-y-2">{data.rows.map(row => <li key={row.id}><PlatformLink className="text-sm text-accent-primary hover:underline" href={linkTo('improvement-item', { params: { itemId: row.id }, returnTo: true })}>IM-{row.itemNo} · {row.problem} · {row.actionDate ?? c.unset}</PlatformLink></li>)}</ul><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{c.previous}</Button><Button variant="secondary" size="sm" disabled={(page + 1) * 10 >= data.total} onClick={() => setPage(p => p + 1)}>{c.next}</Button></div></>}</QueryView></div>;
}
function DetailBody({ item }: { item: ItemRow }) {
  const c = useCopy(), { can } = usePlatform();
  const [selectedTarget, setTarget] = useState(0);
  const target = item.targets[selectedTarget];
  const [days, setDays] = useState(7), [selectedComparison, setComparison] = useState<string | null>(null);
  const comparison = useEffectComparison(item, days);
  const compareLink = selectedComparison === comparison.href ? selectedComparison : null;
  return <div className="grid min-w-0 grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)] gap-6">
    <div className="min-w-0"><Section title={c.summary}><p className="break-words text-sm font-semibold">{item.problem}</p><dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm"><dt className="text-text-secondary">{c.action}</dt><dd className="whitespace-pre-wrap break-words">{item.action ?? c.unset}</dd><dt className="text-text-secondary">{c.actionDate}</dt><dd>{item.actionDate ?? c.unset}</dd><dt className="text-text-secondary">{c.assignee}</dt><dd>{item.assignee?.displayName ?? c.unset}</dd></dl></Section>
      <Section title={c.quest}>{item.quest ? <QuestReference id={item.quest.id} snapshot={item.quest.titleSnapshot} /> : <p className="text-sm text-text-secondary">{c.questNone}</p>}</Section>
      <Section title={c.origin}>{item.restricted ? <p className="text-sm text-text-secondary">{c.restrictedDetail}</p> : item.origin ? <div className="space-y-2"><OriginSummary origin={item.origin} /></div> : <p className="text-sm text-text-secondary">{c.unset}</p>}</Section>
      <EffectCheck item={item} days={days} onDaysChange={value => { setDays(value); setComparison(null); }} comparison={comparison} selected={!!compareLink} onSelect={() => setComparison(comparison.href)} />
      <Section title={c.targetHistory}>{item.restricted ? <p className="text-sm text-text-secondary">{c.restrictedDetail}</p> : item.targets.length ? <><div className="flex flex-wrap gap-2">{item.targets.map((t, i) => <Button key={`${t.kind}:${t.externalKey}`} size="sm" variant={i === selectedTarget ? 'secondary' : 'ghost'} aria-pressed={i === selectedTarget} onClick={() => setTarget(i)}>{formatTarget(t, c)}</Button>)}</div>{target && <TargetHistory key={`${target.kind}:${target.externalKey}`} target={target} />}</> : <p className="text-sm text-text-secondary">{c.noTarget}</p>}</Section>
    </div>
    <aside className="min-w-0 border-l border-border-subtle pl-5"><Section title={c.status}><ItemStatus status={item.status} />{can(MANAGE_PERMISSION) ? <StatusMoves item={item} compareLink={compareLink} /> : <p className="text-sm text-text-secondary">{c.denied}</p>}{item.dropReason && <p className="break-words text-sm">{item.dropReason}</p>}</Section><ChangeHistory key={item.id} itemId={item.id} /></aside>
  </div>;
}
export default function ImprovementDetail() {
  const c = useCopy(), { route, linkTo } = usePlatform();
  const query = useMenuQuery(detailEndpoint, { itemId: route?.params.itemId ?? '' });
  const item = query.response?.outcome === 'ok' ? query.response.data : null;
  return <PlatformPage title={item ? `IM-${item.itemNo} · ${c.title}` : c.title} description={c.description} primaryAction={<PlatformLink className="text-sm text-accent-primary hover:underline" href={linkTo('improvement-items')}>{c.list}</PlatformLink>}>
    <ReturnLink />
    <QueryView query={query}>{data => data ? <DetailBody key={data.id} item={data} /> : <p role="status">{c.notFound}</p>}</QueryView>
  </PlatformPage>;
}
