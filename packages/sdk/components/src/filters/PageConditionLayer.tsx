import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useMessages } from '@ap/kernel';
import { Button } from '@ap/ui';
import { PageConditionCategories, type PageConditionCategoriesProps } from './PageConditionCategories';
import { PAGE_CONDITION_MESSAGES } from './pageConditionMessages';
import { scrollContainerOf, useVisibleAreaHeight } from '../visibleArea';

export type PageConditionLayerProps = PageConditionCategoriesProps & {
  id: string;
  open: boolean;
  onClose: () => void;
  globalSummary: ReactNode;
  onEditContext: () => void;
  footer?: ReactNode;
  /** Focus this category on an automatic issue/required-value opening. */
  focusCategoryId?: string;
};

/** Page-body surface, deliberately in place: no portal, scrim, outside dismissal, inert or focus trap. */
export function PageConditionLayer({ id, open, onClose, globalSummary, onEditContext, footer, focusCategoryId, ...categories }: PageConditionLayerProps) {
  const m = useMessages(PAGE_CONDITION_MESSAGES);
  const region = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const height = useVisibleAreaHeight(region, open);
  useLayoutEffect(() => {
    if (!open) return;
    const category = Array.from(content.current?.querySelectorAll<HTMLElement>('[data-page-condition]') ?? []).find(node => node.dataset.pageCondition === focusCategoryId);
    (category?.querySelector<HTMLElement>('[role="heading"]') ?? title.current)?.focus({ preventScroll: true });
  }, [open, focusCategoryId]);
  useLayoutEffect(() => {
    const element = region.current;
    if (!open || !element) return;
    const container = scrollContainerOf(element);
    const update = () => {
      const bottom = container ? container.getBoundingClientRect().top + container.clientHeight : window.innerHeight;
      const available = Math.max(0, bottom - element.getBoundingClientRect().top);
      element.style.setProperty('--page-condition-visible-height', `${Math.min(height ?? available, available)}px`);
    };
    update();
    container?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { container?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [open, height]);
  return <div ref={region} data-page-condition-region className="sticky top-[var(--page-sticky-offset,0px)] z-10 h-0 shrink-0">
    <div id={id} ref={content} hidden={!open} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`}
      className="h-[var(--page-condition-visible-height)] w-[var(--page-condition-layer-width)] max-w-full border-r border-border-subtle bg-surface-card shadow-xl"
      onKeyDown={event => {
        // Portaled inner Selects/popovers own their Escape even though React bubbles it through this surface.
        if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation(); onClose();
      }}>
      {open && <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 space-y-2 border-b border-border-subtle p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id={`${id}-title`} ref={title} tabIndex={-1} className="text-sm font-semibold text-text-primary">{m('title')}</h2>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={m('close')} onClick={onClose}><X className="size-4" aria-hidden /></Button>
          </div>
          <div role="group" aria-label={m('context')} className="space-y-1 text-xs text-text-secondary [overflow-wrap:anywhere]">{globalSummary}</div>
          <button type="button" className="text-xs text-accent-primary underline focus-visible:ring-2 focus-visible:ring-focus-ring" onClick={onEditContext}>{m('editContext')}</button>
        </header>
        <div data-page-condition-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"><PageConditionCategories {...categories} /></div>
        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-subtle p-4">{footer}</footer>}
      </div>}
    </div>
  </div>;
}
