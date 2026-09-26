import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../kernel/i18n';
import { usePlatform } from '../kernel/platform';
import { LoadingBlock } from '../platform/StateView';
import { cn } from '@ap/ui';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const COLLAPSE_KEY = 'platform:sidebar-collapsed';

/** Application Shell (§7): 270/64px sidebar, 54px top bar; pages render only into the content slot. */
export function AppShell({ children }: { children: ReactNode }) {
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
    <div className="shrink-0">{<Sidebar collapsed={collapsed} onToggle={toggle} />}</div>
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar />
      <main id="platform-main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
        <Suspense fallback={<div className="p-5"><LoadingBlock rows={6} height={320} /></div>}>{children}</Suspense>
      </main>
    </div>
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
