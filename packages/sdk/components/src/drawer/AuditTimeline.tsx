import { useEffect, useRef } from 'react';
import { ChevronDown, FilePen, FilePlus2, FileX2, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react';
import { useI18n, useMessages, type AuditMore } from '@ap/kernel';
import { Button, StatusBadge } from '@ap/ui';
import { compareAuditEvents, formatInstant, type AuditEvent } from '@ap/contracts';
import { COMPONENTS_MESSAGES } from '../messages';

const ICONS = { create: FilePlus2, update: FilePen, retire: FileX2, sync: RefreshCw, delete: Trash2 };
const ACTION_KEY = {
  create: 'auditActionCreate',
  update: 'auditActionUpdate',
  retire: 'auditActionRetire',
  sync: 'auditActionSync',
  delete: 'auditActionDelete',
} as const;
// Same words as the admin audit table's source column (W-336 F3); kept local — components never import menu helpers.
const SOURCE_KEY = { user: 'auditSourceUser', system: 'auditSourceSystem' } as const;

/** Platform AuditTimeline (§13): who/when/what changed with before→after, newest first. Domain supplies events.
 *  `at` is a real instant (§6.3): sorted by instantEpochMs desc (string compare is wrong once `Z` and `+09:00`
 *  both occur), id asc as tie-break, and printed with formatInstant so the viewer's zone applies. A bad `at`
 *  throws — producers are in this repo, so the error surfaces instead of hiding behind a fallback. `changes`
 *  values are text, not instants: a naive validTo prints digit-for-digit and never goes through formatInstant.
 *  `more` (ADR-0085, from `useEntityAudit`) adds the older-pages control after the list; without it the markup is
 *  the plain list. The whole list, appended pages included, is sorted by the same comparison. */
export function AuditTimeline({ events, more }: { events: readonly AuditEvent[]; more?: AuditMore }) {
  const { t, lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
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
  if (!events.length) return <p className="rounded-md bg-surface-sunken p-3 text-xs text-text-secondary">{m('auditEmpty')}</p>;
  const sorted = [...events].sort(compareAuditEvents);
  const list = <ol aria-busy={more ? more.status === 'loading' : undefined} className="relative space-y-3 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-border-subtle">
    {sorted.map(e => {
      const Icon = ICONS[e.action];
      return <li key={e.id} ref={node => { if (node) itemRefs.current.set(e.id, node); else itemRefs.current.delete(e.id); }} tabIndex={more ? -1 : undefined}
        className={more ? 'relative grid grid-cols-[24px_1fr] gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus-ring' : 'relative grid grid-cols-[24px_1fr] gap-3'}>
        <span className="z-[1] grid size-6 place-items-center rounded-pill border border-border-subtle bg-surface-card text-text-muted"><Icon className="size-3.5" aria-hidden /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-text-primary">{m(ACTION_KEY[e.action])}</span>
            <StatusBadge tone={e.source === 'system' ? 'neutral' : 'info'}>{m(SOURCE_KEY[e.source])}</StatusBadge>
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

  const endText = m('auditNoOlder');
  const loading = more.status === 'loading';
  const failed = more.status === 'error' ? more.error : null;
  const forbidden = failed?.outcome === 'forbidden';
  const announcement = last && (last.added > 0 ? m(last.added === 1 ? 'auditLoadedMoreOne' : 'auditLoadedMoreMany', { count: last.added }) : '') + (more.status === 'end' ? `${last.added > 0 ? ' ' : ''}${endText}` : '');
  return <div className="space-y-3">
    {list}
    {more.status === 'end' ? (last && <p ref={captionRef} tabIndex={-1} className="t-caption text-text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{endText}</p>)
      : forbidden ? <p className="t-caption text-text-secondary">{m('auditForbidden')}</p>
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
          {failed ? m('auditRetry') : m('auditLoadOlder')}
        </Button>
        {failed && <p role="alert" className="t-caption text-text-danger-label">
          {m('auditLoadError')} <span className="t-mono">{t('correlationId')}: {failed.correlationId}</span>
        </p>}
      </div>}
    <p role="status" className="sr-only">{last && <span key={last.seq}>{announcement}</span>}</p>
  </div>;
}
