import { afterEach, describe, expect, it } from 'vitest';
import { focusPageFallback, paneRootById, paneRootOf } from './pageFocus';

afterEach(() => { document.body.replaceChildren(); });

describe('pane roots', () => {
  it('finds the owning pane and looks up literal ids without selector interpolation', () => {
    const pane = document.createElement('section');
    pane.dataset.paneId = 'sheet.["one"]';
    const child = document.createElement('button');
    pane.append(child);
    document.body.append(pane);
    expect(paneRootOf(child)).toBe(pane);
    expect(paneRootOf(pane)).toBe(pane);
    expect(paneRootOf(null)).toBeNull();
    expect(paneRootOf(document.body)).toBeNull();
    expect(paneRootById('sheet.["one"]')).toBe(pane);
    expect(paneRootById('missing')).toBeNull();
  });

  it('keeps the focus fallback requirement that a pane root has tabindex', () => {
    const main = document.createElement('main');
    main.tabIndex = -1;
    const pane = document.createElement('section');
    pane.dataset.paneId = 'one';
    const child = document.createElement('button');
    pane.append(child);
    main.append(pane);
    document.body.append(main);
    focusPageFallback(child);
    expect(document.activeElement).toBe(main);
    pane.tabIndex = -1;
    focusPageFallback(child);
    expect(document.activeElement).toBe(pane);
  });
});
