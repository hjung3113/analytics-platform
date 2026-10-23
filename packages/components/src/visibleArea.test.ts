import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollContainerOf, visibleAreaHeight } from './visibleArea';

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

  it('inside a board pane (no sticky head) it is the pane body\'s height', () => {
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
