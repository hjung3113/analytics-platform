import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { column, group, installResizeObserver, row } from './harness';
import { DockLayout, DockLayoutBase } from '../DockLayout';
import type { DockRows } from '../dockTypes';
import type { DockNode } from '../schema';

const panelData = vi.hoisted(() => ({ current: null as { viewId: string; groupId: string; panelId: string | null } | null }));
// The engine's own drop events need real geometry; the will-drop handler the layout hands the engine is captured and called directly.
const willDrop = vi.hoisted(() => ({ current: null as ((event: unknown) => void) | null }));
// Every `fromJSON` the layout sends the engine, with the height the engine had when it was called and the height the layout asks for.
// The live engine's id: the strip only takes a tab whose `viewId` is it.
const engineId = vi.hoisted(() => ({ current: '' }));
const loads = vi.hoisted(() => ({ current: [] as { engineHeight: number; layoutHeight: number }[] }));
vi.mock('dockview-react', async importOriginal => {
  const actual = await importOriginal<typeof import('dockview-react')>();
  return {
    ...actual,
    getPanelData: () => panelData.current,
    DockviewReact: (props: React.ComponentProps<typeof actual.DockviewReact>) => {
      willDrop.current = props.onWillDrop as typeof willDrop.current;
      const onReady: typeof props.onReady = event => {
        engineId.current = event.api.id;
        const load = event.api.fromJSON.bind(event.api);
        event.api.fromJSON = (data, options) => { loads.current.push({ engineHeight: event.api.height, layoutHeight: (data.grid as { height: number }).height }); load(data, options); };
        props.onReady(event);
      };
      return <actual.DockviewReact {...props} onReady={onReady} />;
    },
  };
});

const observer = installResizeObserver();
beforeAll(() => {
  observer.resize(900, 600);
  Element.prototype.setPointerCapture = vi.fn();
  // jsdom has no PointerEvent: without one the pointer coordinates of a fired event are lost.
  if (typeof window.PointerEvent === 'undefined') window.PointerEvent = class extends MouseEvent { pointerId = 1; } as unknown as typeof PointerEvent;
});
afterAll(() => { observer.restore(); });
afterEach(() => { cleanup(); panelData.current = null; loads.current = []; });

const IDS = ['a', 'b', 'c'];
const panels = IDS.map(id => ({ id, title: `패널 ${id}`, render: () => <div>content {id}</div> }));
const label = ({ dir, before, after }: { dir: string; before: string[]; after: string[] }) => `${dir}:${before.join(',')}|${after.join(',')}`;
const ready = async () => { await screen.findAllByRole('tab'); await waitFor(() => { expect(document.querySelectorAll('.dv-groupview').length).toBeGreaterThan(0); }); };

function mountRows(layout: DockNode, rows: Partial<DockRows> | null = {}) {
  const onHeightsChange = vi.fn();
  const full: DockRows | undefined = rows ? { heights: [300, 400], minimums: [200, 200], maximum: 700, onHeightsChange, ...rows } : undefined;
  const view = render(<I18nProvider><DockLayoutBase panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} rows={full} /></I18nProvider>);
  return { ...view, onHeightsChange };
}

describe('DockLayout without row props (the board and every other host)', () => {
  it('shows no row mode: no row wrapper, no drop strip, and the top-level separator steps 5% with a percent value', async () => {
    const onLayoutChange = vi.fn();
    render(<I18nProvider><DockLayout panels={panels} layout={column([50, 50], group(['a']), group(['c']))} onLayoutChange={onLayoutChange} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} /></I18nProvider>);
    await ready();
    expect(document.querySelector('[data-dock-rows]')).toBeNull();
    expect(document.querySelector('[data-dock-drop-below]')).toBeNull();
    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-valuenow', '50');
    separator.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onLayoutChange).toHaveBeenLastCalledWith(expect.objectContaining({ sizes: [55, 45] }));
  });
});

describe('DockLayout rows (workspace stack mode)', () => {
  it('is as tall as its rows and has one px separator per row, the last one under the last row', async () => {
    mountRows(column([40, 60], group(['a']), group(['c'])));
    await ready();
    const wrapper = document.querySelector<HTMLElement>('[data-dock-rows]')!;
    expect(wrapper.style.getPropertyValue('--dock-rows-height')).toBe('700px');
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(2);
    expect(separators.map(item => item.getAttribute('aria-valuenow'))).toEqual(['300', '400']);
    expect(separators.map(item => item.getAttribute('aria-valuemin'))).toEqual(['200', '200']);
    expect(separators.map(item => item.getAttribute('aria-valuemax'))).toEqual(['700', '700']);
    expect(separators.every(item => item.getAttribute('aria-orientation') === 'horizontal')).toBe(true);
    expect(separators.map(item => item.getAttribute('aria-label'))).toEqual(['column:a|c', 'column:c|']);
  });

  it.each<[string, string, number, number[]]>([
    ['ArrowDown grows the row 24px', '{ArrowDown}', 0, [324, 400]],
    ['ArrowUp shrinks it 24px', '{ArrowUp}', 0, [276, 400]],
    ['Home goes to the row minimum', '{Home}', 0, [200, 400]],
    ['End goes to the visible-area maximum', '{End}', 0, [700, 400]],
    ['the last boundary resizes the last row', '{ArrowDown}', 1, [300, 424]],
    ['ArrowUp never goes under the minimum', '{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}', 0, [276, 400]],
  ])('%s', async (_name, keys, index, expected) => {
    const { onHeightsChange } = mountRows(column([40, 60], group(['a']), group(['c'])));
    await ready();
    screen.getAllByRole('separator')[index]!.focus();
    await userEvent.keyboard(keys);
    expect(onHeightsChange).toHaveBeenCalled();
    expect(onHeightsChange.mock.calls[0]![0]).toEqual(expected);
  });

  it('a row taller than the maximum keeps its value as the maximum and can still shrink', async () => {
    const { onHeightsChange } = mountRows(column([40, 60], group(['a']), group(['c'])), { heights: [900, 400] });
    await ready();
    const separator = screen.getAllByRole('separator')[0]!;
    expect(separator).toHaveAttribute('aria-valuemax', '900');
    separator.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onHeightsChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowUp}');
    expect(onHeightsChange.mock.calls[0]![0]).toEqual([876, 400]);
  });

  it('pointer drag resizes only the row above, sample by sample, and stops on release', async () => {
    const { onHeightsChange } = mountRows(column([40, 60], group(['a']), group(['c'])));
    await ready();
    const separator = screen.getAllByRole('separator')[0]!;
    const at = (clientY: number) => ({ clientY, button: 0, pointerId: 1 });
    fireEvent.pointerDown(separator, at(100));
    fireEvent.pointerMove(separator, at(130));
    fireEvent.pointerMove(separator, at(-50));
    expect(onHeightsChange.mock.calls.map(call => call[0])).toEqual([[330, 400], [200, 400]]);
    fireEvent.pointerUp(separator, at(-50));
    fireEvent.pointerMove(separator, at(300));
    expect(onHeightsChange).toHaveBeenCalledTimes(2);
  });

  it('a single-group layout has its one row separator; nested boundaries inside a row stay percent', async () => {
    const single = mountRows(group(['a', 'b', 'c']), { heights: [500], minimums: [200] });
    await ready();
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '500');
    single.unmount();
    mountRows(column([50, 50], row([50, 50], group(['a']), group(['b'])), group(['c'])));
    await ready();
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(3);
    const inside = separators.find(item => item.getAttribute('aria-orientation') === 'vertical')!;
    expect(inside).toHaveAttribute('aria-valuenow', '50');
    expect(inside.getAttribute('aria-valuemax')).toBe('90');
  });

  it('the strip under the last row appears only with a drop handler, and refuses a foreign tab, a whole group and a drag that is not a panel', async () => {
    const onDropBelow = vi.fn();
    const without = mountRows(column([40, 60], group(['a']), group(['c'])));
    await ready();
    expect(document.querySelector('[data-dock-drop-below]')).toBeNull();
    without.unmount();
    mountRows(column([40, 60], group(['a']), group(['c'])), { onDropBelow, dropBelowLabel: '여기에 놓으면 아래에 새 줄' });
    await ready();
    const strip = document.querySelector<HTMLElement>('[data-dock-drop-below]')!;
    expect(strip).toHaveTextContent('여기에 놓으면 아래에 새 줄');
    for (const data of [null, { viewId: 'another-layout', groupId: 'g', panelId: 'a' }, { viewId: 'another-layout', groupId: 'g', panelId: null }]) {
      panelData.current = data;
      act(() => { fireEvent.dragOver(strip); fireEvent.drop(strip); });
    }
    expect(onDropBelow).not.toHaveBeenCalled();
  });

  it('is drawn gap-inclusive: the box adds the engine gap between top-level rows, so each row keeps its own px (--dock-rows-height stays the px sum)', async () => {
    mountRows(column([40, 60], group(['a']), group(['c'])));
    await ready();
    const wrapper = document.querySelector<HTMLElement>('[data-dock-rows]')!;
    expect(wrapper.style.getPropertyValue('--dock-rows-height')).toBe('700px');
    expect(wrapper.style.getPropertyValue('--dock-rows-box')).toBe('706px');
  });

  it('switches off the sashes of its own grid only: a layout nested in a panel keeps its pointer sashes', async () => {
    const selector = /^(\[data-dock-rows-grid\][^{]*)\{[^}]*pointer-events: none/m.exec(readFileSync(resolve(process.cwd(), 'src/dock/dock.css'), 'utf8'))![1]!.trim();
    const nested = [{ id: 'x', title: '안쪽 x', render: () => <div>x</div> }, { id: 'y', title: '안쪽 y', render: () => <div>y</div> }];
    const outer = [{ id: 'a', title: '패널 a', render: () => <DockLayout panels={nested} layout={column([50, 50], group(['x']), group(['y']))} onLayoutChange={vi.fn()} separatorLabel={label} label="안쪽" minPanelSize={{ width: 20, height: 20 }} /> }, panels[1]!];
    render(<I18nProvider><DockLayoutBase panels={outer} layout={column([50, 50], group(['a']), group(['b']))} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} rows={{ heights: [300, 400], minimums: [200, 200], maximum: 700, onHeightsChange: vi.fn() }} /></I18nProvider>);
    await waitFor(() => { expect(document.querySelectorAll('[data-dock-rows] [data-dock-panel="a"] .dv-groupview').length).toBeGreaterThan(0); });
    await waitFor(() => { expect(document.querySelector('[data-dock-rows-grid]')).not.toBeNull(); });
    const sashes = Array.from(document.querySelectorAll<HTMLElement>('.dv-sash'));
    const inner = sashes.filter(sash => sash.closest('[data-dock-panel="a"]'));
    const own = sashes.filter(sash => !sash.closest('[data-dock-panel]'));
    expect(own.length).toBeGreaterThan(0);
    expect(inner.length).toBeGreaterThan(0);
    expect(own.some(sash => sash.matches(selector))).toBe(true);
    expect(inner.some(sash => sash.matches(selector))).toBe(false);
  });

  it('consumes every drag over the strip, refused ones too: an ancestor never sees it, and a refused drag shows no accept indicator', async () => {
    const onDropBelow = vi.fn();
    mountRows(column([40, 60], group(['a']), group(['c'])), { onDropBelow, dropBelowLabel: '여기에 놓으면 아래에 새 줄' });
    await ready();
    const strip = document.querySelector<HTMLElement>('[data-dock-drop-below]')!;
    // Native listeners on an ancestor, like the board's own dock: they see an event only if the strip let it bubble.
    const seen = vi.fn();
    for (const type of ['dragenter', 'dragover', 'drop']) document.body.addEventListener(type, seen);
    try {
      for (const data of [null, { viewId: 'another-layout', groupId: 'g', panelId: 'a' }]) {
        panelData.current = data;
        const events = [new Event('dragenter', { bubbles: true, cancelable: true }), new Event('dragover', { bubbles: true, cancelable: true }), new Event('drop', { bubbles: true, cancelable: true })];
        act(() => { events.forEach(event => strip.dispatchEvent(event)); });
        expect(events.map(event => event.defaultPrevented)).toEqual([false, false, false]);
        expect(strip.className).not.toContain('border-accent-primary');
      }
    } finally {
      for (const type of ['dragenter', 'dragover', 'drop']) document.body.removeEventListener(type, seen);
    }
    expect(seen).not.toHaveBeenCalled();
    expect(onDropBelow).not.toHaveBeenCalled();
  });

  it('lowers the strip highlight when the drag is cancelled (dragend on the dragged tab) and reports no layout (#1158)', async () => {
    const onDropBelow = vi.fn();
    const onLayoutChange = vi.fn();
    render(<I18nProvider><DockLayoutBase panels={panels} layout={column([40, 60], group(['a']), group(['c']))} onLayoutChange={onLayoutChange} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }}
      rows={{ heights: [300, 400], minimums: [200, 200], maximum: 700, onHeightsChange: vi.fn(), onDropBelow, dropBelowLabel: '여기에 놓으면 아래에 새 줄' }} /></I18nProvider>);
    await ready();
    const strip = document.querySelector<HTMLElement>('[data-dock-drop-below]')!;
    panelData.current = { viewId: engineId.current, groupId: 'g', panelId: 'a' };
    act(() => { strip.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })); });
    expect(strip.className).toContain('border-accent-primary');
    // Escape: `dragend` fires on the dragged tab, far from the strip, and no `drop` follows.
    act(() => { document.querySelector('[role="tab"]')!.dispatchEvent(new Event('dragend', { bubbles: true })); });
    expect(strip.className).not.toContain('border-accent-primary');
    expect(onDropBelow).not.toHaveBeenCalled();
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  it('reports the dropped tab before the layout, null for a whole group, and nothing for a refused drag', async () => {
    const onPanelDrop = vi.fn();
    mountRows(column([40, 60], group(['a']), group(['c'])), { onPanelDrop });
    await ready();
    const drop = (data: typeof panelData.current) => {
      const event = { getData: () => data, api: { id: 'own' }, defaultPrevented: false, preventDefault: vi.fn(() => { event.defaultPrevented = true; }) };
      willDrop.current!(event);
      return event;
    };
    expect(willDrop.current).not.toBeNull();
    drop({ viewId: 'own', groupId: 'g', panelId: 'a' });
    expect(onPanelDrop).toHaveBeenLastCalledWith('a');
    drop({ viewId: 'own', groupId: 'g', panelId: null });
    expect(onPanelDrop).toHaveBeenLastCalledWith(null);
    onPanelDrop.mockClear();
    expect(drop({ viewId: 'another-layout', groupId: 'g', panelId: 'a' }).preventDefault).toHaveBeenCalled();
    drop(null);
    expect(onPanelDrop).not.toHaveBeenCalled();
  });

  it('puts the engine on the new total height before it loads the layout, so the load does not rescale the rows to the old height', async () => {
    const view = mountRows(column([40, 60], group(['a']), group(['c'])));
    await ready();
    loads.current = [];
    const onHeightsChange = vi.fn();
    view.rerender(<I18nProvider><DockLayoutBase panels={panels} layout={column([45, 55], group(['a']), group(['c']))} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} rows={{ heights: [330, 400], minimums: [200, 200], maximum: 700, onHeightsChange }} />
    </I18nProvider>);
    await waitFor(() => { expect(loads.current.length).toBeGreaterThan(0); });
    // The engine's forced relayout at the end of `fromJSON` uses the height it had on entry: that must already be the layout's height.
    expect(loads.current.every(load => load.engineHeight === load.layoutHeight)).toBe(true);
    expect(loads.current.at(-1)!.layoutHeight).toBeGreaterThan(730);
  });
});

describe('DockLayout rows: maximize, tab drag and edge scroll (#701, ADR-0130)', () => {
  const layout = column([40, 60], group(['a']), group(['c']));
  const rowsProps = (extra: Partial<DockRows> = {}): DockRows => ({ heights: [300, 400], minimums: [200, 200], maximum: 700, onHeightsChange: vi.fn(), onDropBelow: vi.fn(), dropBelowLabel: '여기에 놓으면 아래에 새 줄', ...extra });
  const mountBase = (rows: DockRows, maximizedPanelId: string | null = null) => render(<I18nProvider><DockLayoutBase panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} rows={rows} maximizedPanelId={maximizedPanelId} /></I18nProvider>);

  it('the root clips instead of hiding in row mode (no scroll container, so the strip can stick to the page), and keeps hiding otherwise', async () => {
    mountBase(rowsProps());
    await ready();
    expect(document.querySelector('[data-dock-layout]')).toHaveClass('overflow-clip');
    expect(document.querySelector('[data-dock-layout]')).not.toHaveClass('overflow-hidden');
    cleanup();
    render(<I18nProvider><DockLayout panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} /></I18nProvider>);
    await ready();
    expect(document.querySelector('[data-dock-layout]')).toHaveClass('overflow-hidden');
  });

  it('the strip sticks to the bottom of the visible area only while a tab drag runs, from dragstart to dragend or drop', async () => {
    mountBase(rowsProps());
    await ready();
    const strip = () => document.querySelector<HTMLElement>('[data-dock-drop-below]')!;
    expect(strip().className).not.toContain('sticky');
    act(() => { document.querySelector('[role="tab"]')!.dispatchEvent(new Event('dragstart', { bubbles: true })); });
    expect(strip().className).toContain('sticky bottom-0 z-20');
    act(() => { document.querySelector('[role="tab"]')!.dispatchEvent(new Event('dragend', { bubbles: true })); });
    expect(strip().className).not.toContain('sticky');
    act(() => { document.querySelector('[role="tab"]')!.dispatchEvent(new Event('dragstart', { bubbles: true })); });
    expect(strip().className).toContain('sticky');
    act(() => { window.dispatchEvent(new Event('drop')); });
    expect(strip().className).not.toContain('sticky');
  });

  it('while a panel is maximized the strip is gone and the box takes maximizedHeight; rows keep their px', async () => {
    const view = mountBase(rowsProps({ maximizedHeight: 520 }));
    await ready();
    const wrapper = () => document.querySelector<HTMLElement>('[data-dock-rows]')!;
    expect(wrapper().style.getPropertyValue('--dock-rows-box')).toBe('706px');
    view.rerender(<I18nProvider><DockLayoutBase panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} rows={rowsProps({ maximizedHeight: 520 })} maximizedPanelId="a" /></I18nProvider>);
    await waitFor(() => { expect(document.querySelector('[data-dock-drop-below]')).toBeNull(); });
    expect(wrapper().style.getPropertyValue('--dock-rows-box')).toBe('520px');
    expect(wrapper().style.getPropertyValue('--dock-rows-height')).toBe('700px');
    view.rerender(<I18nProvider><DockLayoutBase panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} rows={rowsProps({ maximizedHeight: 520 })} maximizedPanelId={null} /></I18nProvider>);
    await waitFor(() => { expect(document.querySelector('[data-dock-drop-below]')).not.toBeNull(); });
    expect(wrapper().style.getPropertyValue('--dock-rows-box')).toBe('706px');
  });

  describe('row separator drag near the edge of the visible area', () => {
    // Fake timers that follow the real clock keep `waitFor` working; the "does not scroll" checks step the edge-scroll frames through virtual time.
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => { vi.advanceTimersByTime(ms); } });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
    const mountScroll = (onHeightsChange: DockRows['onHeightsChange']) => {
      const view = render(<I18nProvider><main data-testid="scroll" style={{ overflowY: 'auto' }}><DockLayoutBase panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="행 배치" minPanelSize={{ width: 20, height: 20 }} rows={rowsProps({ onHeightsChange, maximum: 900 })} /></main></I18nProvider>);
      const main = screen.getByTestId('scroll');
      Object.defineProperty(main, 'clientHeight', { configurable: true, value: 800 });
      vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 800, height: 800 } as DOMRect);
      return { view, main };
    };
    const at = (clientY: number) => ({ clientY, button: 0, pointerId: 1 });

    it('scrolls the page while the pointer rests in the bottom 48px, the row keeps following it, and everything stops on release', async () => {
      const onHeightsChange = vi.fn();
      const { main } = mountScroll(onHeightsChange);
      await ready();
      const separator = screen.getAllByRole('separator')[0]!;
      fireEvent.pointerDown(separator, at(500));
      fireEvent.pointerMove(separator, at(790));
      await waitFor(() => { expect(main.scrollTop).toBeGreaterThan(40); });
      const heights = onHeightsChange.mock.calls.map(call => (call[0] as number[])[0]!);
      expect(heights.at(-1)!).toBeGreaterThan(300 + (790 - 500));
      // The untouched row never changes.
      expect(onHeightsChange.mock.calls.every(call => (call[0] as number[])[1] === 400)).toBe(true);
      fireEvent.pointerUp(separator, at(790));
      const stopped = main.scrollTop;
      await act(async () => { await vi.advanceTimersByTimeAsync(80); });
      expect(main.scrollTop).toBe(stopped);
    });

    it('does not scroll outside the edge zone, and stops when the row has reached its maximum', async () => {
      const onHeightsChange = vi.fn();
      const { main } = mountScroll(onHeightsChange);
      await ready();
      const separator = screen.getAllByRole('separator')[0]!;
      fireEvent.pointerDown(separator, at(400));
      fireEvent.pointerMove(separator, at(450));
      await act(async () => { await vi.advanceTimersByTimeAsync(80); });
      expect(main.scrollTop).toBe(0);
      fireEvent.pointerMove(separator, at(795));
      await waitFor(() => { expect(Math.max(...onHeightsChange.mock.calls.map(call => (call[0] as number[])[0]!))).toBe(900); });
      const stopped = main.scrollTop;
      await act(async () => { await vi.advanceTimersByTimeAsync(80); });
      expect(main.scrollTop).toBe(stopped);
      fireEvent.pointerUp(separator, at(795));
    });

    it('lost pointer capture ends the drag', async () => {
      const { main } = mountScroll(vi.fn());
      await ready();
      const separator = screen.getAllByRole('separator')[0]!;
      fireEvent.pointerDown(separator, at(500));
      fireEvent.lostPointerCapture(separator);
      fireEvent.pointerMove(separator, at(795));
      await act(async () => { await vi.advanceTimersByTimeAsync(80); });
      expect(main.scrollTop).toBe(0);
    });
  });
});
