import { afterEach, describe, expect, it, vi } from 'vitest';
import { compactTabCount, markCompactTabs, tabFloors } from './PaneHeader';

/** A strip of one active and `background` background tabs; an expanded tab is 150px wide with an 80px name (full floor 150 - 16 = 134), a compact one 36px with no name. */
const build = (background: number) => {
  const strip = document.createElement('div');
  for (let n = 0; n <= background; n++) {
    const tab = document.createElement('div');
    tab.className = n === 0 ? 'dv-tab dv-active-tab' : 'dv-tab';
    tab.style.paddingLeft = '8px';
    tab.style.paddingRight = '8px';
    tab.innerHTML = `<span data-pane-badge></span><span data-dock-tab-shrinkable>name ${n}</span>`;
    strip.append(tab);
  }
  document.body.append(strip);
  return strip;
};
const rect = (width: number) => ({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });

describe('tabFloors keeps the full floors measured while expanded (docs/16 §4 ②)', () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });
  const stub = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('dv-tab')) return rect(this.hasAttribute('data-dock-tab-compact') && !this.classList.contains('dv-active-tab') ? 36 : 150);
    if (this.hasAttribute('data-dock-tab-shrinkable')) return rect(this.closest('[data-dock-tab-compact]') && !this.closest('.dv-active-tab') ? 0 : 80);
    if (this.hasAttribute('data-pane-badge')) return rect(20);
    return rect(0);
  });
  /** One measurement pass, as `useVisibleChips` runs it: the head needs `need` px beside the tabs. */
  const pass = (strip: HTMLElement, width: number, need = 100) => {
    const count = compactTabCount(tabFloors(strip), width, room => room >= need);
    markCompactTabs(strip, count);
    return count;
  };

  it('gives the same count for the same width however the marks stood before, and after widening', () => {
    stub();
    const strip = build(3);
    // 4 tabs at 134 + 100 for the head = 636 wide: nothing shrinks. Each tab short of that shrinks one more.
    const widths = [700, 636, 635, 500, 420, 636, 700];
    const first = widths.map(width => pass(strip, width));
    expect(first).toEqual([0, 0, 1, 2, 3, 0, 0]);
    // Again, in another order, with the marks the last pass left behind.
    const again = [...widths].reverse().map(width => pass(strip, width));
    expect(again).toEqual([...first].reverse());
    // Measured on its own after compaction, a compact tab still says 134, not the 136 constant.
    pass(strip, 500);
    expect(tabFloors(strip).map(tab => tab.full)).toEqual([134, 134, 134, 134]);
  });

  it('forgets a floor when the tab\'s title changes', () => {
    stub();
    const strip = build(1);
    pass(strip, 700);
    pass(strip, 100);
    const second = strip.querySelectorAll('.dv-tab')[1]!;
    expect(second.hasAttribute('data-dock-tab-compact')).toBe(true);
    second.querySelector('[data-dock-tab-shrinkable]')!.textContent = 'renamed';
    expect(tabFloors(strip)[1]!.full).toBe(136);
  });

  it('does not let a crushed tab shrink its floor', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('dv-tab')) return rect(32);
      if (this.hasAttribute('data-dock-tab-shrinkable')) return rect(64);
      if (this.hasAttribute('data-pane-badge')) return rect(20);
      return rect(0);
    });
    // The box around the name is 16px wide but its content wants 122px: the tab is crushed, its need is 32 + 106.
    const box = { clientWidth: 16, scrollWidth: 122 };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-dock-tab-shrinkable') ? 64 : box.clientWidth; });
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-dock-tab-shrinkable') ? 64 : box.scrollWidth; });
    const strip = build(3);
    expect(tabFloors(strip).map(tab => tab.full)).toEqual([138, 138, 138, 138]);
  });
});
