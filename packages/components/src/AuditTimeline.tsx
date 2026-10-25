import { useEffect, useRef } from 'react';
import { ChevronDown, FilePen, FilePlus2, FileX2, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { useI18n, type AuditMore } from '@ap/kernel';
import { Button, StatusBadge } from '@ap/ui';
import { formatInstant, instantEpochMs, type AuditEvent } from '@ap/contracts';

const ICONS = { create: FilePlus2, update: FilePen, retire: FileX2, sync: RefreshCw, delete: Trash2 };
const LABEL = {
  create: { ko: '생성', en: 'Created' }, update: { ko: '변경', en: 'Updated' }, retire: { ko: '유효 종료', en: 'Retired' }, sync: { ko: '동기화', en: 'Synced' }, delete: { ko: '삭제', en: 'Deleted' },
};
// Same words as the admin audit table's source column (W-336 F3); kept local — components never import menu helpers.
const SOURCE = { user: { ko: '사용자', en: 'User' }, system: { ko: '시스템', en: 'System' } };

/** Platform AuditTimeline (§13): who/when/what changed with before→after, newest first. Domain supplies events.
 *  `at` is a real instant (§6.3): sorted by instantEpochMs desc (string compare is wrong once `Z` and `+09:00`
 *  both occur), id asc as tie-break, and printed with formatInstant so the viewer's zone applies. A bad `at`
 *  throws — producers are in this repo, so the error surfaces instead of hiding behind a fallback. `changes`
 *  values are text, not instants: a naive validTo prints digit-for-digit and never goes through formatInstant.
 *  `more` (ADR-0085, from `useEntityAudit`) adds the older-pages control after the list; without it the markup is
 *  the plain list. The whole list, appended pages included, is sorted by the same comparison. */
export function AuditTimeline({ events, more }: { events: readonly AuditEvent[]; more?: AuditMore }) {
  const { t, tx, lang } = useI18n();
  const ko = lang === 'ko';
  const buttonRef = useRef<HTMLButtonElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  // Whether focus is on the button, kept by events: when the load ends the list the button is gone before the effect runs.
  const buttonFocused = useRef(false);
  const last = more?.last ?? null;
  // After a load succeeds, focus moves to the first appended change — only if the user was still on the button (06 §26).
  useEffect(() => {
    if (!last) return;
    const button = buttonRef.current;
    if (button ? document.activeElement !== button : !buttonFocused.current) return;
    (last.firstId ? itemRefs.current.get(last.firstId) : captionRef.current)?.focus();
  }, [last]);
  if (!events.length) return <p className="rounded-md bg-surface-sunken p-3 text-xs text-text-secondary">{ko ? '변경 이력이 없습니다.' : 'No changes recorded.'}</p>;
  const sorted = [...events].sort((a, b) => {
    const byAt = instantEpochMs(b.at) - instantEpochMs(a.at);
    return byAt !== 0 ? byAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const list = <ol aria-busy={more ? more.status === 'loading' : undefined} className="relative space-y-3 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-border-subtle">
    {sorted.map(e => {
      const Icon = ICONS[e.action];
      return <li key={e.id} ref={node => { if (node) itemRefs.current.set(e.id, node); else itemRefs.current.delete(e.id); }} tabIndex={more ? -1 : undefined}
        className={more ? 'relative grid grid-cols-[24px_1fr] gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus-ring' : 'relative grid grid-cols-[24px_1fr] gap-3'}>
        <span className="z-[1] grid size-6 place-items-center rounded-pill border border-border-subtle bg-surface-card text-text-muted"><Icon className="size-3.5" aria-hidden /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-text-primary">{tx(LABEL[e.action])}</span>
            <StatusBadge tone={e.source === 'system' ? 'neutral' : 'info'}>{tx(SOURCE[e.source])}</StatusBadge>
            <span className="t-mono text-text-secondary">{e.actor}</span>
            <time className="ml-auto tabular text-text-muted" dateTime={e.at}>{formatInstant(e.at, lang)}</time>
          </div>
          {e.changes && <dl className="mt-1 space-y-0.5 rounded-md bg-surface-sunken px-2 py-1.5 text-xs">
            {Object.entries(e.changes).map(([field, [before, after]]) => <div key={field} className="flex flex-wrap gap-x-2">
              <dt className="t-mono text-text-secondary">{field}</dt>
              <dd className="tabular"><span className="text-text-danger-label line-through decoration-1">{before ?? '∅'}</span> → <span className="text-text-success-label">{after ?? '∅'}</span></dd>
            </div>)}
          </dl>}
          {e.reason && <p className="mt-1 text-xs text-text-secondary">{e.reason}</p>}
        </div>
      </li>;
    })}
  </ol>;
  if (!more) return list;

  const endText = ko ? '더 이전 변경 이력이 없습니다.' : 'No older changes.';
  const loading = more.status === 'loading';
  const failed = more.status === 'error' ? more.error : null;
  const forbidden = failed?.outcome === 'forbidden';
  const announcement = last && (last.added > 0 ? (ko ? `변경 이력 ${last.added}건을 더 불러왔습니다.` : `Loaded ${last.added} more ${last.added === 1 ? 'change' : 'changes'}.`) : '') + (more.status === 'end' ? `${last.added > 0 ? ' ' : ''}${endText}` : '');
  return <div className="space-y-3">
    {list}
    {more.status === 'end' ? (last && <p ref={captionRef} tabIndex={-1} className="t-caption text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{endText}</p>)
      : forbidden ? <p className="t-caption text-text-secondary">{ko ? '이전 변경 이력을 볼 권한이 없습니다.' : 'You do not have permission to view older changes.'}</p>
      : <div className="space-y-2">
        <Button ref={buttonRef} type="button" variant="secondary" size="sm" className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-disabled={loading || undefined} aria-busy={loading || undefined}
          onFocus={() => { buttonFocused.current = true; }}
          onBlur={event => {
            const node = event.currentTarget;
            // A blur caused by removing the button leaves it disconnected; only a real departure clears the flag.
            if (event.relatedTarget === null) queueMicrotask(() => { if (node.isConnected) buttonFocused.current = false; });
            else buttonFocused.current = false;
          }}
          onClick={() => { if (!loading) more.load(); }}>
          {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : failed ? <RotateCw className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
          {failed ? (ko ? '다시 시도' : 'Try again') : ko ? '이전 변경 이력 더 보기' : 'Load older changes'}
        </Button>
        {failed && <p role="alert" className="t-caption text-text-danger-label">
          {ko ? '이전 변경 이력을 불러오지 못했습니다.' : 'Could not load older changes.'} <span className="t-mono">{t('correlationId')}: {failed.correlationId}</span>
        </p>}
      </div>}
    <p role="status" className="sr-only">{last && <span key={last.seq}>{announcement}</span>}</p>
  </div>;
}
