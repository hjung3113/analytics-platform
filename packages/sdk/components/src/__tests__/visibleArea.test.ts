import { afterEach, describe, expect, it, vi } from 'vitest';
import { alignUnderChrome, restoreScrollOffset, revealFocused, revealInScrollContainer, scrollContainerOf, stickyChromeHeight, visibleAreaHeight } from '../visibleArea';

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

describe('revealFocused', () => {
  function mount({ innerTop = 100, fieldTop = 180, groupBottom }: { innerTop?: number; fieldTop?: number; groupBottom?: number } = {}) {
    document.body.innerHTML = '<main style="overflow-y:auto"><div data-platform-page><header data-page-sticky-header></header><div id="inner" style="overflow-y:auto"><div id="group"><button id="field"></button></div></div></div></main>';
    const outer = document.querySelector('main')!;
    const inner = document.getElementById('inner')!;
    const group = document.getElementById('group')!;
    const field = document.getElementById('field')!;
    const header = document.querySelector('header')!;
    const rect = (element: Element, top: () => number, bottom: () => number) => {
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({ top: top(), bottom: bottom(), height: bottom() - top() }) as DOMRect);
    };
    const innerHeight = 100;
    const outerHeight = 220;
    size(outer, { clientHeight: outerHeight });
    size(inner, { clientHeight: innerHeight });
    rect(outer, () => 0, () => outerHeight);
    rect(inner, () => innerTop - outer.scrollTop, () => innerTop + innerHeight - outer.scrollTop);
    const fieldOffset = () => outer.scrollTop + inner.scrollTop;
    rect(field, () => fieldTop - fieldOffset(), () => fieldTop + 32 - fieldOffset());
    rect(group, () => fieldTop - fieldOffset(), () => (groupBottom ?? fieldTop + 32) - fieldOffset());
    size(header, { height: 0 });
    return { outer, inner, group, field, header };
  }

  it('scrolls only the inner container when that brings the field into view', () => {
    const { outer, inner, field } = mount();
    revealFocused(field);
    expect(inner.scrollTop).toBe(12);
    expect(field.getBoundingClientRect().bottom).toBe(200);
    expect(outer.scrollTop).toBe(0);
  });

  it('keeps both offsets when the field fits and only the wrapped group overflows (C3)', () => {
    const { outer, inner, group, field } = mount({ innerTop: 140, fieldTop: 180, groupBottom: 252 });
    expect(group.getBoundingClientRect().bottom).toBeGreaterThan(outer.clientHeight);
    revealFocused(field);
    expect([inner.scrollTop, outer.scrollTop]).toEqual([0, 0]);
  });

  it('aligns the field above the inner sticky footer (C1)', () => {
    const { outer, inner, field } = mount();
    const footerHeight = 40;
    revealFocused(field, { bottomInset: container => container === inner ? footerHeight : 0 });
    expect(field.getBoundingClientRect().bottom).toBe(160);
    expect(inner.scrollTop).toBe(52);
    expect(outer.scrollTop).toBe(0);
  });

  it('reveals the field below the page sticky header', () => {
    const { outer, inner, field, header } = mount({ innerTop: 60, fieldTop: 100 });
    size(header, { height: 75 });
    outer.scrollTop = 40;
    revealFocused(field);
    expect(outer.scrollTop).toBe(25);
    expect(field.getBoundingClientRect().top).toBe(75);
    expect(inner.scrollTop).toBe(0);
  });

  it('scrolls the outer container when the inner adjustment still leaves the field clipped', () => {
    const { outer, inner, field } = mount({ innerTop: 180, fieldTop: 270 });
    revealFocused(field);
    expect(inner.scrollTop).toBe(22);
    expect(outer.scrollTop).toBe(60);
    expect(field.getBoundingClientRect().bottom).toBe(220);
  });

  it('uses the viewport band when the document scrolls', () => {
    document.body.innerHTML = '<div data-platform-page><header data-page-sticky-header></header><button id="field"></button></div>';
    size(document.querySelector('header')!, { height: 40 });
    const field = document.getElementById('field')!;
    const root = document.scrollingElement ?? document.documentElement;
    const initialScroll = root.scrollTop;
    vi.spyOn(field, 'getBoundingClientRect').mockImplementation(() => {
      const top = 120 - root.scrollTop;
      return { top, bottom: top + 32 } as DOMRect;
    });
    try {
      root.scrollTop = 100;
      revealFocused(field);
      expect(root.scrollTop).toBe(80);
      expect(field.getBoundingClientRect().top).toBe(40);
    } finally {
      root.scrollTop = initialScroll;
    }
  });

  it('reveals Brush with the nearest horizontal adjustment inside a clipped toolbar', () => {
    document.body.innerHTML = '<main style="overflow-y:auto"><div role="toolbar" data-reveal-x style="overflow-x:auto"><button>Brush</button></div></main>';
    const main = document.querySelector('main')!;
    const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]')!;
    const brush = document.querySelector('button')!;
    size(main, { clientHeight: 500 });
    Object.defineProperties(toolbar, { clientWidth: { value: 120 }, scrollWidth: { value: 220 } });
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({ left: 20 } as DOMRect);
    vi.spyOn(brush, 'getBoundingClientRect').mockImplementation(() => {
      const left = 148 - toolbar.scrollLeft;
      return { left, right: left + 32, top: 60, bottom: 88 } as DOMRect;
    });

    revealFocused(brush);

    expect(toolbar.scrollLeft).toBe(40);
    expect(brush.getBoundingClientRect().right).toBe(140);
    expect(main.scrollTop).toBe(0);
  });

  it('never scrolls a page scroller sideways when only it overflows horizontally (#3010 C5)', () => {
    document.body.innerHTML = '<main style="overflow-y:auto;overflow-x:auto"><div role="toolbar"><button>Brush</button></div></main>';
    const main = document.querySelector('main')!;
    const brush = document.querySelector('button')!;
    size(main, { clientHeight: 500 });
    Object.defineProperties(main, { clientWidth: { value: 400 }, scrollWidth: { value: 900 } });
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0 } as DOMRect);
    vi.spyOn(brush, 'getBoundingClientRect').mockReturnValue({ left: 600, right: 632, top: 60, bottom: 88 } as DOMRect);

    revealFocused(brush);

    expect(main.scrollLeft).toBe(0);
  });
});

describe('revealInScrollContainer (focus reveal, ADR-0130)', () => {
  const rect = (element: Element, top: number, bottom: number) => { vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top, bottom, height: bottom - top } as DOMRect); };
  const mount = (inner = '<button id="target"></button>') => {
    document.body.innerHTML = `<aside><a id="rail">r</a></aside><main style="overflow-y:auto"><div data-platform-page><div data-page-sticky-header><button id="head">h</button></div><div id="root" data-panel-workspace><div data-dock-panel>${inner}</div></div></div></main>`;
    const main = document.querySelector('main')!;
    size(main, { clientHeight: 800 });
    rect(main, 0, 800);
    rect(document.querySelector('[data-page-sticky-header]')!, 0, 100);
    main.scrollTop = 1000;
    return { main, root: document.getElementById('root')!, target: document.getElementById('target')! };
  };

  it('scrolls up so an element under the sticky chrome sits just below it', () => {
    const { main, root, target } = mount();
    rect(target, 40, 70);
    rect(document.querySelector('[data-dock-panel]')!, 0, 600);
    revealInScrollContainer(target, root);
    expect(main.scrollTop).toBe(1000 + 40 - 100);
  });

  it('scrolls down so an element below the visible bottom ends at the bottom edge, and leaves a visible one alone', () => {
    const { main, root, target } = mount();
    rect(document.querySelector('[data-dock-panel]')!, 0, 2000);
    rect(target, 850, 900);
    revealInScrollContainer(target, root);
    expect(main.scrollTop).toBe(1100);
    main.scrollTop = 1000;
    rect(target, 300, 340);
    revealInScrollContainer(target, root);
    expect(main.scrollTop).toBe(1000);
  });

  it('inside a panel the element counts by its rect clamped to the panel', () => {
    const { main, root, target } = mount();
    rect(document.querySelector('[data-dock-panel]')!, 200, 500);
    rect(target, 150, 900);
    revealInScrollContainer(target, root);
    expect(main.scrollTop).toBe(1000);
  });

  it('leaves a target that spans the whole visible area alone', () => {
    const { main, root, target } = mount();
    rect(document.querySelector('[data-dock-panel]')!, 0, 2000);
    rect(target, 0, 1000);
    revealInScrollContainer(target, root);
    expect(main.scrollTop).toBe(1000);
  });

  it('with one edge of a target inside the area keeps the nearest rule', () => {
    const { main, root, target } = mount();
    rect(document.querySelector('[data-dock-panel]')!, 0, 3000);
    rect(target, 50, 500);
    revealInScrollContainer(target, root);
    expect(main.scrollTop).toBe(1000 + 50 - 100);
    main.scrollTop = 1000;
    rect(target, 400, 1500);
    revealInScrollContainer(target, root);
    expect(main.scrollTop).toBe(1000 + Math.min(1500 - 800, 400 - 100));
  });

  it('is a no-op for an element outside the scroll container or inside the sticky chrome', () => {
    const { main, root } = mount();
    const scrollIntoView = vi.fn();
    (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = scrollIntoView;
    const rail = document.getElementById('rail')!;
    rect(rail, -500, -400);
    revealInScrollContainer(rail, root);
    const head = document.getElementById('head')!;
    rect(head, -500, -400);
    revealInScrollContainer(head, root);
    expect(main.scrollTop).toBe(1000);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('alignUnderChrome puts an element directly under the sticky chrome', () => {
    const { main, root } = mount();
    rect(root, 400, 900);
    alignUnderChrome(root, root);
    expect(main.scrollTop).toBe(1300);
  });
});

describe('restoreScrollOffset (#1978)', () => {
  /** A scroll container whose `scrollTop` is clamped to the room it has now, like the browser, and whose room can grow later. */
  function clamped(initialRoom: number) {
    const element = document.createElement('div');
    document.body.append(element);
    let room = initialRoom;
    let top = 0;
    Object.defineProperty(element, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => { top = Math.max(0, Math.min(value, room)); } });
    return { element, grow: (next: number) => { room = next; } };
  }
  const frames = (count: number) => { for (let i = 0; i < count; i += 1) vi.advanceTimersByTime(17); };
  const withFrames = (run: () => void) => { vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] }); try { run(); } finally { vi.useRealTimers(); } };

  it('returns to the saved offset once the page has grown back, although the first write was clamped', () => withFrames(() => {
    const { element, grow } = clamped(0);
    restoreScrollOffset(element, 300);
    expect(element.scrollTop).toBe(0);
    grow(900);
    frames(2);
    expect(element.scrollTop).toBe(300);
  }));
  it('writes at once when there is room, and stops retrying', () => withFrames(() => {
    const { element } = clamped(900);
    restoreScrollOffset(element, 300);
    expect(element.scrollTop).toBe(300);
    frames(1);
    element.scrollTop = 120;
    frames(20);
    expect(element.scrollTop).toBe(120);
  }));
  it('gives up after a few frames when the page never grows back', () => withFrames(() => {
    const { element, grow } = clamped(50);
    restoreScrollOffset(element, 300);
    frames(30);
    grow(900);
    frames(5);
    expect(element.scrollTop).toBe(50);
  }));
  it.each(['wheel', 'keydown', 'pointerdown'])('lets a %s from the user end the retries', type => withFrames(() => {
    const { element, grow } = clamped(0);
    restoreScrollOffset(element, 300);
    frames(1);
    element.dispatchEvent(new Event(type));
    grow(900);
    frames(5);
    expect(element.scrollTop).toBe(0);
  }));
  it('is not ended by the key press that triggered the restore (Escape closes the maximize while the same event still bubbles to the container)', () => withFrames(() => {
    const { element, grow } = clamped(0);
    const child = document.createElement('button');
    element.append(child);
    child.addEventListener('keydown', () => { restoreScrollOffset(element, 300); });
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    grow(900);
    frames(3);
    expect(element.scrollTop).toBe(300);
  }));
  it('ends on an input a child consumed (stopPropagation) after the first frame', () => withFrames(() => {
    const { element, grow } = clamped(0);
    const child = document.createElement('button');
    element.append(child);
    child.addEventListener('keydown', event => { event.stopPropagation(); });
    restoreScrollOffset(element, 300);
    frames(1);
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    grow(900);
    frames(5);
    expect(element.scrollTop).toBe(0);
  }));
  it('can be cancelled by the caller', () => withFrames(() => {
    const { element, grow } = clamped(0);
    const cancel = restoreScrollOffset(element, 300);
    cancel();
    grow(900);
    frames(5);
    expect(element.scrollTop).toBe(0);
  }));
});
