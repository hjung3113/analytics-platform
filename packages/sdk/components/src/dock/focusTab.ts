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
export function focusTabSoon(root: () => HTMLElement | null | undefined, panelId: string): void {
  let tries = 0;
  const attempt = () => {
    const element = root();
    const layout = element?.querySelector('[data-dock-layout]');
    const tab = Array.from(element?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? [])
      .find(item => item.dataset.tabPanelId === panelId && item.closest('[data-dock-layout]') === layout);
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
  && (typeof element.checkVisibility !== 'function' || element.checkVisibility());

/**
 * Keeps focus on a menu trigger inside a workspace panel after its menu added panel `panelId`. The engine lays the addition out a moment
 * later: it may rebuild the trigger (found again by its panel and text) or put the new panel in front of the trigger's panel, which drops
 * focus to the document; focus then moves to the added panel's tab. Watches for about 600 ms and never takes focus the user moved elsewhere.
 */
export function keepFocusAfterPanelAdd(trigger: HTMLElement, panelId: string): void {
  const root = trigger.closest<HTMLElement>('[data-panel-workspace]');
  const source = trigger.closest<HTMLElement>('[data-dock-panel]')?.dataset.dockPanel;
  const label = trigger.textContent;
  const current = () => trigger.isConnected || source === undefined ? trigger
    : Array.from(root?.querySelectorAll<HTMLElement>('[data-dock-panel] button') ?? [])
      .find(button => button.closest<HTMLElement>('[data-dock-panel]')?.dataset.dockPanel === source && button.textContent === label);
  const lost = () => {
    const active = document.activeElement;
    return active === null || active === document.body || !shown(active);
  };
  let tries = 0;
  const attempt = () => {
    if (lost()) {
      const again = current();
      if (shown(again)) programmaticFocus(() => { again.focus({ preventScroll: true }); });
      else {
        const layout = root?.querySelector('[data-dock-layout]');
        const tab = Array.from(root?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? [])
          .find(item => item.dataset.tabPanelId === panelId && item.closest('[data-dock-layout]') === layout);
        if (shown(tab)) { programmaticFocus(() => { focusRevealing(tab, root, root?.dataset.workspaceMode === 'stack'); }); return; }
      }
    }
    if (++tries < 20) setTimeout(attempt, 30);
  };
  setTimeout(attempt, 0);
}
