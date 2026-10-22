import { Component, Suspense, lazy, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { RotateCw, ServerCrash } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button, Skeleton } from '@ap/ui';
import { StateMessage } from '../StateView';
import { panelOrder } from './commands';
import { stackedTree, visiblePanelIds } from './displayModel';
import { DEFAULT_MIN_PANEL_SIZE, type DockLayoutProps } from './dockTypes';
import { programmaticFocus } from './programmaticFocus';
import { dockGroups } from './schema';

/** Contains a rejected DockEngine chunk load inside the layout box so it never unmounts the surrounding app (same pattern as EChart). */
class ChunkLoadBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** The tab the event is on, if it belongs to the layout rooted at `root` (a nested layout's tabs belong to that layout). */
const tabOf = (target: EventTarget | null, root: Element | null) => {
  const tab = target instanceof Element ? target.closest<HTMLElement>('[role="tab"][data-tab-panel-id]') : null;
  return tab && tab.closest('[data-dock-layout]') === root ? tab : null;
};
const NAVIGATION_KEYS = new Set(['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
const TABBABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

/** What Tab can reach inside `root`, in DOM order: not disabled, not `tabindex=-1`, not inside an `inert`/`hidden` subtree, not hidden from layout. */
function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(element => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled
    && !element.closest('[inert], [hidden]') && (typeof element.checkVisibility !== 'function' || element.checkVisibility({ visibilityProperty: true })));
}

/** Opens the group's actions the way a pointer user would: Radix `DropdownMenuTrigger` opens on `pointerdown`, other triggers on `click`. */
function openGroupMenu(tab: HTMLElement): boolean {
  const trigger = tab.closest('.dv-groupview')?.querySelector<HTMLElement>('[data-dock-group-menu]');
  if (!trigger) return false;
  programmaticFocus(() => { trigger.focus(); });
  trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
  return true;
}

/**
 * Controlled dock layout (ADR-0067): the caller owns a `DockNode` tree, the engine renders it and reports what the user did to it.
 * Host-only entry `@ap/components/dock`; the engine is a lazy chunk and never appears in this API.
 *
 * - **Never rebuilds.** A new `layout` is reconciled onto the live engine; no panel remounts, nothing is closed (D9).
 * - **No engine close.** Tabs have no close button and Delete/Backspace on a tab never closes it; `onPanelDelete` lets the host give the key a meaning (D7).
 * - **Activation is the user's.** `onActivate` fires only for pointer/keyboard use of a tab or focus moving into a panel (D6).
 * - **Hidden means inert.** A panel that is not on screen (background tab, hidden by a maximize, hidden by the narrow display) is `inert`
 *   and its Radix overlays are closed (D13).
 * - **Separators.** Every boundary between sibling groups has a focusable `role="separator"` (docs/16 §4); pointer drag is the engine's sash.
 * - **Group menu.** `renderGroupActions` output marks its menu trigger `data-dock-group-menu`; Shift+F10 or ContextMenu on a tab opens it.
 */
export function DockLayout(props: DockLayoutProps) {
  const { panels, layout, onLayoutChange, onActivate, maximizedPanelId = null, onMaximizedChange, onPanelDelete, renderTab, renderGroupActions, separatorLabel, stackBelow, label, currentPanelId, tabA11y } = props;
  const { t } = useI18n();
  const instanceId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  // A new lazy component per attempt re-runs the rejected chunk import on retry.
  const DockEngine = useMemo(() => lazy(() => import('./DockEngine')), [attempt]);
  const retry = useCallback(() => { setFailed(false); setAttempt(value => value + 1); }, []);

  const minWidth = props.minPanelSize?.width ?? DEFAULT_MIN_PANEL_SIZE.width;
  const minHeight = props.minPanelSize?.height ?? DEFAULT_MIN_PANEL_SIZE.height;
  const minPanelSize = useMemo(() => ({ width: minWidth, height: minHeight }), [minWidth, minHeight]);

  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || stackBelow === undefined) return;
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) setWidth(entry.contentRect.width); });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [stackBelow]);
  const narrow = stackBelow !== undefined && width !== null && width < stackBelow;

  // Narrow display: the user's tab choice there is display-only and ends when the first group's own active tab changes.
  const firstActive = dockGroups(layout)[0]?.active ?? '';
  const [choice, setChoice] = useState<{ base: string; id: string } | null>(null);
  const stackedChoice = choice && choice.base === firstActive ? choice.id : undefined;
  const known = useMemo(() => new Set(panelOrder(layout)), [layout]);
  // The host's current panel wins over the display-only choice: it is the panel the host works on, so it is the one shown.
  const shown = currentPanelId !== undefined && known.has(currentPanelId) ? currentPanelId : stackedChoice;
  const display = useMemo(() => (narrow ? stackedTree(layout, shown, panels.map(panel => panel.id)) : layout), [narrow, layout, shown, panels]);
  const maximized = !narrow && maximizedPanelId !== null && known.has(maximizedPanelId) ? maximizedPanelId : null;
  const visible = useMemo(() => visiblePanelIds(display, maximized), [display, maximized]);

  const activate = useCallback((panelId: string) => {
    if (narrow) setChoice({ base: firstActive, id: panelId });
    onActivate?.(panelId);
  }, [narrow, firstActive, onActivate]);

  const focusTab = useCallback((panelId: string) => {
    const tab = Array.from(container.current?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? []).find(item => item.dataset.tabPanelId === panelId && tabOf(item, container.current));
    if (tab) programmaticFocus(() => { tab.focus({ preventScroll: true }); });
  }, []);
  // After a maximize ends the restored panel's tab takes focus (when focus is not elsewhere on the page); the board composes its own contract on top.
  const wasMaximized = useRef<string | null>(null);
  useEffect(() => {
    const previous = wasMaximized.current;
    wasMaximized.current = maximized;
    const focus = document.activeElement;
    if (previous && !maximized && (focus === document.body || focus === null || container.current?.contains(focus))) focusTab(previous);
  }, [maximized, focusTab]);

  /**
   * Tab order: a group's tab, then its visible panel's content, then the next group's tab (the engine's DOM puts every tab strip before every
   * panel). Only the step between a tab and its content, and the step out of a panel's first or last stop, are made here; Tab inside the
   * content is the browser's. Returns whether it moved focus; at the ends of the layout it leaves Tab to the browser.
   */
  const moveTabStop = (target: EventTarget | null, backward: boolean): boolean => {
    const root = container.current;
    if (!root || !(target instanceof HTMLElement)) return false;
    const stops = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id][aria-selected="true"]'))
      .filter(tab => tabOf(tab, root) !== null)
      .map(tab => {
        const panel = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-panel]')).find(item => item.dataset.dockPanel === tab.dataset.tabPanelId && item.dataset.dockVisible === 'true' && item.closest('[data-dock-layout]') === root) ?? null;
        return { tab, panel, group: tab.closest('.dv-groupview') };
      });
    const enter = (stop: { tab: HTMLElement; panel: HTMLElement | null }, last: boolean) => {
      const items = stop.panel ? tabbablesIn(stop.panel) : [];
      const to = stop.panel ? (last ? items[items.length - 1] : items[0]) ?? stop.panel : stop.tab;
      to.focus({ preventScroll: true });
    };
    const tab = tabOf(target, root);
    if (tab) {
      const at = stops.findIndex(stop => stop.group === tab.closest('.dv-groupview'));
      if (at < 0) return false;
      if (!backward) { if (!stops[at]!.panel) return false; enter(stops[at]!, false); return true; }
      if (at === 0) return false;
      enter(stops[at - 1]!, true);
      return true;
    }
    const panel = target.closest<HTMLElement>('[data-dock-panel]');
    if (!panel || panel.closest('[data-dock-layout]') !== root) return false;
    const at = stops.findIndex(stop => stop.panel === panel);
    if (at < 0) return false;
    const items = tabbablesIn(panel);
    if (backward) {
      if (target !== panel && target !== items[0]) return false;
      stops[at]!.tab.focus({ preventScroll: true });
      return true;
    }
    if (target !== (items[items.length - 1] ?? panel) || at + 1 >= stops.length) return false;
    stops[at + 1]!.tab.focus({ preventScroll: true });
    return true;
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    // The engine closes a focused tab on Delete/Backspace (dockview-core main.esm.mjs:9568); closing is a platform command, so the key stops here.
    const tab = (event.key === 'Delete' || event.key === 'Backspace') ? tabOf(event.target, container.current) : null;
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      if (tab.dataset.tabPanelId) onPanelDelete?.(tab.dataset.tabPanelId);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tab = tabOf(event.target, container.current);
    if (event.key === 'Escape') {
      // Whatever consumed Escape first (menu, popover, dialog: they call preventDefault) keeps it; only the innermost maximize ends.
      if (event.defaultPrevented || !maximized) return;
      event.preventDefault();
      event.stopPropagation();
      onMaximizedChange?.(null);
      return;
    }
    if (tab && ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')) {
      if (openGroupMenu(tab)) { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.defaultPrevented && moveTabStop(event.target, event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (tab && NAVIGATION_KEYS.has(event.key)) {
      // The engine has already moved focus; the tab that has it is the one the user chose.
      const focused = tabOf(document.activeElement, container.current) ?? tab;
      if (focused.dataset.tabPanelId) activate(focused.dataset.tabPanelId);
    }
  };

  if (failed) {
    return <div role="region" aria-label={label} data-dock-layout="error" className="h-full w-full">
      <StateMessage tone="danger" icon={<ServerCrash className="size-4" aria-hidden />} title={t('stateError')}
        action={<Button size="sm" variant="secondary" onClick={retry}><RotateCw className="size-3.5" aria-hidden />{t('retry')}</Button>} />
    </div>;
  }
  return <div ref={container} role="region" aria-label={label} data-dock-layout data-dock-narrow={narrow} className="relative h-full min-h-0 w-full min-w-0"
    onKeyDownCapture={onKeyDownCapture} onKeyDown={onKeyDown}
    onPointerDownCapture={event => {
      const tab = event.button === 0 ? tabOf(event.target, container.current) : null;
      if (tab?.dataset.tabPanelId) activate(tab.dataset.tabPanelId);
    }}>
    <ChunkLoadBoundary key={attempt} onError={() => { setFailed(true); }}>
      <Suspense fallback={<div role="status" aria-busy className="h-full w-full"><Skeleton className="h-full w-full" /></div>}>
        <DockEngine panels={panels} layout={layout} display={display} interactive={!narrow} maximizedPanelId={maximized} visible={visible} minPanelSize={minPanelSize}
          onLayoutChange={onLayoutChange} onActivate={activate} renderTab={renderTab} renderGroupActions={renderGroupActions} tabA11y={tabA11y} separatorLabel={separatorLabel}
          containerRef={container} instanceId={instanceId} />
      </Suspense>
    </ChunkLoadBoundary>
  </div>;
}
