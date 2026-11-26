import { revealInScrollContainer } from '../visibleArea';
import { programmaticFocus } from './programmaticFocus';

/** Focus without the browser's scroll; in row mode the workspace's scroll container then reveals the element below its sticky chrome (`revealInScrollContainer`). */
export function focusRevealing(element: HTMLElement, layout: HTMLElement | null | undefined, rowMode: boolean): void {
  element.focus({ preventScroll: true });
  if (rowMode && layout) revealInScrollContainer(element, layout);
}

/**
 * Focuses the tab of `panelId` in the layout under `root` once the engine has laid a changed tree out: the tab it had may have been rebuilt or
 * moved to another group, so it retries for about 300 ms. Same retry as the board's `focusTabSoon`; the board keeps its own copy because the
 * dependency direction forbids `@ap/shell` importing it from here.
 */
/** The workspace's own dock, not a standalone dock its toolbar actions may render first. */
const workspaceDock = (root: HTMLElement | null | undefined): Element | null | undefined =>
  (root?.querySelector('[data-workspace-dock]') ?? root)?.querySelector('[data-dock-layout]');

const workspaceTab = (root: HTMLElement | null | undefined, panelId: string): HTMLElement | undefined => {
  const layout = workspaceDock(root);
  return Array.from(layout?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? [])
    .find(item => item.dataset.tabPanelId === panelId && item.closest('[data-dock-layout]') === layout);
};

export function focusTabSoon(root: () => HTMLElement | null | undefined, panelId: string): void {
  let tries = 0;
  const attempt = () => {
    const element = root();
    const tab = workspaceTab(element, panelId);
    if (tab?.isConnected && !tab.closest('[inert], [hidden]')) { programmaticFocus(() => { focusRevealing(tab, element, element?.dataset.workspaceMode === 'stack'); }); return; }
    if (++tries < 10 && element?.isConnected) setTimeout(attempt, 30);
  };
  setTimeout(attempt, 0);
}

/** Focuses the element `find` returns once it is rendered and visible, retrying for about 300 ms like `focusTabSoon` (a chip appears after the layout change). */
export function focusSoon(find: () => HTMLElement | null | undefined): void {
  let tries = 0;
  const attempt = () => {
    const element = find();
    if (element?.isConnected && !element.closest('[inert], [hidden]')) { programmaticFocus(() => { element.focus(); }); return; }
    if (++tries < 10) setTimeout(attempt, 30);
  };
  setTimeout(attempt, 0);
}

const shown = (element: Element | null | undefined): element is HTMLElement =>
  element instanceof HTMLElement && element.isConnected && !element.closest('[inert], [hidden]')
  && (typeof element.checkVisibility !== 'function' || element.checkVisibility({ visibilityProperty: true }));

/** The watch of the latest panel addition; there is one keyboard focus, so one watch at a time. */
let activeWatch: (() => void) | null = null;

/**
 * Keeps focus on a menu trigger inside a workspace panel after its menu added panel `panelId`. The engine lays the addition out a moment
 * later: it may rebuild the trigger, found again in the same dock panel by its `data-focus-key`, or put the new panel in front of the
 * trigger's panel, which drops focus to the document; focus then moves to the added panel's tab (also when the trigger never returns). Watches for about 600 ms and stops at
 * the first focus or pointer input elsewhere, so it never takes back focus the user moved.
 */
export function keepFocusAfterPanelAdd(trigger: HTMLElement, panelId: string, onUnavailable?: () => void): void {
  const root = trigger.closest<HTMLElement>('[data-panel-workspace]');
  const layout = trigger.closest('[data-dock-layout]');
  const source = trigger.closest<HTMLElement>('[data-dock-panel]')?.dataset.dockPanel;
  const key = trigger.dataset.focusKey;
  const hosts = () => Array.from(layout?.querySelectorAll<HTMLElement>('[data-dock-panel]') ?? [])
    .filter(host => host.dataset.dockPanel === source && host.closest('[data-dock-layout]') === layout);
  const inSource = (element: Element) => element.closest('[data-dock-layout]') === layout
    && element.closest<HTMLElement>('[data-dock-panel]')?.dataset.dockPanel === source;
  const isTrigger = (element: Element) => element === trigger
    || (key !== undefined && element instanceof HTMLElement && element.dataset.focusKey === key && inSource(element));
  const current = () => {
    if (trigger.isConnected || key === undefined || source === undefined) return trigger;
    return hosts().flatMap(host => Array.from(host.querySelectorAll<HTMLElement>('[data-focus-key]')))
      .find(element => element.dataset.focusKey === key && inSource(element) && shown(element));
  };
  // The new panel's tab is the fallback only once the trigger's panel is out of sight, or the watch ends without finding the trigger.
  const covered = () => source === undefined || !hosts().some(host => shown(host));
  const lost = () => {
    const active = document.activeElement;
    return active === null || active === document.body || !shown(active);
  };
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (activeWatch === stop) activeWatch = null;
    clearTimeout(timer);
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('pointerdown', stop, true);
  };
  // Focus inside the closing menu or on the trigger (Radix returning it) is the hand-off itself; anywhere else is the user's move.
  function onFocus(event: FocusEvent) {
    const target = event.target;
    if (target instanceof Element && (isTrigger(target) || target.closest('[role="menu"]'))) return;
    stop();
  }
  const unavailable = () => {
    stop();
    if (lost()) onUnavailable?.();
  };
  const attempt = () => {
    if (!root?.isConnected) { unavailable(); return; }
    if (lost()) {
      const again = current();
      if (shown(again)) programmaticFocus(() => { again.focus({ preventScroll: true }); });
      else if (covered() || tries === 19) {
        const tab = workspaceTab(root, panelId);
        if (shown(tab)) { stop(); programmaticFocus(() => { focusRevealing(tab, root, root.dataset.workspaceMode === 'stack'); }); return; }
      }
    }
    if (++tries < 20) timer = setTimeout(attempt, 30);
    else unavailable();
  };
  // A newer addition owns the focus hand-off: an earlier watch on the same trigger would otherwise reach its own tab first.
  activeWatch?.();
  activeWatch = stop;
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('pointerdown', stop, true);
  timer = setTimeout(attempt, 0);
}

/** The ⋯ (or merged chart «더보기») in the header of the group whose active panel is `panelId`, in `layout` only. */
const groupMenu = (layout: Element, panelId: string): HTMLElement | undefined =>
  Array.from(layout.querySelectorAll<HTMLElement>('[data-dock-group-actions]'))
    .find(slot => slot.dataset.dockActive === panelId && slot.closest('[data-dock-layout]') === layout)
    ?.querySelector<HTMLElement>('[data-dock-group-menu]') ?? undefined;

/**
 * Returns focus to the group menu that opened a surface outside the layout (panel settings, #3140). Opening and closing that surface can
 * resize the workspace, and the engine then rebuilds its groups, so the menu found now may be replaced a moment later: like
 * `keepFocusAfterPanelAdd`, it watches for about 600 ms, puts focus back on the current menu of `panelId` whenever focus is lost, and stops
 * at the first focus or pointer input elsewhere. A rebuild after the watch that removes the focused menu is the engine's (`menuAfterRebuild`). `onUnavailable` runs when the watch ends with focus still lost.
 * Returns false (and watches nothing) when `trigger` is not inside a dock layout.
 */
export function keepGroupMenuFocus(trigger: HTMLElement, layout: Element | null, panelId: string | undefined, onUnavailable: () => void): boolean {
  if (!layout || panelId === undefined) return false;
  const current = () => (trigger.isConnected && shown(trigger) ? trigger : groupMenu(layout, panelId));
  const lost = () => {
    const active = document.activeElement;
    return active === null || active === document.body || !shown(active);
  };
  let tries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('pointerdown', stop, true);
  };
  function onFocus(event: FocusEvent) {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches('[data-dock-group-menu]') && target.closest('[data-dock-group-actions]')?.getAttribute('data-dock-active') === panelId) return;
    stop();
  }
  const attempt = () => {
    if (lost()) {
      const menu = current();
      if (shown(menu)) programmaticFocus(() => { menu.focus({ preventScroll: true }); });
    }
    if (++tries < 20 && layout.isConnected) timer = setTimeout(attempt, 30);
    else { stop(); if (lost()) onUnavailable(); }
  };
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('pointerdown', stop, true);
  attempt();
  return true;
}

/**
 * After the engine rebuilt its groups and moved focus from a removed group menu to `tab` (the same group's tab, so focus is never lost), moves
 * it on to that group's new menu once the host has drawn it, retrying for about 300 ms like `focusTabSoon`. Focus the user moved meanwhile stays.
 */
export function menuAfterRebuild(layout: Element, panelId: string, tab: HTMLElement): void {
  let tries = 0;
  const attempt = () => {
    if (document.activeElement !== tab) return;
    const menu = groupMenu(layout, panelId);
    if (shown(menu)) { programmaticFocus(() => { menu.focus({ preventScroll: true }); }); return; }
    if (++tries < 10 && layout.isConnected) setTimeout(attempt, 30);
  };
  setTimeout(attempt, 0);
}
