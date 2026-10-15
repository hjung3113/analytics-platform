// THROWAWAY #340 — never merge.
import { OutcomeBanners, OutcomeScope } from './OutcomeScope';
import { X } from 'lucide-react';
import { Fragment, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@ap/kernel';
import { Tabs, TabsContent, TabsList, TabsTrigger, useDetailPanelSlot, usePrototype, type ProtoVariant } from '@ap/ui';

/** §13: URL-controlled detail content rendered into the shell-owned docked slot. */
export function DetailDrawer({ title, subtitle, headerActions, context, tabs, onClose, tab, onTabChange }: {
  title: ReactNode; subtitle?: ReactNode; headerActions?: ReactNode; context?: ReactNode;
  tabs: { id: string; label: ReactNode; content: ReactNode }[];
  onClose: () => void; tab?: string; onTabChange?: (tab: string) => void;
}) {
  const host = useDetailPanelSlot();
  return host ? createPortal(<OutcomeScope><DetailContent title={title} subtitle={subtitle} headerActions={headerActions} context={context} tabs={tabs} onClose={onClose} tab={tab} onTabChange={onTabChange} /></OutcomeScope>, host) : null;
}

// THROWAWAY #340 — never merge. Tab-row selection-marker variants compared on /equipment (?variant=).
// Radix roles, aria-selected, arrow keys, data flow, and tab/onTabChange are untouched; only the
// rendered classes of TabsList/TabsTrigger and the marker spans differ per variant. `cn` in the
// FeedbackOps primitive is tailwind-merge, so these classes override the pill defaults on conflict.
const LIST_CLASS: Record<ProtoVariant, string> = {
  A: 'mx-5 mt-3 w-fit',
  C: 'mx-5 mt-3 w-fit',
  // B·D: flat row (no pill background/padding/radius) with a 1px baseline, spanning the panel
  // width. Narrow panels scroll horizontally instead of wrapping.
  B: 'mx-5 mt-3 flex h-auto w-auto justify-start overflow-x-auto rounded-none bg-transparent p-0 shadow-[inset_0_-1px_0_var(--color-border-subtle)]',
  // D: the baseline is an inset shadow, so the active face's card background paints over it.
  D: 'mx-5 mt-3 flex h-auto w-auto items-end justify-start overflow-x-auto rounded-none bg-transparent p-0 shadow-[inset_0_-1px_0_var(--color-border-subtle)]',
};
const TRIGGER_CLASS: Record<ProtoVariant, string> = {
  A: '',
  // B: underline bar + weight. Offset-0 focus ring so the ring does not hide the marker bar.
  B: 'group relative shrink-0 rounded-none text-text-secondary hover:text-text-primary focus-visible:ring-offset-0 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none',
  // C: FeedbackOps pill kept; only a 1px border and weight mark the selection (transparent border
  // on unselected keeps the size constant).
  C: 'border border-transparent data-[state=active]:border-border-control data-[state=active]:font-semibold data-[state=active]:forced-colors:border-[CanvasText]',
  // D: contained — active tab gets side+top borders, card surface, and a top accent bar, covering
  // the list baseline (-mb-px, no bottom border) to read as one face with the panel body.
  D: 'group relative shrink-0 rounded-b-none rounded-t-md border-x border-t border-transparent text-text-secondary hover:text-text-primary focus-visible:ring-offset-0 data-[state=active]:border-x-border-subtle data-[state=active]:border-t-border-subtle data-[state=active]:font-semibold data-[state=active]:forced-colors:border-x-[CanvasText] data-[state=active]:forced-colors:border-t-[CanvasText]',
};

function DetailContent({ title, subtitle, headerActions, context, tabs, onClose, tab, onTabChange }: Parameters<typeof DetailDrawer>[0]) {
  const { lang } = useI18n();
  const variant = usePrototype();
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => {
      // Do not steal focus from a user who has already returned to the list.
      if (panel.current?.contains(document.activeElement) || document.activeElement === document.body) {
        const target = opener?.isConnected && opener !== document.body ? opener : document.getElementById('platform-main');
        target?.focus({ preventScroll: true });
      }
    };
  }, []);
  return <div ref={panel} role="dialog" tabIndex={-1} aria-modal="false" aria-labelledby={`${id}-t`}
    onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); onClose(); } }}
    className="flex h-full min-h-0 w-full flex-col bg-surface-detail">
    <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        <h2 id={`${id}-t`} className="t-section-title truncate">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1">
        {headerActions}
        <button ref={close} type="button" onClick={onClose} aria-label={lang === 'ko' ? '상세 닫기' : 'Close details'} className="grid size-8 place-items-center rounded-sm text-text-muted hover:bg-surface-sunken hover:text-text-primary"><X className="size-4" aria-hidden /></button>
      </div>
    </header>
    {context && <div className="border-b border-border-subtle bg-surface-sunken px-5 py-2 text-xs text-text-secondary">{context}</div>}
    <OutcomeBanners />
    <Tabs value={tab} defaultValue={tab ? undefined : tabs[0].id} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
      <TabsList aria-label={lang === 'ko' ? '상세 탭' : 'Detail tabs'} className={LIST_CLASS[variant]}>
        {tabs.map(tb => (
          <TabsTrigger key={tb.id} value={tb.id} className={TRIGGER_CLASS[variant]}>
            {/* B·C·D: an invisible semibold copy of a plain-string label reserves the bold width so
                selection does not shift neighbouring tabs. Non-string labels render as-is. */}
            {variant === 'A' || typeof tb.label !== 'string' ? tb.label : (
              <span className="grid">
                <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap font-semibold">{tb.label}</span>
                <span className="col-start-1 row-start-1">{tb.label}</span>
              </span>
            )}
            {variant === 'B' && <span data-current-marker aria-hidden className="absolute inset-x-3 bottom-0 hidden h-0.5 rounded-pill bg-accent-primary forced-colors:bg-[CanvasText] group-data-[state=active]:block" />}
            {variant === 'D' && <span data-current-marker aria-hidden className="absolute inset-x-0 top-0 hidden h-0.5 bg-accent-primary forced-colors:bg-[CanvasText] group-data-[state=active]:block" />}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map(tb => <TabsContent key={tb.id} value={tb.id} className="min-h-0 flex-1 overflow-auto px-5 py-3">{tb.content}</TabsContent>)}
    </Tabs>
    </div>;
}

// B-12 follow-up: a long technical key folds at camelCase word boundaries instead of dropping its
// last character. <wbr> is a break opportunity only — textContent and the accessible name stay the
// original string. Labels that are not plain strings render as-is.
function foldedLabel(label: string): ReactNode {
  return label.split(/(?<=[a-z])(?=[A-Z])/).map((part, i) => (
    <Fragment key={i}>{i > 0 && <wbr />}{part}</Fragment>
  ));
}

export function Field({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border-subtle py-1.5 text-sm last:border-0">
    <dt className="min-w-0 break-words text-text-muted">{typeof label === 'string' ? foldedLabel(label) : label}</dt>
    <dd className={mono ? 't-mono' : 'tabular'}>{children}</dd>
  </div>;
}
