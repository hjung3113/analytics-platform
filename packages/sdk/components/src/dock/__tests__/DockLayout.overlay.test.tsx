import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { group, installResizeObserver, mountDock, resetMounts, row } from './harness';

// #1173: the engine draws every panel in an overlay that dockview moves and sizes from the group's DOM box, and it re-reads that box only when the
// group is laid out. After a window-less relayout (maximizing a board pane) the nested layout learns its new width a frame before the DOM column
// above it grows, so the overlay kept the old box (a chart 475 px wide in a 1298 px workspace) until the next window resize.
const observer = installResizeObserver();
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });
beforeEach(() => { resetMounts(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** The width the browser would report for a group's content box: what the DOM column above the group currently allows. */
const dom = { width: 500 };
const overlayWidth = (id: string) => {
  const content = screen.getByTestId(`content-${id}`);
  return content.closest<HTMLElement>('.dv-render-overlay')?.style.width;
};

describe('DockLayout overlay after the group box grows without a layout (#1173)', () => {
  it('moves the panel overlay to the group\'s new box when only the group element resizes', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains('dv-content-container') ? dom.width : 0;
      return { width, height: 300, top: 0, left: 0, right: width, bottom: 300, x: 0, y: 0, toJSON: () => ({}) };
    });
    mountDock({ layout: row([100, 0], group(['a'])), ids: ['a'] });
    await screen.findAllByRole('tab');
    await waitFor(() => { expect(overlayWidth('a')).toBe('500px'); });

    // Let the frames dockview queued while mounting run out: until then they re-read the box themselves, which hides the missing relayout.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
    expect(overlayWidth('a')).toBe('500px');

    dom.width = 800;
    // Nothing but this group-box report may tell the engine: no window resize, no dockview dimension event.
    observer.touch(target => target.classList.contains('dv-groupview'), 800);

    await waitFor(() => { expect(overlayWidth('a')).toBe('800px'); });
  });
});
