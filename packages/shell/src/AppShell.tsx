import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useEquipmentAxes, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { LoadingBlock } from '@ap/components';
import { cn, DetailPanelSlotProvider, readLocalStorage, useDetailPanelSlotHost, writeLocalStorage } from '@ap/ui';
import { CommandPalette } from './CommandPalette';
import { AppSidebar } from './AppSidebar';
import { PlatformSidebar } from './PlatformSidebar';
import { AppRail } from './AppRail';
import { useVocDrawer, VocDrawer, VocDrawerContext } from './VocDrawer';
import { getProto595 } from './proto595'; // THROWAWAY #595 — never merge.

const COLLAPSE_KEY = 'platform:sidebar-collapsed';

/** Application Shell (§7): 52px rail, 240/56px sidebar, page-owned 50px header; pages render into content and the registered detail slot. */
export function AppShell({ children }: { children: ReactNode }) {
  return <DetailPanelSlotProvider><ShellLayout>{children}</ShellLayout></DetailPanelSlotProvider>;
}

function ShellLayout({ children }: { children: ReactNode }) {
  const detail = useDetailPanelSlotHost();
  const { lang, t } = useI18n();
  const { route, registry, sidebarSpace, platformScreen, slots, global, page, absoluteUrl, session } = useHostPlatform();
  // The board is a platform screen like the home and global utilities: no business-system sidebar (docs/16 §4).
  const globalScreen = platformScreen === 'board' || (route !== null && registry.spaceOf(route.menu) === null);
  const showSidebar = sidebarSpace !== null && !globalScreen;
  const proto595 = getProto595(); // THROWAWAY #595 — never merge.
  // Registry screens outside every space (home, 내 활동, 공지) draw the platform sidebar; the board and unmatched paths do not (ADR-0070).
  const showPlatformSidebar = route !== null && registry.spaceOf(route.menu) === null;
  const [collapsed, setCollapsed] = useState(() => {
    return readLocalStorage(COLLAPSE_KEY, v => v === null ? window.innerWidth < 1440 : v === '1', false);
  });
  // The VOC drawer and the detail aside share one right position; a newly visible detail (activation) takes it from the drawer (06 §13).
  const axes = useEquipmentAxes();
  const voc = useVocDrawer(slots.vocCompose, () => ({ route, platformScreen, global, page, absoluteUrl, registry, lang, axes, asOf: t('membershipAsOf') }), detail.activation, session);
  const detailShown = detail.open && !voc?.visible;
  const toggle = () => setCollapsed(c => { writeLocalStorage(COLLAPSE_KEY, c ? '0' : '1'); return !c; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <div className="flex h-full overflow-hidden">
    <a href="#platform-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface-card focus:px-3 focus:py-2">{t('skipToContent')}</a>
    <VocDrawerContext.Provider value={voc}><AppRail /></VocDrawerContext.Provider>
    {/* THROWAWAY #595 — never merge. */}
    {showSidebar && (proto595 && sidebarSpace?.id === proto595.spaceId ? <proto595.Sidebar collapsed={collapsed} onToggle={toggle} /> : <AppSidebar collapsed={collapsed} onToggle={toggle} />)}
    {showPlatformSidebar && <PlatformSidebar collapsed={collapsed} onToggle={toggle} />}
    <div className="flex min-w-0 flex-1 flex-col">
      <main id="platform-main" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
        <Suspense fallback={<div className="p-5"><LoadingBlock rows={6} height={320} /></div>}>{children}</Suspense>
      </main>
    </div>
    <aside ref={detail.ref} hidden={!detailShown} aria-label={lang === 'ko' ? '상세 패널' : 'Detail panel'} data-open={detailShown}
      className={cn('h-full max-w-[520px] shrink-0 overflow-hidden border-border-subtle bg-surface-detail',
        detailShown ? 'w-[clamp(360px,var(--detail-panel-width,440px),520px)] min-w-[360px] border-l' : 'w-0 min-w-0 border-l-0')} />
    {voc && <VocDrawer voc={voc} lang={lang} />}
    <CommandPalette />
    <Toasts />
  </div>;
}

function Toasts() {
  const { toasts, dismissToast } = useHostPlatform();
  const { lang, t } = useI18n();
  // Toasts sit above the command palette scrim (z-60) so their dismiss stays clickable (#310).
  return <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-70 flex w-[min(420px,90vw)] flex-col gap-2">
    {toasts.map(tst => {
      const Icon = tst.tone === 'danger' ? XCircle : tst.tone === 'warning' ? AlertTriangle : Info;
      return <div key={tst.id} role={tst.tone === 'danger' ? 'alert' : 'status'} className={cn('pointer-events-auto flex items-start gap-2 rounded-md border bg-surface-card px-3 py-2.5 text-xs shadow-lg',
        tst.tone === 'danger' ? 'border-accent-danger' : tst.tone === 'warning' ? 'border-accent-warn' : 'border-border-strong')}>
        <Icon className={cn('mt-0.5 size-4 shrink-0', tst.tone === 'danger' ? 'text-accent-danger' : tst.tone === 'warning' ? 'text-accent-warn' : 'text-accent-primary')} aria-hidden />
        <span className="flex-1">{tst.text}
          {/* Same named detail as StateMessage's server detail (#304 F2): the original stays visible, outside the body. */}
          {tst.detail && <span role="note" aria-label={t('serverDetail')} className="mt-0.5 block max-w-full break-all text-tiny">{tst.detail}</span>}
        </span>
        <button type="button" aria-label={lang === 'ko' ? '닫기' : 'Dismiss'} onClick={() => dismissToast(tst.id)} className="text-text-muted hover:text-text-primary"><X className="size-3.5" aria-hidden /></button>
      </div>;
    })}
  </div>;
}
