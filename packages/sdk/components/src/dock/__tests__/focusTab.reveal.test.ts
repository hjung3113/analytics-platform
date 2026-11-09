import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusTabSoon } from '../focusTab';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers(); });

function mount(mode: 'stack' | 'fit') {
  document.body.innerHTML = `<main style="overflow-y:auto"><div data-platform-page><div data-page-sticky-header></div><div id="root" data-panel-workspace data-workspace-mode="${mode}"><div data-dock-layout><div role="tab" data-tab-panel-id="p" tabindex="0"></div></div></div></div></main>`;
  const main = document.querySelector('main')!;
  Object.defineProperty(main, 'clientHeight', { configurable: true, value: 800 });
  const box = (element: Element, top: number, bottom: number) => vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top, bottom, height: bottom - top } as DOMRect);
  box(main, 0, 800);
  box(document.querySelector('[data-page-sticky-header]')!, 0, 100);
  box(document.querySelector('[role="tab"]')!, 1200, 1240);
  main.scrollTop = 0;
  return { main, root: document.getElementById('root')! };
}

describe('focusTabSoon reveals the tab in the page scroll container in stack mode only (ADR-0130 D8)', () => {
  it('stack: focus does not scroll by itself, then the tab is revealed below the sticky chrome', () => {
    vi.useFakeTimers();
    const { main, root } = mount('stack');
    focusTabSoon(() => root, 'p');
    vi.advanceTimersByTime(5);
    expect(document.activeElement).toBe(document.querySelector('[role="tab"]'));
    expect(main.scrollTop).toBe(1240 - 800);
  });

  it('fit: the tab is focused and the container is left alone', () => {
    vi.useFakeTimers();
    const { main, root } = mount('fit');
    focusTabSoon(() => root, 'p');
    vi.advanceTimersByTime(5);
    expect(document.activeElement).toBe(document.querySelector('[role="tab"]'));
    expect(main.scrollTop).toBe(0);
  });
});
