/** Engine DOM is private to this host entry. Shells measure tabs through these helpers. */
export function dockTabElements(strip: Element | null): HTMLElement[] {
  return Array.from(strip?.querySelectorAll<HTMLElement>('.dv-tab') ?? []);
}
export function isActiveDockTab(tab: Element): boolean {
  return tab.classList.contains('dv-active-tab');
}
export function dockStripElement(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>('.dv-tabs-and-actions-container');
}
