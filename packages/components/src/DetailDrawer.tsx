import { OutcomeBanners, OutcomeScope } from './OutcomeScope';
import { X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
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
      <TabsList aria-label={lang === 'ko' ? '상세 탭' : 'Detail tabs'} className="mx-5 mt-3 w-fit bg-surface-sunken text-text-secondary">
        {tabs.map(tb => <TabsTrigger key={tb.id} value={tb.id} className="text-xs">{tb.label}</TabsTrigger>)}
      </TabsList>
      {tabs.map(tb => <TabsContent key={tb.id} value={tb.id} className="min-h-0 flex-1 overflow-auto px-5 py-3">{tb.content}</TabsContent>)}
    </Tabs>
    </div>;
}

export function Field({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border-subtle py-1.5 text-sm last:border-0">
    <dt className="text-text-muted">{label}</dt>
    <dd className={mono ? 't-mono' : 'tabular'}>{children}</dd>
  </div>;
}
