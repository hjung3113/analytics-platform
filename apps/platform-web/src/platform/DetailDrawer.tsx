import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../kernel/i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';

function useMinWidth1440(): boolean {
  const query = '(min-width: 1440px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return wide;
}

/**
 * §20 Drawer: table-row detail that keeps the list usable. Non-modal on purpose — Radix Sheet either traps focus
 * (modal) or dismisses on outside interaction (non-modal), both of which break working with the table behind it.
 */
export function DetailDrawer({ title, subtitle, headerActions, context, tabs, onClose, tab, onTabChange }: {
  title: ReactNode; subtitle?: ReactNode; headerActions?: ReactNode; context?: ReactNode;
  tabs: { id: string; label: ReactNode; content: ReactNode }[];
  onClose: () => void; tab?: string; onTabChange?: (tab: string) => void;
}) {
  const { lang } = useI18n();
  const close = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const id = useId();
  const wide = useMinWidth1440();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => {
      document.getElementById('root')?.removeAttribute('inert');
      opener?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const main = document.getElementById('platform-main');
    const root = document.getElementById('root');
    if (wide) main?.classList.add('wide:pr-[32rem]');
    else root?.setAttribute('inert', '');
    return () => {
      root?.removeAttribute('inert');
      main?.classList.remove('wide:pr-[32rem]');
    };
  }, [wide]);
  useEffect(() => {
    if (wide) return;
    const aside = asideRef.current;
    if (!aside) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !aside) return;
      const items = [...aside.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      else if (!aside.contains(active)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [wide, onClose]);
  const tree = <>
    {!wide && <div data-testid="drawer-scrim" className="fixed inset-0 z-30 bg-text-primary/45" onClick={onClose} aria-hidden />}
    <aside ref={asideRef} role="dialog" aria-modal={wide ? 'false' : 'true'} aria-labelledby={`${id}-t`}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    className={`fixed bottom-0 right-0 top-[54px] ${wide ? 'z-30' : 'z-40'} flex w-detail-panel max-w-[95vw] flex-col border-l border-border-strong bg-surface-detail shadow-[-8px_0_24px_-12px_rgba(17,24,39,0.18)]`}>
    <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        <h2 id={`${id}-t`} className="t-section-title truncate">{title}</h2>
        {subtitle && <p className="text-[12px] text-text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1">
        {headerActions}
        <button ref={close} type="button" onClick={onClose} aria-label={lang === 'ko' ? '상세 닫기' : 'Close details'} className="grid size-8 place-items-center rounded-sm text-text-muted hover:bg-surface-sunken hover:text-text-primary"><X className="size-4" aria-hidden /></button>
      </div>
    </header>
    {context && <div className="border-b border-border-subtle bg-surface-sunken px-5 py-2 text-[12px] text-text-secondary">{context}</div>}
    <Tabs value={tab} defaultValue={tab ? undefined : tabs[0].id} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
      <TabsList aria-label={lang === 'ko' ? '상세 탭' : 'Detail tabs'} className="mx-5 mt-3 w-fit bg-surface-sunken">
        {tabs.map(tb => <TabsTrigger key={tb.id} value={tb.id} className="text-[12px]">{tb.label}</TabsTrigger>)}
      </TabsList>
      {tabs.map(tb => <TabsContent key={tb.id} value={tb.id} className="min-h-0 flex-1 overflow-auto px-5 py-3">{tb.content}</TabsContent>)}
    </Tabs>
    </aside>
  </>;
  return wide ? tree : createPortal(tree, document.body);
}

export function Field({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border-subtle py-1.5 text-[13px] last:border-0">
    <dt className="text-text-muted">{label}</dt>
    <dd className={mono ? 't-mono' : 'tabular'}>{children}</dd>
  </div>;
}
