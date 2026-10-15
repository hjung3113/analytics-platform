import { OutcomeBanners, OutcomeScope } from './OutcomeScope';
import { X } from 'lucide-react';
import { Fragment, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@ap/kernel';
import { Tabs, TabsContent, TabsList, TabsTrigger, useDetailPanelSlot } from '@ap/ui';

/** §13: URL-controlled detail content rendered into the shell-owned docked slot. */
export function DetailDrawer({ title, subtitle, headerActions, context, tabs, onClose, tab, onTabChange }: {
  title: ReactNode; subtitle?: ReactNode; headerActions?: ReactNode; context?: ReactNode;
  tabs: { id: string; label: ReactNode; content: ReactNode }[];
  onClose: () => void; tab?: string; onTabChange?: (tab: string) => void;
}) {
  const host = useDetailPanelSlot();
  return host ? createPortal(<OutcomeScope><DetailContent title={title} subtitle={subtitle} headerActions={headerActions} context={context} tabs={tabs} onClose={onClose} tab={tab} onTabChange={onTabChange} /></OutcomeScope>, host) : null;
}

function DetailContent({ title, subtitle, headerActions, context, tabs, onClose, tab, onTabChange }: Parameters<typeof DetailDrawer>[0]) {
  const { lang } = useI18n();
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // #353: whether focus lives inside the panel. Unmount blur has no relatedTarget, so it must not
  // clear this; only a real move to an outside element or an outside pointerdown does (06 §13, §26).
  const focusInside = useRef(false);
  const id = useId();
  const tabIds = tabs.map(tb => tb.id).join('\u0000');
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
  useLayoutEffect(() => {
    // A pointerdown outside the panel is the user choosing a focus destination (often body).
    const onPointerDown = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) focusInside.current = false; };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);
  useLayoutEffect(() => {
    // Radix writes aria-selected in the same commit as the controlled value, so the new selected
    // trigger is already in the DOM here.
    if (!focusInside.current || document.activeElement !== document.body) return;
    const target = panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? panel.current;
    target?.focus({ preventScroll: true });
  }, [tab, tabIds]);
  return <div ref={panel} role="dialog" tabIndex={-1} aria-modal="false" aria-labelledby={`${id}-t`}
    onFocus={() => { focusInside.current = true; }}
    onBlur={e => { const to = e.relatedTarget as Node | null; if (to && !panel.current?.contains(to)) focusInside.current = false; }}
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
      <TabsList aria-label={lang === 'ko' ? '상세 탭' : 'Detail tabs'} className="mx-5 mt-3 w-auto">
        {tabs.map(tb => <TabsTrigger key={tb.id} value={tb.id}>{tb.label}</TabsTrigger>)}
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
