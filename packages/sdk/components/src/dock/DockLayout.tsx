import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { RotateCw, ServerCrash } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button, Skeleton } from '@ap/ui';
import { StateMessage } from '../StateView';
import { ChunkLoadBoundary, lazyChunk, useLazyChunk } from '../lazyChunk';
import { panelOrder } from './commands';
import { stackedTree, visiblePanelIds } from './displayModel';
import { DEFAULT_MIN_PANEL_SIZE, type DockLayoutProps, type DockRows } from './dockTypes';
import { programmaticFocus } from './programmaticFocus';
import { dockGroups, dockGroupsInReadingOrder } from './schema';

/** The tab the event is on, if it belongs to the layout rooted at `root` (a nested layout's tabs belong to that layout). */
const tabOf = (target: EventTarget | null, root: Element | null) => {
  const tab = target instanceof Element ? target.closest<HTMLElement>('[role="tab"][data-tab-panel-id]') : null;
  return tab && tab.closest('[data-dock-layout]') === root ? tab : null;
};
/** The header slots of a group, in DOM (= Tab) order: after the tabs, then the right side. */
const SLOT = '[data-dock-group-tabs-end], [data-dock-group-actions]';
const NAVIGATION_KEYS = new Set(['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
const TABBABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]';

/** What Tab can reach inside `root`, in DOM order: not disabled, not `tabindex=-1`, not inside an `inert`/`hidden` subtree, not hidden from layout. */
function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(element => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled
    && !element.closest('[inert], [hidden]') && (typeof element.checkVisibility !== 'function' || element.checkVisibility({ visibilityProperty: true })));
}

/**
 * Where Tab lands in a panel that has nothing to stop at: the panel content's own focus target (its first `tabindex="-1"` descendant, e.g. the
 * pane root the host selects on focus), else the panel element itself.
 */
const focusTargetOf = (panel: HTMLElement): HTMLElement => Array.from(panel.querySelectorAll<HTMLElement>('[tabindex="-1"]')).find(element => !element.closest('[inert], [hidden]')) ?? panel;

/** True when nothing before `target` in `items` is a place of its own: the items before it are all its ancestors (a roving-focus wrapper hands focus to its item). */
const startsAt = (items: readonly HTMLElement[], target: HTMLElement) => {
  const at = items.indexOf(target);
  return at >= 0 && items.slice(0, at).every(item => item.contains(target));
};

/** The open menu of a trigger: Radix names it in `aria-controls` while it is open. */
const menuOf = (trigger: HTMLElement) => { const id = trigger.getAttribute('aria-controls'); return id ? document.getElementById(id) : null; };

/**
 * Opens the actions of the group whose active tab is `panelId` the way a keyboard user would: a `keydown` that Radix `DropdownMenuTrigger`
 * answers by opening with its first item focused (otherwise a `click`). The trigger may belong to a tab that was only just made active, so it
 * is looked for until the host has drawn it.
 */
function openGroupMenu(root: HTMLElement, tab: HTMLElement, tries = 0): void {
  const panelId = tab.dataset.tabPanelId;
  const slots = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-group-actions]')).filter(item => item.closest('[data-dock-layout]') === root);
  // The tab's own slot once the host shows it; after a while the group's slot whatever it shows (a host that did not follow the activation).
  const slot = slots.find(item => item.dataset.dockActive === panelId) ?? (tries >= 10 ? tab.closest('.dv-groupview')?.querySelector<HTMLElement>('[data-dock-group-actions]') : undefined);
  const trigger = slot?.querySelector<HTMLElement>('[data-dock-group-menu]');
  if (!trigger) { if (tries < 10 && root.isConnected) setTimeout(() => { openGroupMenu(root, tab, tries + 1); }, 30); return; }
  programmaticFocus(() => { trigger.focus({ preventScroll: true }); });
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
  // Radix opens a keyboard-opened menu on its first item; this is the safety net for a menu that did not.
  const focusFirst = (attempt: number) => {
    const menu = menuOf(trigger);
    if (!menu) { if (attempt < 10) setTimeout(() => { focusFirst(attempt + 1); }, 30); return; }
    const first = menu.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"]):not([data-disabled])');
    const onItem = document.activeElement instanceof HTMLElement && menu.contains(document.activeElement) && document.activeElement.matches('[role^="menuitem"]');
    if (first && !onItem) first.focus({ preventScroll: true });
  };
  setTimeout(() => { focusFirst(0); }, 0);
  returnToTab(trigger, tab, root);
}

/**
 * The menu was opened from a tab, so closing it without choosing returns focus to that tab and not to the trigger Radix would use. A choice
 * that moved focus elsewhere (the host's follow-up) keeps it: only a focus that comes to rest on the trigger is moved.
 */
function returnToTab(trigger: HTMLElement, tab: HTMLElement, root: HTMLElement): void {
  let opened = false;
  const observer = new MutationObserver(() => {
    if (trigger.getAttribute('aria-expanded') === 'true') { opened = true; return; }
    if (!opened) return;
    observer.disconnect();
    const settle = (attempt: number) => {
      const focus = document.activeElement;
      if (focus === trigger) {
        const target = tab.isConnected ? tab : Array.from(root.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]')).find(item => item.dataset.tabPanelId === tab.dataset.tabPanelId && tabOf(item, root));
        if (target) programmaticFocus(() => { target.focus({ preventScroll: true }); });
      } else if ((focus === document.body || focus === null || focus.closest('[role="menu"]')) && attempt < 10 && root.isConnected) {
        setTimeout(() => { settle(attempt + 1); }, 30);
      }
    };
    setTimeout(() => { settle(0); }, 0);
  });
  observer.observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'] });
  setTimeout(() => { if (!opened) observer.disconnect(); }, 1000);
}

/**
 * Takes Tab out of the layout: the first focusable after `root` (forward) or the last one before it (backward) in document order, ignoring what is
 * inside the layout. The engine keeps panels in tree order, which is not the reading order, so the browser's own step would run back into the layout.
 * Returns false when the page has nothing there (the browser's step stays).
 */
function leave(root: HTMLElement, backward: boolean): boolean {
  const outside = tabbablesIn(document.body).filter(element => !root.contains(element) && !element.contains(root));
  const position = (element: HTMLElement) => root.compareDocumentPosition(element);
  const target = backward
    ? outside.filter(element => position(element) & Node.DOCUMENT_POSITION_PRECEDING).pop()
    : outside.find(element => position(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

// One engine chunk component for every layout (#915): once Dockview has loaded, a newly mounted layout (a board revisit, a workspace on the
// next page) draws in its first commit instead of suspending again and waiting out React's fallback throttle.
const engineChunk = lazyChunk(() => import('./DockEngine'));

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
 * - **Group menu.** `renderGroupActions` output marks its menu trigger `data-dock-group-menu`; Shift+F10, ContextMenu or a right-click on a tab activates
 *   that tab and opens it with its first item focused.
 */
export function DockLayout(props: DockLayoutProps) {
  return <DockLayoutBase {...props} />;
}

/** Internal (the workspace imports it from this file; `index.ts` does not): `DockLayout` plus the row capability of `DockRows`. */
export function DockLayoutBase(props: DockLayoutProps & { rows?: DockRows; reveal?: { panelId: string; seq: number } | null }) {
  const { rows, reveal, panels, layout, onLayoutChange, onActivate, maximizedPanelId = null, onMaximizedChange, onPanelDelete, renderTab, renderGroupActions, renderGroupTabsEnd, separatorLabel, stackBelow, label, currentPanelId, tabA11y, canDropAt } = props;
  const { t } = useI18n();
  const instanceId = useId();
  const container = useRef<HTMLDivElement>(null);
  const { Component: DockEngine, failed, attempt, onError, retry } = useLazyChunk(engineChunk);

  const minWidth = props.minPanelSize?.width ?? DEFAULT_MIN_PANEL_SIZE.width;
  const minHeight = props.minPanelSize?.height ?? DEFAULT_MIN_PANEL_SIZE.height;
  const minPanelSize = useMemo(() => ({ width: minWidth, height: minHeight }), [minWidth, minHeight]);

  // Only the side of `stackBelow` is state: a resize that stays on one side re-renders nothing (#823).
  const [belowStack, setBelowStack] = useState(false);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || stackBelow === undefined) return;
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) setBelowStack(entry.contentRect.width < stackBelow); });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [stackBelow]);
  const narrow = stackBelow !== undefined && belowStack;

  // Narrow display: the user's tab choice there is display-only and ends when the first group's own active tab changes.
  const firstActive = dockGroups(layout)[0]?.active ?? '';
  const [choice, setChoice] = useState<{ base: string; id: string } | null>(null);
  const stackedChoice = choice && choice.base === firstActive ? choice.id : undefined;
  const known = useMemo(() => new Set(panelOrder(layout)), [layout]);
  // A host's reveal request (internal): the narrow display shows that panel, as a user's tab choice would, so a later choice still replaces it.
  const [seenReveal, setSeenReveal] = useState(reveal);
  if (reveal !== seenReveal) {
    setSeenReveal(reveal);
    if (reveal && known.has(reveal.panelId)) setChoice({ base: firstActive, id: reveal.panelId });
  }
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
   * Tab order of a group: its active tab, the buttons of its header slots (`renderGroupTabsEnd` after the tabs, then `renderGroupActions`), then its visible panel's content; then the
   * next group's tab, groups in reading order (the engine's DOM puts every tab strip before every panel, in tree order). Only the steps between
   * those parts, and the step out of a panel's first or last stop, are made here; Tab inside the slot or the content is the browser's.
   * Returns whether it moved focus. After the last group (and before the first) focus leaves for the next (previous) focusable outside the layout.
   */
  const reading = useMemo(() => {
    const order = new Map<string, number>();
    dockGroupsInReadingOrder(display).forEach((group, index) => { group.panels.forEach(id => { order.set(id, index); }); });
    return order;
  }, [display]);
  const moveTabStop = (target: EventTarget | null, backward: boolean): boolean => {
    const root = container.current;
    if (!root || !(target instanceof HTMLElement)) return false;
    const stops = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id][aria-selected="true"]'))
      .filter(tab => tabOf(tab, root) !== null && (typeof tab.checkVisibility !== 'function' || tab.checkVisibility({ visibilityProperty: true })))
      .map(tab => {
        const id = tab.dataset.tabPanelId ?? '';
        const group = tab.closest('.dv-groupview');
        const panel = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-panel]')).find(item => item.dataset.dockPanel === id && item.dataset.dockVisible === 'true' && item.closest('[data-dock-layout]') === root) ?? null;
        const slots = Array.from(group?.querySelectorAll<HTMLElement>(SLOT) ?? []);
        return { tab, panel, group, slots, order: reading.get(id) ?? 0 };
      })
      .sort((a, b) => a.order - b.order);
    type Stop = (typeof stops)[number];
    const slotItems = (stop: Stop) => stop.slots.flatMap(slot => tabbablesIn(slot));
    const contentItems = (stop: Stop) => (stop.panel ? tabbablesIn(stop.panel) : []);
    /** The first (or last) place Tab can stop in the group: tab, then slot, then content. */
    const enter = (stop: Stop, last: boolean) => {
      const content = contentItems(stop);
      const slotStops = slotItems(stop);
      (last ? (content[content.length - 1] ?? (stop.panel ? focusTargetOf(stop.panel) : undefined) ?? slotStops[slotStops.length - 1] ?? stop.tab) : stop.tab).focus({ preventScroll: true });
    };
    const focusContentStart = (stop: Stop) => { (contentItems(stop)[0] ?? (stop.panel ? focusTargetOf(stop.panel) : undefined))?.focus({ preventScroll: true }); };
    /** Past a group's last stop: the next group's tab; after the last group, the first focusable after the layout (whatever the engine's DOM order is). */
    const after = (at: number): boolean => {
      const next = stops[at + 1];
      if (next) { next.tab.focus({ preventScroll: true }); return true; }
      return leave(root, false);
    };
    const tab = tabOf(target, root);
    if (tab) {
      const at = stops.findIndex(stop => stop.group === tab.closest('.dv-groupview'));
      if (at < 0) return false;
      const stop = stops[at]!;
      if (!backward) {
        const inSlot = slotItems(stop)[0];
        if (inSlot) { inSlot.focus({ preventScroll: true }); return true; }
        if (!stop.panel) return after(at);
        focusContentStart(stop);
        return true;
      }
      if (at === 0) return leave(root, true);
      enter(stops[at - 1]!, true);
      return true;
    }
    const slot = target.closest<HTMLElement>(SLOT);
    if (slot && slot.closest('[data-dock-layout]') === root) {
      const at = stops.findIndex(stop => stop.slots.includes(slot));
      if (at < 0) return false;
      const stop = stops[at]!;
      const items = slotItems(stop);
      if (backward) {
        if (!startsAt(items, target)) return false;
        stop.tab.focus({ preventScroll: true });
        return true;
      }
      if (target !== items[items.length - 1]) return false;
      if (!stop.panel) return after(at);
      focusContentStart(stop);
      return true;
    }
    const panel = target.closest<HTMLElement>('[data-dock-panel]');
    if (!panel || panel.closest('[data-dock-layout]') !== root) return false;
    const at = stops.findIndex(stop => stop.panel === panel);
    if (at < 0) return false;
    const stop = stops[at]!;
    const items = tabbablesIn(panel);
    const fallback = focusTargetOf(panel);
    if (backward) {
      // The first stop of the content: the panel itself, its focus target, or the first control (a roving wrapper in front of it does not count).
      if (target !== panel && target !== fallback && !startsAt(items, target)) return false;
      const inSlot = slotItems(stop);
      (inSlot[inSlot.length - 1] ?? stop.tab).focus({ preventScroll: true });
      return true;
    }
    if (target !== panel && target !== (items[items.length - 1] ?? fallback)) return false;
    return after(at);
  };

  /** The menu of a tab's group, for that tab: a background tab becomes the active (and the host's current) one first, as a click on it would. */
  const openTabMenu = (tab: HTMLElement): boolean => {
    const root = container.current;
    const id = tab.dataset.tabPanelId;
    if (!root || !id) return false;
    if (tab.getAttribute('aria-selected') !== 'true') activate(id);
    openGroupMenu(root, tab);
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
      if (openTabMenu(tab)) { event.preventDefault(); event.stopPropagation(); }
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
  return <div ref={container} role="region" aria-label={label} data-dock-layout data-dock-narrow={narrow} className={rows && !narrow ? 'relative min-h-0 w-full min-w-0 overflow-hidden' : 'relative h-full min-h-0 w-full min-w-0 overflow-hidden'}
    onKeyDownCapture={onKeyDownCapture} onKeyDown={onKeyDown}
    onContextMenu={event => {
      const tab = tabOf(event.target, container.current);
      if (tab && openTabMenu(tab)) event.preventDefault();
    }}
    onPointerDownCapture={event => {
      const tab = event.button === 0 ? tabOf(event.target, container.current) : null;
      if (tab?.dataset.tabPanelId) activate(tab.dataset.tabPanelId);
    }}>
    <ChunkLoadBoundary key={attempt} onError={onError}>
      <Suspense fallback={<div role="status" aria-busy className="h-full w-full"><Skeleton className="h-full w-full" /></div>}>
        <DockEngine panels={panels} layout={layout} display={display} interactive={!narrow} maximizedPanelId={maximized} visible={visible} minPanelSize={minPanelSize}
          onLayoutChange={onLayoutChange} onActivate={activate} renderTab={renderTab} renderGroupActions={renderGroupActions} renderGroupTabsEnd={renderGroupTabsEnd} tabA11y={tabA11y} separatorLabel={separatorLabel} canDropAt={canDropAt}
          containerRef={container} instanceId={instanceId} rows={narrow ? undefined : rows} />
      </Suspense>
    </ChunkLoadBoundary>
  </div>;
}
