import { useId } from 'react';
import { PlatformLink, useMenuQuery, usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { itemsEndpoint, IMPROVEMENT_ITEMS_MENU_ID, type ListParams } from './endpoints';
import { filtersForView } from './model';
import { myAssignmentsLink } from './links';
import { useCopy } from './copy';

const mine: ListParams = { page: 0, pageSize: 1, sorting: [], filters: filtersForView('mine') };
const pending: ListParams = { ...mine, filters: [...filtersForView('mine').filter(f => f.id !== 'status'), { id: 'status', op: 'in', value: ['done'] }] };

export default function HomeAssignments() {
  const c = useCopy(), { canOpen, linkTo } = usePlatform();
  const titleId = useId();
  const allowed = canOpen(IMPROVEMENT_ITEMS_MENU_ID);
  const assigned = useMenuQuery(itemsEndpoint, mine, allowed);
  const done = useMenuQuery(itemsEndpoint, pending, allowed);
  const queries = [assigned, done];
  const denied = !allowed || queries.some(q => q.response?.outcome === 'forbidden');
  const failed = queries.some(q => q.response && !['ok', 'empty', 'forbidden'].includes(q.response.outcome));
  const loading = !denied && !failed && queries.some(q => !q.response || q.status === 'loading' || q.status === 'refreshing');
  const total = assigned.response?.data?.total ?? 0;
  const waiting = done.response?.data?.total ?? 0;
  const ready = !denied && !failed && !loading;
  const countName = c.lang === 'ko' ? `내 담당 개선 아이템 ${total}건 · 목록 열기` : `${total} open improvement items assigned to me · Open list`;

  return <section aria-labelledby={titleId} aria-busy={loading} className="flex h-44 max-w-xl flex-col gap-2 rounded-lg border border-border-subtle bg-surface-card p-4">
    <h2 id={titleId} className="t-card-title">{c.homeTitle}</h2>
    <div className="flex-1" aria-live="polite">
      {denied ? <p className="text-sm text-text-secondary">{c.homeDenied}</p>
        : failed ? <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-text-secondary">{c.homeFailed}</p><Button variant="secondary" size="sm" onClick={() => { assigned.refetch(); done.refetch(); }}>{c.retry}</Button></div>
        : loading ? <p className="text-sm text-text-secondary">{c.loading}</p>
        : <><p className={total ? 't-stat-2 tabular-nums' : 'text-sm text-text-secondary'}>{total ? (c.lang === 'ko' ? `${total}건` : `${total} items`) : c.homeZero}</p>
          {waiting > 0 && <p className="mt-1 text-xs text-text-secondary">{c.lang === 'ko' ? `조치 완료 · 효과 확인 대기 ${waiting}건` : `Done · Awaiting effect check: ${waiting}`}</p>}</>}
    </div>
    {!denied && <PlatformLink href={myAssignmentsLink(linkTo)} aria-label={ready ? countName : `${c.homeTitle} · ${c.homeOpen}`} className="self-start rounded-xs text-xs font-medium text-accent-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{c.homeOpen}</PlatformLink>}
  </section>;
}
