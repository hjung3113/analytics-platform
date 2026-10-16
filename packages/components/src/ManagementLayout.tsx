// THROWAWAY #306 — never merge.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PanelLeftClose, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button, Popover, PopoverContent, PopoverTrigger, usePrototype } from '@ap/ui';

export type ManagementLayoutProps = {
  /** Page-owned filters, usually a column PageFilterBar or its form. */
  filter?: ReactNode;
  /** Number of filter page keys with URL values, excluding sort/page/focus/tab. */
  activeFilterCount?: number;
  /** #306 prototype (variant B): unapplied draft changes, shown next to the applied count on the collapsed trigger. */
  pendingFilterCount?: number;
  /** The table consumes the collapsed/narrow filter button in its filters slot. */
  table: (filterSlot: ReactNode | undefined) => ReactNode;
  /** Detail content continues to use the shell's detail slot (ADR-0013). */
  drawer?: ReactNode;
};

const COLLAPSE_KEY = 'platform:filter-rail-collapsed';
function initialCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

/** Management slots (06 §12.6): respond to available content width, including a docked detail. */
export function ManagementLayout({ filter, activeFilterCount = 0, pendingFilterCount = 0, table, drawer }: ManagementLayoutProps) {
  const variant = usePrototype();
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<Element | null>(null);
  const rail = useRef<HTMLElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const measuredWide = useRef(false);
  const bodyId = useId();
  const titleId = useId();
  const [wide, setWide] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [open, setOpen] = useState(false);
  const hasFilter = filter != null && filter !== false;
  const railVisible = hasFilter && wide && !collapsed;

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const nextWide = element.getBoundingClientRect().width >= 960;
      if (nextWide !== measuredWide.current) {
        const active = document.activeElement;
        if (active && (rail.current?.contains(active) || popover.current?.contains(active) || filterButton.current === active)) {
          pendingFocus.current = active;
        }
        measuredWide.current = nextWide;
      }
      setWide(nextWide);
      if (nextWide) setOpen(false);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const previous = pendingFocus.current;
    pendingFocus.current = null;
    const active = document.activeElement;
    if (active !== previous && active !== document.body) return;
    (railVisible ? closeButton : filterButton).current?.focus();
  }, [railVisible, wide]);

  const setRailCollapsed = (next: boolean) => {
    pendingFocus.current = document.activeElement;
    setCollapsed(next);
    try {
      if (next) localStorage.setItem(COLLAPSE_KEY, '1');
      else localStorage.removeItem(COLLAPSE_KEY);
    } catch { /* preference stays in memory */ }
  };
  const button = <Button ref={filterButton} type="button" variant="secondary" size={variant === 'C' ? 'sm' : 'md'}
    title={t('expandFilters')} aria-expanded={wide ? false : open} aria-controls={!wide && open ? bodyId : undefined}
    onClick={wide ? () => setRailCollapsed(false) : undefined}>
    <SlidersHorizontal className="size-3.5" aria-hidden />{t('filters')}{variant === 'B'
      ? <>
        {activeFilterCount > 0 && <span className="rounded-full bg-accent-primary-soft px-1.5 text-xs font-semibold tabular">{activeFilterCount}</span>}
        {pendingFilterCount > 0 && <span className="text-xs text-text-secondary">{`+${pendingFilterCount}`}</span>}
      </>
      : activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
  </Button>;
  const filterSlot = !hasFilter || railVisible ? undefined : wide ? button :
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent ref={popover} id={bodyId} onCloseAutoFocus={event => { if (measuredWide.current) event.preventDefault(); }} aria-label={t('filters')} align="start" className="max-h-[70vh] w-80 overflow-y-auto">
        {filter}
      </PopoverContent>
    </Popover>;

  return <div ref={root} className="min-w-0">
    <div className={railVisible ? 'grid grid-cols-[260px_minmax(0,1fr)] items-start gap-4' : 'min-w-0'}>
      {railVisible && <section ref={rail} aria-labelledby={titleId}
        className="sticky top-[calc(var(--page-sticky-offset,0px)_+_12px)] max-h-[calc(100dvh-var(--page-sticky-offset,0px)_-_24px)] flex min-h-0 flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div>
            <h2 id={titleId} className="t-card-title">{t('filters')}</h2>
            {activeFilterCount > 0 && <p className="text-xs text-text-muted">{t('appliedFilterCount', { count: activeFilterCount })}</p>}
          </div>
          <Button ref={closeButton} type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label={t('collapseFilters')}
            title={t('collapseFilters')} aria-expanded="true" aria-controls={bodyId} onClick={() => setRailCollapsed(true)}>
            <PanelLeftClose className="size-4" aria-hidden />
          </Button>
        </header>
        <div id={bodyId} className="min-h-0 overflow-y-auto p-3">{filter}</div>
      </section>}
      <div key="table" className="min-w-0">{table(filterSlot)}</div>
    </div>
    {drawer}
  </div>;
}
