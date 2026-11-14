import { expect, it } from 'vitest';
import { dockStripElement, dockTabElements, isActiveDockTab } from '../tabElements';
it('owns the engine DOM vocabulary behind the dock host seam (#2028 SHE-22)', () => {
  const strip = document.createElement('div'); strip.className = 'dv-tabs-and-actions-container';
  strip.innerHTML = '<div class="dv-tab dv-active-tab"><span>Active</span></div><div class="dv-tab">Other</div>';
  const tabs = dockTabElements(strip);
  expect(tabs).toHaveLength(2);
  expect(isActiveDockTab(tabs[0])).toBe(true);
  expect(isActiveDockTab(tabs[1])).toBe(false);
  expect(dockStripElement(tabs[0].firstElementChild!)).toBe(strip);
  expect(dockTabElements(null)).toEqual([]);
});
