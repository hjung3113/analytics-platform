import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import { LoadingBlock } from '@ap/components';
import { cn, DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { CommandPalette } from './CommandPalette';
import { AppSidebar } from './AppSidebar';
import { AppRail } from './AppRail';

const COLLAPSE_KEY = 'platform:sidebar-collapsed';

/** Application Shell (§7): 52px rail, 240/56px sidebar, page-owned 50px header; pages render into content and the registered detail slot. */
export function AppShell({ children }: { children: ReactNode }) {
  return <DetailPanelSlotProvider><ShellLayout>{children}</ShellLayout></DetailPanelSlotProvider>;
}

function ShellLayout({ children }: { children: ReactNode }) {
  const detail = useDetailPanelSlotHost();
  const { lang } = useI18n();
  const [collapsed, setCollapsed] = useState(() => {
    try { const v = localStorage.getItem(COLLAPSE_KEY); return v === null ? window.innerWidth < 1440 : v === '1'; } catch { return false; }
  });
  const toggle = () => setCollapsed(c => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <div className="flex h-full overflow-hidden">
    <a href="#platform-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface-card focus:px-3 focus:py-2">Skip to content</a>
    <AppRail />
    <AppSidebar collapsed={collapsed} onToggle={toggle} />
    <div className="flex min-w-0 flex-1 flex-col">
      <main id="platform-main" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
        <Suspense fallback={<div className="p-5"><LoadingBlock rows={6} height={320} /></div>}>{children}</Suspense>
      </main>
    </div>
    <aside ref={detail.ref} hidden={!detail.open} aria-label={lang === 'ko' ? '상세 패널' : 'Detail panel'} data-open={detail.open}
      className="h-full shrink-0 overflow-hidden border-border-subtle bg-surface-detail"
      style={{ width: detail.open ? 'clamp(360px, var(--detail-panel-width, 440px), 520px)' : 0, minWidth: detail.open ? 360 : 0, maxWidth: 520, borderLeftWidth: detail.open ? 1 : 0 }} />
    <CommandPalette />
    <Toasts />
  </div>;
}

function Toasts() {
  const { toasts, dismissToast } = usePlatform();
  const { lang } = useI18n();
  return <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(420px,90vw)] flex-col gap-2">
    {toasts.map(tst => {
      const Icon = tst.tone === 'danger' ? XCircle : tst.tone === 'warning' ? AlertTriangle : Info;
      return <div key={tst.id} role={tst.tone === 'danger' ? 'alert' : 'status'} className={cn('pointer-events-auto flex items-start gap-2 rounded-md border bg-surface-card px-3 py-2.5 text-[12px] shadow-lg',
        tst.tone === 'danger' ? 'border-accent-danger' : tst.tone === 'warning' ? 'border-accent-warn' : 'border-border-strong')}>
        <Icon className={cn('mt-0.5 size-4 shrink-0', tst.tone === 'danger' ? 'text-accent-danger' : tst.tone === 'warning' ? 'text-accent-warn' : 'text-accent-primary')} aria-hidden />
        <span className="flex-1">{tst.text}</span>
        <button type="button" aria-label={lang === 'ko' ? '닫기' : 'Dismiss'} onClick={() => dismissToast(tst.id)} className="text-text-muted hover:text-text-primary"><X className="size-3.5" aria-hidden /></button>
      </div>;
    })}
  </div>;
}
