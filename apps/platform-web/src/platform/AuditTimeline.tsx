import { FilePen, FilePlus2, FileX2, RefreshCw } from 'lucide-react';
import { useI18n } from '../kernel/i18n';
import { StatusBadge } from './StatusBadge';
import type { AuditEvent } from '@ap/contracts';

const ICONS = { create: FilePlus2, update: FilePen, retire: FileX2, sync: RefreshCw };
const LABEL = {
  create: { ko: '생성', en: 'Created' }, update: { ko: '변경', en: 'Updated' }, retire: { ko: '유효 종료', en: 'Retired' }, sync: { ko: '동기화', en: 'Synced' },
};

/** Platform AuditTimeline (§13): who/when/what changed with before→after, newest first. Domain supplies events. */
export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  const { tx, lang } = useI18n();
  if (!events.length) return <p className="rounded-md bg-surface-sunken p-3 text-[12px] text-text-secondary">{lang === 'ko' ? '변경 이력이 없습니다.' : 'No changes recorded.'}</p>;
  const sorted = [...events].sort((a, b) => (a.at < b.at ? 1 : -1));
  return <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-border-subtle">
    {sorted.map(e => {
      const Icon = ICONS[e.action];
      return <li key={e.id} className="relative grid grid-cols-[24px_1fr] gap-3">
        <span className="z-[1] grid size-6 place-items-center rounded-pill border border-border-subtle bg-surface-card text-text-muted"><Icon className="size-3.5" aria-hidden /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-semibold text-text-primary">{tx(LABEL[e.action])}</span>
            <StatusBadge tone={e.source === 'system' ? 'neutral' : 'info'}>{e.source === 'system' ? 'system' : 'user'}</StatusBadge>
            <span className="t-mono text-text-secondary">{e.actor}</span>
            <time className="ml-auto tabular text-text-muted" dateTime={e.at}>{e.at.replace('T', ' ').slice(0, 16)}</time>
          </div>
          {e.changes && <dl className="mt-1 space-y-0.5 rounded-md bg-surface-sunken px-2 py-1.5 text-[12px]">
            {Object.entries(e.changes).map(([field, [before, after]]) => <div key={field} className="flex flex-wrap gap-x-2">
              <dt className="t-mono text-text-muted">{field}</dt>
              <dd className="tabular"><span className="text-text-danger line-through decoration-1">{before ?? '∅'}</span> → <span className="text-text-success">{after ?? '∅'}</span></dd>
            </div>)}
          </dl>}
          {e.reason && <p className="mt-1 text-[12px] text-text-secondary">{e.reason}</p>}
        </div>
      </li>;
    })}
  </ol>;
}
