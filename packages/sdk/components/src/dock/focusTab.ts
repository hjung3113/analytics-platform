import { revealInScrollContainer } from '../visibleArea';
import { isProgrammaticFocus, programmaticFocus } from './programmaticFocus';

/** Focus without the browser's scroll; in row mode the workspace's scroll container then reveals the element below its sticky chrome (`revealInScrollContainer`). */
export function focusRevealing(element: HTMLElement, layout: HTMLElement | null | undefined, rowMode: boolean): void {
  element.focus({ preventScroll: true });
  if (rowMode && layout) revealInScrollContainer(element, layout);
}

/** The workspace's own dock, not a standalone dock its toolbar actions may render first. */
const workspaceDock = (root: HTMLElement | null | undefined): Element | null | undefined =>
  (root?.querySelector('[data-workspace-dock]') ?? root)?.querySelector('[data-dock-layout]');

const workspaceTab = (root: HTMLElement | null | undefined, panelId: string): HTMLElement | undefined => {
  const layout = workspaceDock(root);
  return Array.from(layout?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? [])
    .find(item => item.dataset.tabPanelId === panelId && item.closest('[data-dock-layout]') === layout);
};

/**
 * Focuses what `find` returns once the engine or host has drawn it and it is visible: a changed tree is laid out a moment later, and a tab
 * may be rebuilt or moved to another group meanwhile. Retries every 30 ms for about 300 ms while `alive`, then gives up.
 */
function focusWhenDrawn(find: () => HTMLElement | null | undefined, focus: (element: HTMLElement) => void, alive: () => boolean = () => true): void {
  let tries = 0;
  const attempt = () => {
    if (!alive()) return;
    const element = find();
    if (element?.isConnected && !element.closest('[inert], [hidden]')) { programmaticFocus(() => { focus(element); }); return; }
    if (++tries < 10) setTimeout(attempt, 30);
  };
  setTimeout(attempt, 0);
}

/**
 * Focuses the tab of `panelId` in the layout under `root` once the engine has laid a changed tree out: the tab it had may have been rebuilt or
 * moved to another group, so it retries for about 300 ms. Same retry as the board's `focusTabSoon`; the board keeps its own copy because the
 * dependency direction forbids `@ap/shell` importing it from here.
 */
export function focusTabSoon(root: () => HTMLElement | null | undefined, panelId: string): void {
  focusWhenDrawn(() => workspaceTab(root(), panelId), tab => {
    const element = root();
    focusRevealing(tab, element, element?.dataset.workspaceMode === 'stack');
  }, () => root()?.isConnected === true);
}

/** Focuses the element `find` returns once it is rendered and visible, like `focusTabSoon` (a chip appears after the layout change). */
export function focusSoon(find: () => HTMLElement | null | undefined): void {
  focusWhenDrawn(find, element => { element.focus(); });
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

/** Per layout, the group whose menu a caller handed focus back to (`returnToGroupMenu`), until the user's next focus or pointer move elsewhere. */
const menuClaims = new WeakMap<Element, { panelId: string; release: () => void }>();

/**
 * Returns focus to the group menu that opened a surface outside the layout (panel settings, #3140): the trigger itself, or, when the group's
 * header was drawn again while the surface was open, the current menu of the group whose active panel is `panelId`. False when neither is
 * shown. It also claims that menu until the user's next focus or pointer move elsewhere: closing the surface can still widen the workspace
 * past its compact width, and the engine's rebuild then hands focus on to the new menu (`menuAfterRebuild`). Opening or closing the surface
 * rebuilds nothing else (#3166).
 */
export function returnToGroupMenu(trigger: HTMLElement, layout: Element, panelId: string): boolean {
  const menu = shown(trigger) ? trigger : groupMenu(layout, panelId);
  if (!shown(menu)) return false;
  programmaticFocus(() => { menu.focus({ preventScroll: true }); });
  menuClaims.get(layout)?.release();
  // The engine's own focus moves and focus on this group's (new) menu keep the claim.
  const onFocus = (event: FocusEvent) => {
    const target = event.target;
    if (isProgrammaticFocus()) return;
    if (target instanceof HTMLElement && target.matches('[data-dock-group-menu]') && target.closest('[data-dock-group-actions]')?.getAttribute('data-dock-active') === panelId) return;
    release();
  };
  const release = () => {
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('pointerdown', release, true);
    if (menuClaims.get(layout)?.release === release) menuClaims.delete(layout);
  };
  menuClaims.set(layout, { panelId, release });
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('pointerdown', release, true);
  return true;
}

/**
 * After the engine rebuilt its groups and moved focus from a removed group menu to `tab` (that group's tab, so focus is never lost), moves it
 * on to the group's new menu once the host has drawn it — only while a caller claims that menu (`returnToGroupMenu`). Unclaimed, focus stays
 * on the tab: a host may treat focus inside a group's header as choosing that group (the board selects the pane whose head is there), so the
 * engine never moves focus into a header on its own.
 */
export function menuAfterRebuild(layout: Element, panelId: string, tab: HTMLElement): void {
  if (menuClaims.get(layout)?.panelId !== panelId) return;
  focusWhenDrawn(() => groupMenu(layout, panelId), menu => { menu.focus({ preventScroll: true }); }, () => layout.isConnected && document.activeElement === tab);
}
