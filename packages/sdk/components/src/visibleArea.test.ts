import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollContainerOf, stickyChromeHeight, visibleAreaHeight } from './visibleArea';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

const size = (element: Element, props: Partial<Record<'clientHeight', number>> & { height?: number }) => {
  if (props.clientHeight !== undefined) Object.defineProperty(element, 'clientHeight', { configurable: true, value: props.clientHeight });
  if (props.height !== undefined) vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ height: props.height } as DOMRect);
};

describe('visibleAreaHeight', () => {
  it('is the scroll container\'s client height less the sticky page head', () => {
    document.body.innerHTML = '<main style="overflow-y:auto"><div data-platform-page><div data-page-sticky-header></div><div id="target"></div></div></main>';
    size(document.querySelector('main')!, { clientHeight: 800 });
    size(document.querySelector('[data-page-sticky-header]')!, { height: 96 });
    expect(visibleAreaHeight(document.getElementById('target')!)).toBe(704);
  });

  it.each<[string, string, number]>([
    ['expanded: the query row scrolls with the page, only the head sticks', '<div data-query-bar></div>', 704],
    ['collapsed: the query row sticks under the head and is taken off too', '<div data-query-bar data-query-bar-collapsed></div>', 647],
  ])('an apply page, %s', (_name, bar, expected) => {
    document.body.innerHTML = `<main style="overflow-y:auto"><div data-platform-page><div data-page-sticky-header></div>${bar}<div id="target"></div></div></main>`;
    size(document.querySelector('main')!, { clientHeight: 800 });
    size(document.querySelector('[data-page-sticky-header]')!, { height: 96 });
    size(document.querySelector('[data-query-bar]')!, { height: 57 });
    expect(visibleAreaHeight(document.getElementById('target')!)).toBe(expected);
  });

  it('a query row of another page (outside this page) is not taken off', () => {
    document.body.innerHTML = '<main style="overflow-y:auto"><div data-query-bar data-query-bar-collapsed></div><div data-platform-page><div data-page-sticky-header></div><div id="target"></div></div></main>';
    size(document.querySelector('main')!, { clientHeight: 800 });
    size(document.querySelector('[data-page-sticky-header]')!, { height: 96 });
    size(document.querySelector('[data-query-bar]')!, { height: 57 });
    expect(visibleAreaHeight(document.getElementById('target')!)).toBe(704);
  });

  it('inside a board pane (no sticky chrome: the pane head and the query row belong to the board) it is the pane body\'s height', () => {
    document.body.innerHTML = '<main style="overflow-y:auto"><div data-pane-body style="overflow-y:auto"><div data-platform-page><div id="target"></div></div></div></main>';
    size(document.querySelector('main')!, { clientHeight: 800 });
    size(document.querySelector('[data-pane-body]')!, { clientHeight: 420 });
    expect(scrollContainerOf(document.getElementById('target')!)).toBe(document.querySelector('[data-pane-body]'));
    expect(visibleAreaHeight(document.getElementById('target')!)).toBe(420);
  });

  it('falls back to the window when nothing scrolls', () => {
    document.body.innerHTML = '<div id="target"></div>';
    vi.stubGlobal('innerHeight', 640);
    expect(scrollContainerOf(document.getElementById('target')!)).toBeNull();
    expect(visibleAreaHeight(document.getElementById('target')!)).toBe(640);
    vi.unstubAllGlobals();
  });
});

describe('stickyChromeHeight', () => {
  it('sums the head and the collapsed query row of the page; nothing without a page', () => {
    document.body.innerHTML = '<div data-platform-page><div data-page-sticky-header></div><div data-query-bar data-query-bar-collapsed></div></div>';
    size(document.querySelector('[data-page-sticky-header]')!, { height: 50 });
    size(document.querySelector('[data-query-bar]')!, { height: 48 });
    expect(stickyChromeHeight(document.querySelector('[data-platform-page]'))).toBe(98);
    expect(stickyChromeHeight(null)).toBe(0);
  });
});
