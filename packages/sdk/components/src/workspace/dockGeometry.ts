import { watchBox, type GeometryWatch } from './usePointerDrag';

/** Dockview structure the workspace drags measure and hit-test. */
export const DOCK = '[data-dock-layout]';
export const GROUP = '.dv-groupview';
export const PANEL = '[data-dock-panel]';
export const GROUP_ACTIONS = '[data-dock-group-actions][data-dock-active]';

/** Hit inside `dock`, treating a nested dock as occupying its outer panel. */
export function dockPointerHit(dock: HTMLElement, x: number, y: number): Element | undefined {
  let hit = dock.ownerDocument.elementFromPoint?.(x, y) ?? null;
  if (!hit || !dock.contains(hit)) return;
  for (let owner = hit.closest(DOCK); owner && owner !== dock; owner = owner.parentElement?.closest(DOCK) ?? null) hit = owner;
  return hit;
}

export function dockGroups(dock: HTMLElement): HTMLElement[] {
  return [...dock.querySelectorAll<HTMLElement>(GROUP)].filter(group => group.closest(DOCK) === dock);
}

function dockChanged(dock: HTMLElement, { target, attributeName }: MutationRecord) {
  if (!(target instanceof Element) || target.closest(DOCK) !== dock) return false;
  // Dockview rewrites the scrollbar thumb on its own resize frame. That is not a group box,
  // and a refresh queued for it absorbs the next scroll (#3081).
  if (target.closest('.dv-scrollbar')) return false;
  // Panel content can update independently of the dock geometry.
  const body = target.closest(PANEL);
  return !body || (target === body && attributeName !== null);
}

/** `watchBox` for a dock: its own groups' boxes, active and visible panels, but not panel content. */
export function watchDock(dock: HTMLElement, changed: () => void): GeometryWatch {
  const box = watchBox(dock, changed, { changed: record => dockChanged(dock, record), attributes: ['data-dock-active', 'data-dock-visible'] });
  const { resize } = box;
  const groups = new Set<HTMLElement>();
  const sync = () => {
    if (!resize) return;
    const next = new Set(dockGroups(dock));
    for (const group of groups) if (!next.has(group)) resize.unobserve(group);
    for (const group of next) if (!groups.has(group)) resize.observe(group);
    groups.clear();
    for (const group of next) groups.add(group);
  };
  sync();
  return { sync, stop() { box.stop(); groups.clear(); } };
}
