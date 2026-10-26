import { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROW_AREA_FLOOR, useTableFit } from '../tableFit';

const deliveries = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>();
class Observer {
  entry: { callback: ResizeObserverCallback; targets: Set<Element> };
  constructor(callback: ResizeObserverCallback) { this.entry = { callback, targets: new Set() }; deliveries.add(this.entry); }
  observe(el: Element) { this.entry.targets.add(el); }
  unobserve(el: Element) { this.entry.targets.delete(el); }
  disconnect() { deliveries.delete(this.entry); }
}
const box = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 800, width: 800, x: 0, y: top, toJSON() {} }) as DOMRect;
let banner = 200;
let many = true;
let frame: 'element' | 'window' = 'element';
const heightOf = (el: Element) => many ? Number.parseFloat((el as HTMLElement).style.maxHeight) || 420 : 80;
function setup() {
  vi.stubGlobal('ResizeObserver', Observer);
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1224);
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(150);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) { return this.id === 'frame' ? 1224 : 0; });
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(1224);
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockReturnValue(150);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const origin = (frame === 'element' ? 70 : 0) - 150;
    const views = [...document.querySelectorAll('[aria-label="rows"]')];
    let top = origin + banner;
    for (const view of views) {
      const height = heightOf(view);
      if (this === view) return box(top + 50, height);
      if (this === view.parentElement) return box(top, height + 100);
      top += height + 100;
    }
    if (this.id === 'frame') return box(70, 1224);
    if (this.id === 'banner' || this.id === 'banner-inner') return box(origin, banner);
    if (this.id === 'tail') return box(top, 24);
    if (this.id === 'flow') return box(origin, top - origin + 24);
    // Page content remains flex-filled while the banner changes.
    if (this.id === 'content' || this.id === 'slot') return box(origin, 1800);
    return box(0, 0);
  });
}
function Table({ id }: { id: string }) {
  const section = useRef<HTMLElement>(null);
  const fit = useTableFit(section);
  return <section ref={section}><div ref={fit.viewportRef} aria-label="rows" data-testid={id} data-table-auto-fit="" style={{ maxHeight: fit.cap ?? 420 }} /></section>;
}
function Page({ count = 1, hook = true, fill }: { count?: number; hook?: boolean; fill?: 'around' | 'after' }) {
  const flow = <div id="flow"><div id="banner"><div id="banner-inner" /></div>
    {Array.from({ length: count }, (_, i) => <Table key={i} id={`table-${i}`} />)}<div id="tail" />
  </div>;
  return <main id="frame" style={{ overflowY: frame === 'element' ? 'auto' : 'visible' }}>
    <div id="content" data-platform-page-content={hook ? '' : undefined}>
      {fill === 'around' ? <div id="slot" data-platform-page-fill="">{flow}</div> : fill === 'after' ? <>{flow}<div id="slot" data-platform-page-fill="" /></> : flow}
    </div>
  </main>;
}
const caps = () => screen.getAllByLabelText('rows').map(el => Number.parseFloat(el.style.maxHeight));
function deliver(matches: (el: Element) => boolean = () => true) {
  act(() => { for (const entry of [...deliveries]) if ([...entry.targets].some(matches)) entry.callback([], {} as ResizeObserver); });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); deliveries.clear(); banner = 200; many = true; frame = 'element'; });

describe('table fit flow invalidation and convergence', () => {
  it('grows the cap when an upstream nested banner shrinks with fixed page/table/viewport sizes', () => {
    setup(); many = false;
    render(<Page />);
    const before = caps()[0];
    banner = 0;
    deliver(el => el.id === 'banner' || el.id === 'banner-inner');
    expect(caps()[0]).toBe(before + 200);
  });

  it('rebinds when an upstream flow sibling is replaced', async () => {
    setup(); many = false;
    render(<Page />);
    const before = caps()[0];
    const old = document.getElementById('banner')!;
    const replacement = document.createElement('div'); replacement.id = 'banner';
    await act(async () => { old.replaceWith(replacement); });
    banner = 0;
    deliver(el => el === replacement);
    expect(caps()[0]).toBe(before + 200);
  });

  it('two long auto-fit tables settle to a stable pair with bounded updates', () => {
    setup(); banner = 0;
    render(<Page count={2} />);
    const pairs: number[][] = [caps()];
    for (let i = 0; i < 8; i++) { deliver(); pairs.push(caps()); }
    const updates = pairs.slice(1).filter((pair, i) => pair.some((cap, j) => cap !== pairs[i][j])).length;
    expect(updates).toBeLessThanOrEqual(2);
    expect(pairs.slice(-3)).toEqual([[760, 760], [760, 760], [760, 760]]);
  });

  it('re-measures when a peer leaves auto-fit without any size change', async () => {
    setup(); banner = 0;
    render(<Page count={2} />);
    for (let i = 0; i < 4; i++) deliver();
    const before = caps()[0];
    await act(async () => { screen.getByTestId('table-1').removeAttribute('data-table-auto-fit'); });
    expect(caps()[0]).not.toBe(before);
  });

  it.each(['element', 'window'] as const)('%s fallback ignores scrollHeight slack at nonzero scroll, from short results to long', mode => {
    frame = mode; setup(); banner = 0; many = false;
    render(<Page hook={false} />);
    expect(caps()).toEqual([1100]);
    many = true;
    deliver(); deliver();
    expect(caps()).toEqual([1100]);
  });

  it('measures the natural end inside a stretched fill slot, so the cap equals the same page without the slot', () => {
    setup(); many = false; banner = 0;
    render(<Page />);
    const flow = caps()[0];
    cleanup();
    render(<Page fill="around" />);
    expect(caps()).toEqual([flow]);
    expect(flow).toBeGreaterThan(ROW_AREA_FLOOR);
  });

  it('keeps the stretched bottom as the content end for a fill slot that does not hold the table', () => {
    setup(); many = false; banner = 0;
    render(<Page />);
    const flow = caps()[0];
    cleanup();
    render(<Page fill="after" />);
    expect(caps()[0]).toBeLessThan(flow);
  });
});
