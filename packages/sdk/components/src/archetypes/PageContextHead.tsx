import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button } from '@ap/ui';
import type { PageFilterSummaryItem } from '../filters/PageFilterBar';
import { useCompactPageDensity } from '../pageDensity';
import { useCollapsePreference } from '../filters/useCollapsePreference';

/** Notes above the page-owned extension; the same stack on a flow page and in an expanded fill head. */
export function PageHeadBody({ notes, extension }: { notes: readonly ReactNode[]; extension: ReactNode }) {
  const shown = notes.filter(note => note != null && note !== false);
  return <>
    {shown.length > 0 && <div data-page-notes className="mb-2 space-y-2">{shown.map((note, index) => <div key={index}>{note}</div>)}</div>}
    {extension}
  </>;
}

export type PageContextHeadProps = {
  /** Per-menu preference id: the head memory is `platform:page-head-collapsed:<menuId>`. */
  menuId: string;
  notes: readonly ReactNode[];
  extension: ReactNode;
  /** Applied labels of the page conditions (never a draft label: the collapsed line sits above results). */
  summary: readonly PageFilterSummaryItem[];
  /** Any draft page key of this menu differs from the applied one. */
  pendingChanges: boolean;
  /** Invalid page keys: the head starts expanded (the body message points at the reset inside it). */
  issueCount: number;
};

/**
 * Fill pages: the head area (notes + extension) behind a disclosure. Collapsed by default; one line of applied chips plus the
 * markers that must stay visible (pending, needs-attention, notes count). The content stays mounted with `hidden`, so the
 * consumer's state and the `aria-controls` target survive a toggle (06 §12.8).
 */
export function PageContextHead({ menuId, notes, extension, summary, pendingChanges, issueCount }: PageContextHeadProps) {
  const { t } = useI18n();
  const id = useId();
  const contentId = `${id}-content`;
  const summaryId = `${id}-summary`;
  const summaryText = [
    summary.map(item => `${item.label} ${item.value}`).join(' · '),
    pendingChanges ? t('pageFilterPendingChanges') : '',
    issueCount > 0 ? t('pageIssuesCount', { count: issueCount }) : '',
  ].filter(Boolean).join(' · ');
  const compact = useCompactPageDensity();
  const chips = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const { collapsed, toggle, expandRef, collapseRef, liveText } = useCollapsePreference(`platform:page-head-collapsed:${menuId}`, summaryText, true, issueCount > 0);
  // The fade shows only while the chip list is cut off at the right edge.
  useEffect(() => {
    const element = chips.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [collapsed, summaryText]);

  return <div data-page-head data-collapsed={collapsed ? 'true' : 'false'} className={compact ? 'px-4 pt-3' : 'px-8 pt-3'}>
    {collapsed && <div data-page-head-line className="mb-1 flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card px-3 py-1.5 text-xs text-text-secondary">
      <div className="relative flex min-w-0 flex-1">
      <div ref={chips} id={summaryId} title={summaryText} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {summary.map((item, index) => <span key={item.key} className="shrink-0">
          <span className="font-normal text-text-secondary">{item.label}</span> <span className="font-medium text-text-primary">{item.value}</span>
          {index < summary.length - 1 && <span aria-hidden className="ml-1.5 text-text-muted">·</span>}
        </span>)}
      </div>
      {overflowing && <span data-page-head-fade aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface-card to-transparent" />}
      </div>
      {pendingChanges && <span data-page-head-pending className="shrink-0 whitespace-nowrap font-medium text-text-primary">{t('pageFilterPendingChanges')}</span>}
      {issueCount > 0 && <span data-page-head-issues className="shrink-0 whitespace-nowrap font-medium text-text-danger-label">{t('pageIssuesCount', { count: issueCount })}</span>}
      {notes.length > 0 && <span data-page-head-notes className="shrink-0 whitespace-nowrap text-text-muted">{t('pageNotesCount', { count: notes.length })}</span>}
      <Button ref={expandRef} type="button" variant="secondary" size="toolbar" className="shrink-0" onClick={() => toggle(false)}
        aria-expanded="false" aria-controls={contentId} aria-describedby={summaryId} aria-label={t('pageHeadExpand')}>
        <ChevronDown className="size-3.5" aria-hidden />{t('expandShort')}
      </Button>
    </div>}
    {/* Same id and mounted in both states: aria-controls never dangles and the extension keeps its state. */}
    <div id={contentId} hidden={collapsed}>
      <PageHeadBody notes={notes} extension={extension} />
      <div className="flex justify-end">
        <Button ref={collapseRef} type="button" variant="ghost" size="toolbar" onClick={() => toggle(true)}
          aria-expanded="true" aria-controls={contentId} aria-label={t('pageHeadCollapse')}>
          <ChevronUp className="size-3.5" aria-hidden />{t('collapseShort')}
        </Button>
      </div>
    </div>
    {/* Always mounted; carries only real summary changes that happened while collapsed. */}
    <div aria-live="polite" className="sr-only">{liveText}</div>
  </div>;
}
