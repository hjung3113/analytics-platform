import { detailFocusFallback, paneRootById } from '../state/pageFocus';
import { OutcomeBanners, OutcomeScope } from '../filters/OutcomeScope';
import { X } from 'lucide-react';
import { Fragment, useEffect, useId, useInsertionEffect, useLayoutEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { buildQuery } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import { useHostPlatformOptional } from '@ap/kernel/host';
import { Tabs, TabsContent, TabsList, TabsTrigger, TransientOverlayScope, useDetailPanelSlot, useSurfacePaused } from '@ap/ui';

/** §13: URL-controlled detail content rendered into the shell-owned docked slot. */
export function DetailDrawer({ title, subtitle, headerActions, context, tabs, onClose, tab, onTabChange }: {
  title: ReactNode; subtitle?: ReactNode; headerActions?: ReactNode; context?: ReactNode;
  tabs: { id: string; label: ReactNode; content: ReactNode }[];
  onClose: () => void; tab?: string; onTabChange?: (tab: string) => void;
}) {
  const paneId = useHostPlatformOptional()?.paneId;
  const closeLatest = useRef(onClose);
  useInsertionEffect(() => { closeLatest.current = onClose; });
  // A terminal reason for this drawer lifetime, including every outgoing content cleanup/replay.
  const superseded = useRef(false);
  const host = useDetailPanelSlot(paneId != null ? { onSuperseded: () => {
    superseded.current = true;
    closeLatest.current();
  } } : undefined);
  useCloseOnPaneChange(onClose);
  // A drawer whose owning surface is covered stays mounted in the hidden host; its own transient UI is dismissed, as a docked detail owns its visibility.
  const paused = useSurfacePaused();
  return host ? createPortal(<TransientOverlayScope active={!paused} detached><OutcomeScope><DetailContent superseded={superseded} title={title} subtitle={subtitle} headerActions={headerActions} context={context} tabs={tabs} onClose={onClose} tab={tab} onTabChange={onTabChange} /></OutcomeScope></TransientOverlayScope>, host) : null;
}

/**
 * Docs/16 §5: a panel opened from a board pane belongs to the screen and Context that pane had then; when either changes it closes.
 * Runs in the drawer itself, not its portaled content, so changes are noticed even before a host is attached.
 */
function useCloseOnPaneChange(onClose: () => void) {
  const platform = useHostPlatformOptional();
  const identity = platform?.paneId == null ? null : `${platform.pathname}\0${buildQuery(platform.global)}`;
  const openedAs = useRef(identity);
  const closeLatest = useRef(onClose);
  useLayoutEffect(() => { closeLatest.current = onClose; });
  const closedByChange = useRef(false);
  useEffect(() => {
    // Once: a menu that fills in its default period right after a screen change would otherwise ask twice.
    if (identity === openedAs.current || closedByChange.current) return;
    closedByChange.current = true;
    closeLatest.current();
  }, [identity]);
}

function DetailContent({ superseded, title, subtitle, headerActions, context, tabs, onClose, tab, onTabChange }: Parameters<typeof DetailDrawer>[0] & { superseded: MutableRefObject<boolean> }) {
  const { lang } = useI18n();
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // #353: whether focus lives inside the panel. Unmount blur has no relatedTarget, so it must not
  // clear this; only a real move to an outside element or an outside pointerdown does (06 §13, §26).
  const focusInside = useRef(false);
  const id = useId();
  const platform = useHostPlatformOptional();
  const pageNavigation = platform?.pageNavigation;
  // Read live by the mount claim and the close cleanup: a covered surface's drawer must not move or restore focus on the screen in front.
  const pausedNow = useSurfacePaused();
  const paused = useRef(pausedNow);
  useInsertionEffect(() => { paused.current = pausedNow; });
  const paneId = platform?.paneId ?? null;
  const paneLabel = platform?.paneLabel ?? null;
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Arrival with focus= leaves the title focused (§26). Same-screen open still moves here.
    // No provider means a locally mounted drawer, which still claims the close button.
    const claim = (pageNavigation?.claimsDetailFocus() ?? true) && !paused.current;
    if (claim) close.current?.focus({ preventScroll: true });
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the cleanup must read the latest flag; a copy taken at mount would never see the supersession
      if (superseded.current) return;
      if (paused.current) return;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the cleanup asks the live panel node whether focus is inside, not a mount-time copy
      const inside = panel.current?.contains(document.activeElement) ?? false;
      // A panel that never took focus must not treat the untouched body as its own.
      // `focusInside` follows React's tree, so a dialog the panel opened (portaled to body, e.g. a discard confirm) counts: closing through it still returns focus.
      const restore = inside || focusInside.current || (claim && document.activeElement === document.body);
      if (!restore) return;
      // The panel is portaled out of its pane, so a pane's fallback is found by id (compared, not interpolated into a selector).
      const paneRoot = paneId === null ? null : paneRootById(paneId);
      const available = (element: HTMLElement | null): element is HTMLElement => !!element?.isConnected
        && element !== document.body && !element.closest('[hidden], [inert], [aria-hidden="true"]');
      const restoreFocus = () => detailFocusFallback(opener, paneRoot, available)?.focus({ preventScroll: true });
      // A modal dialog the panel opened (a discard confirm) hides everything else with aria-hidden until it unmounts, which is after this cleanup;
      // the opener is unavailable only because of it (not hidden or inert), so wait one task and restore only if focus has landed nowhere.
      if (opener?.isConnected && !opener.closest('[hidden], [inert]') && opener.closest('[aria-hidden="true"]')) {
        setTimeout(() => { if (document.activeElement === document.body || document.activeElement === null) restoreFocus(); }, 0);
        return;
      }
      restoreFocus();
    };
  }, [pageNavigation, paneId, superseded, paused]);
  useLayoutEffect(() => {
    // A pointerdown outside the panel is the user choosing a focus destination (often body).
    const onPointerDown = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) focusInside.current = false; };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);
  useLayoutEffect(() => {
    // The focused control can disappear in any commit: history Back rewrites the controlled tab while
    // the tab list stays, and Radix Presence drops the inactive content one commit AFTER the value
    // change — no [tab] effect runs on that later commit. Watch the panel subtree for its lifetime
    // instead; the callback only checks the #353 condition (06 §13, §26).
    const restore = () => {
      if (!focusInside.current || document.activeElement !== document.body) return;
      const target = panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? panel.current;
      target?.focus({ preventScroll: true });
    };
    const observer = new MutationObserver(restore);
    if (panel.current) observer.observe(panel.current, { childList: true, subtree: true });
    return () => { observer.disconnect(); };
  }, []);
  return <div ref={panel} role="dialog" tabIndex={-1} aria-modal="false" aria-labelledby={`${id}-t`}
    onFocus={() => { focusInside.current = true; }}
    onPointerDownCapture={() => { focusInside.current = true; }}
    onBlur={e => { const to = e.relatedTarget as Node | null; if (to && !panel.current?.contains(to)) focusInside.current = false; }}
    onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); onClose(); } }}
    className="flex h-full min-h-0 w-full flex-col bg-surface-detail">
    <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        {paneLabel && <p data-detail-pane-label className="truncate text-xs text-text-muted">{paneLabel}</p>}
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
    {/* One tab draws no tab row (06 §13, #886 UX-8); the content stays a focusable, named scroll region like a tabpanel. */}
    {tabs.length === 1
      ? <div role="region" tabIndex={0} aria-labelledby={`${id}-t`} className="min-h-0 flex-1 overflow-auto px-5 py-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring focus-visible:ring-offset-0">{tabs[0].content}</div>
      : <Tabs value={tab} defaultValue={tab ? undefined : tabs[0].id} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label={lang === 'ko' ? '상세 탭' : 'Detail tabs'} className="mx-5 mt-3 w-auto">
          {tabs.map(tb => <TabsTrigger key={tb.id} value={tb.id}>{tb.label}</TabsTrigger>)}
        </TabsList>
        {tabs.map(tb => (
          // eslint-disable-next-line shadcn/no-restyle -- the aside clips overflow, so the focus ring must sit inside the panel (#914 A1)
          <TabsContent key={tb.id} value={tb.id} className="min-h-0 flex-1 overflow-auto px-5 py-3 focus-visible:ring-inset focus-visible:ring-offset-0">{tb.content}</TabsContent>
        ))}
      </Tabs>}
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

/**
 * @deprecated since the next SDK release (#891): use `FieldRow layout="detail"` from `@ap/ui` inside a `FieldList` instead of
 * `Field` inside a `<dl>` — the rows draw the same. Removed one release later (ADR-0044).
 */
export function Field({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-border-subtle py-1.5 text-sm last:border-0">
    <dt className="min-w-0 break-words text-text-muted">{typeof label === 'string' ? foldedLabel(label) : label}</dt>
    <dd className={mono ? 't-mono' : 'tabular'}>{children}</dd>
  </div>;
}
