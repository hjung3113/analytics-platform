import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useEquipmentAxes, useI18n, type Toast } from '@ap/kernel';
import { useHostPlatform, useToastList } from '@ap/kernel/host';
import { LoadingBlock } from '@ap/components';
import { cn, DetailPanelSlotProvider, readLocalStorage, useDetailPanelSlotHost, writeLocalStorage } from '@ap/ui';
import { CommandPalette } from '../routing/CommandPalette';
import { AppSidebar } from './AppSidebar';
import { PlatformSidebar } from './PlatformSidebar';
import { AppRail } from './AppRail';
import { useVocDrawer, VocDrawer, VocDrawerContext } from '../voc/VocDrawer';
import { BoardRestoreChip } from '../board/BoardRestoreChip';
import { useBoardPresentation } from '../board/boardPresentation';
import type { ToastBottom } from '../board/windowLayout';

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
  // Registry screens outside every space (home, 내 활동, 공지) draw the platform sidebar; the board and unmatched paths do not (ADR-0070).
  const showPlatformSidebar = route !== null && registry.spaceOf(route.menu) === null;
  const [collapsed, setCollapsed] = useState(() => {
    return readLocalStorage(COLLAPSE_KEY, v => v === null ? window.innerWidth < 1440 : v === '1', false);
  });
  // The VOC drawer and the detail aside share one right position; a newly visible detail (activation) takes it from the drawer (06 §13).
  const axes = useEquipmentAxes();
  const voc = useVocDrawer(slots.vocCompose, () => ({ route, platformScreen, global, page, absoluteUrl, registry, lang, axes, asOf: t('membershipAsOf') }), detail.activation, session);
  const detailShown = detail.open && !voc?.visible;
  const board = useBoardPresentation();
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
    {showSidebar && <AppSidebar collapsed={collapsed} onToggle={toggle} />}
    {showPlatformSidebar && <PlatformSidebar collapsed={collapsed} onToggle={toggle} />}
    {/* The column stays unpositioned: a `relative` column would become the containing block of every `absolute` element inside main (sr-only text, popovers) and let them overflow it unclipped. */}
    <div data-shell-content className="flex min-w-0 flex-1 flex-col">
      {/* The board window's area (893d2): a positioned box around main only, so a window is placed against main, not against its scrolling content, and never covers the rail, sidebar, or the chip row. It is `relative`, so every `absolute` element inside main (sr-only text, …) now has it as containing block: `contain: paint` clips what overflows it (as the root's clipping did before) without an `overflow` clip, which `contract-components` (PageFilterBar 접힘 요약) reads as a clipped ancestor of text. */}
      <div data-board-window-area className="relative min-h-0 min-w-0 flex-1 [contain:paint]">
        <main id="platform-main" tabIndex={-1} className="h-full min-h-0 min-w-0 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring">
          <Suspense fallback={<div className="p-5"><LoadingBlock rows={6} height={320} /></div>}>{children}</Suspense>
        </main>
      </div>
      <BoardRestoreChip />
      {/* The toast anchor: a zero-height positioned strip at the column's bottom edge, so the stack centres on the content column and never reaches the detail aside or the VOC drawer (06 Toast). */}
      <div data-toast-anchor className="relative h-0"><Toasts bottom={platformScreen === 'board' ? 'bottom-14' : board.minimized ? 'bottom-16' : 'bottom-4'} /></div>
    </div>
    <aside ref={detail.ref} hidden={!detailShown} aria-label={lang === 'ko' ? '상세 패널' : 'Detail panel'} data-open={detailShown}
      className={cn('h-full max-w-[520px] shrink-0 overflow-hidden border-border-subtle bg-surface-detail',
        detailShown ? 'w-[clamp(360px,var(--detail-panel-width,440px),520px)] min-w-[360px] border-l' : 'w-0 min-w-0 border-l-0')} />
    {voc && <VocDrawer voc={voc} lang={lang} />}
    <CommandPalette />
  </div>;
}

/**
 * One persistent stack in the content column, newest at the bottom whatever the tone. The visible list carries no liveness; announcement
 * lives in two persistent visually-hidden regions (polite for info/warning, assertive for danger) that receive a toast's text once, when it
 * is raised — a layout change or a dismissal announces nothing.
 */
/** `bottom` clears the strip under main: the board's sheet strip (56px) or the minimized board's chip row (64px, so its focus ring is not clipped). */
function Toasts({ bottom }: { bottom: ToastBottom }) {
  const toasts = useToastList();
  const heard = useRef<Set<number> | null>(null);
  // Announcements are frozen strings: a later language switch must not rewrite (and so re-announce) what was already said.
  const [polite, setPolite] = useState<{ id: number; said: string }[]>([]);
  const [assertive, setAssertive] = useState<{ id: number; said: string }[]>([]);
  const { lang } = useI18n();
  const langRef = useRef(lang);
  langRef.current = lang;
  // The first render only records what is already there; later renders announce the ids not yet heard.
  useEffect(() => {
    const seen = heard.current ?? new Set<number>();
    const fresh = toasts.filter(tst => !seen.has(tst.id));
    heard.current = new Set(toasts.map(tst => tst.id));
    if (fresh.length === 0) return;
    // The tone is not visible to a screen reader (an icon), so the announcement names it first, in the language of the moment it is raised.
    const toneWord = (tone: Toast['tone']) => langRef.current === 'ko' ? { info: '알림', warning: '경고', danger: '오류' }[tone] : { info: 'Notice', warning: 'Warning', danger: 'Error' }[tone];
    const entry = (tst: Toast) => ({ id: tst.id, said: `${toneWord(tst.tone)}: ${tst.text}${tst.detail ? ` ${tst.detail}` : ''}` });
    setPolite(list => [...list, ...fresh.filter(tst => tst.tone !== 'danger').map(entry)].slice(-4));
    setAssertive(list => [...list, ...fresh.filter(tst => tst.tone === 'danger').map(entry)].slice(-4));
  }, [toasts]);
  const said = (item: { id: number; said: string }) => <p key={item.id}>{item.said}</p>;
  // Toasts sit above the command palette scrim (z-60) so their dismiss stays clickable (#310), and above the board's dock sashes (z-99, #886).
  // The board keeps its 41px sheet strip at the column bottom: the stack sits above it (06 Toast, bottom bars).
  return <div data-toast-stack className={cn('pointer-events-none absolute inset-x-4 z-[100] mx-auto max-w-[420px]', bottom)}>
    <div className="flex flex-col gap-2">
      {toasts.map(tst => <ToastItem key={tst.id} toast={tst} />)}
    </div>
    <div aria-live="polite" aria-atomic="false" className="sr-only">{polite.map(said)}</div>
    <div aria-live="assertive" aria-atomic="false" className="sr-only">{assertive.map(said)}</div>
  </div>;
}

function ToastItem({ toast: tst }: { toast: Toast }) {
  const { dismissToast, holdToast } = useHostPlatform();
  const { lang, t } = useI18n();
  const { id, action } = tst;
  // Every toast waits while focus or the pointer is inside it (WCAG 2.2.1) and restarts its timer once both have left.
  const inside = useRef({ focus: false, pointer: false });
  const hold = (key: 'focus' | 'pointer', on: boolean) => {
    inside.current[key] = on;
    holdToast(id, inside.current.focus || inside.current.pointer);
  };
  // Unmounting while held (cap eviction, shell remount) releases the hold; a retired id has no duration, so it is a no-op.
  useEffect(() => () => {
    if (inside.current.focus || inside.current.pointer) holdToast(id, false);
  }, [id, holdToast]);
  const Icon = tst.tone === 'danger' ? XCircle : tst.tone === 'warning' ? AlertTriangle : Info;
  // A toast that leaves with focus inside hands focus to main, not to <body>; an action that moves focus itself runs after and wins (#886).
  const root = useRef<HTMLDivElement>(null);
  const leave = () => { if (root.current?.contains(document.activeElement)) document.getElementById('platform-main')?.focus({ preventScroll: true }); };
  return <div ref={root} data-toast-item
    onFocus={() => hold('focus', true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) hold('focus', false); }}
    onPointerEnter={() => hold('pointer', true)} onPointerLeave={() => hold('pointer', false)}
    className={cn('pointer-events-auto flex items-start gap-2 rounded-md border bg-surface-card px-3 py-2.5 text-xs shadow-lg',
      tst.tone === 'danger' ? 'border-accent-danger' : tst.tone === 'warning' ? 'border-accent-warn' : 'border-border-strong')}>
    <Icon className={cn('mt-0.5 size-4 shrink-0', tst.tone === 'danger' ? 'text-accent-danger' : tst.tone === 'warning' ? 'text-accent-warn' : 'text-accent-primary')} aria-hidden />
    <span className="flex-1">{tst.text}
      {/* Same named detail as StateMessage's server detail (#304 F2): the original stays visible, outside the body. */}
      {tst.detail && <span role="note" aria-label={t('serverDetail')} className="mt-0.5 block max-w-full break-all text-tiny">{tst.detail}</span>}
    </span>
    {action && <button type="button" onClick={() => { leave(); action.onAction(); dismissToast(id); }} className="font-medium text-accent-primary hover:underline">{action.label}</button>}
    <button type="button" aria-label={lang === 'ko' ? '닫기' : 'Dismiss'} onClick={() => { leave(); dismissToast(id); }} className="text-text-muted hover:text-text-primary"><X className="size-3.5" aria-hidden /></button>
  </div>;
}
