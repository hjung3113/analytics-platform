import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenuItem } from '@ap/ui';
import { FloatingWindow, type FloatingWindowHandle, type FloatingWindowLabels, type FloatingWindowMode } from '../FloatingWindow';
import type { FloatingArea, FloatingGeometry } from '../geometry';

// jsdom 26 has no PointerEvent; without it fireEvent drops clientX/clientY.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; }
  }
  Object.defineProperty(globalThis, 'PointerEvent', { value: PointerEventPolyfill, configurable: true });
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

const area: FloatingArea = { left: 10, top: 20, width: 1200, height: 800 };
const start: FloatingGeometry = { x: 100, y: 80, width: 700, height: 500 };
const labels: FloatingWindowLabels = {
  titleBar: 'bar', menu: 'win-menu', positionGroup: 'Position', sizeGroup: 'Size',
  place: { 'top-left': 'TL', 'top-right': 'TR', 'bottom-left': 'BL', 'bottom-right': 'BR', center: 'Mid' },
  size: { small: 'S', medium: 'M', large: 'L' },
  handle: { n: 'h-n', ne: 'h-ne', e: 'h-e', se: 'h-se', s: 'h-s', sw: 'h-sw', w: 'h-w', nw: 'h-nw' },
  moved: (x, y) => `moved ${String(x)},${String(y)}`, resized: (w, h) => `resized ${String(w)}x${String(h)}`,
};

function Harness({ onChange, mode = 'window', initial = start, areaIn = area, winRef }: {
  onChange?: (g: FloatingGeometry) => void; mode?: FloatingWindowMode; initial?: FloatingGeometry; areaIn?: FloatingArea; winRef?: React.Ref<FloatingWindowHandle>;
}) {
  const [geometry, setGeometry] = useState(initial);
  return (
    <>
      <button type="button">before</button>
      <FloatingWindow
        ref={winRef} area={areaIn} geometry={geometry} mode={mode} title="Board" titleId="t" labels={labels}
        onGeometryChange={(g) => { setGeometry(g); onChange?.(g); }}
        actions={<button type="button">close</button>} menuExtra={<DropdownMenuItem>extra</DropdownMenuItem>}
      >
        <button type="button">inside</button>
      </FloatingWindow>
      <button type="button">after</button>
    </>
  );
}
const win = () => screen.getByRole('group', { name: 'Board' });
const bar = () => screen.getByRole('group', { name: 'bar' });

describe('FloatingWindow keys (WCAG 2.5.7 path)', () => {
  it('is a named group, not a dialog, placed in area coordinates', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(win()).toHaveStyle({ '--fw-left': '110px', '--fw-top': '100px', '--fw-width': '700px', '--fw-height': '500px' });
    expect(win().className).toContain('z-40');
    expect(win().className).toContain('isolate');
    expect(win().className).not.toContain('fixed');
  });

  it.each([
    ['{ArrowRight}', { x: 108 }], ['{ArrowLeft}', { x: 92 }], ['{ArrowDown}', { y: 88 }], ['{ArrowUp}', { y: 72 }],
    ['{Shift>}{ArrowRight}{/Shift}', { x: 148 }], ['{Alt>}{ArrowRight}{/Alt}', { width: 708 }], ['{Alt>}{Shift>}{ArrowDown}{/Shift}{/Alt}', { height: 548 }],
  ])('%s', async (keys, delta) => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    bar().focus();
    await userEvent.keyboard(keys);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...start, ...delta });
  });

  it('clamps at the area edge and does not report a no-op', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={{ ...start, x: 0 }} />);
    bar().focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores arrows that come from a button inside the title bar', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole('button', { name: 'close' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes focusTitleBar()', () => {
    const handle = { current: null as FloatingWindowHandle | null };
    render(<Harness winRef={handle} />);
    act(() => { handle.current?.focusTitleBar(); });
    expect(bar()).toHaveFocus();
  });
});

describe('FloatingWindow menu', () => {
  it('has eight items with the same results as the pure functions', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const expected: [string, FloatingGeometry][] = [
      ['TL', { ...start, x: 0, y: 0 }], ['TR', { ...start, x: 500, y: 0 }], ['BL', { ...start, x: 0, y: 300 }], ['BR', { ...start, x: 500, y: 300 }], ['Mid', { ...start, x: 250, y: 150 }],
      ['S', { x: 100, y: 80, width: 640, height: 440 }], ['M', { x: 100, y: 80, width: 720, height: 560 }], ['L', { x: 100, y: 80, width: 1020, height: 720 }],
    ];
    for (const [name, geometry] of expected) {
      onChange.mockClear();
      await userEvent.click(screen.getByRole('button', { name: 'win-menu' }));
      expect(screen.getAllByRole('menuitem')).toHaveLength(9);
      await userEvent.click(screen.getByRole('menuitem', { name }));
      expect(onChange).toHaveBeenLastCalledWith(geometry);
      onChange.mockClear();
      // back to the start so each item is measured from the same geometry
      await userEvent.click(screen.getByRole('button', { name: 'win-menu' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'M' }));
      cleanup();
      render(<Harness onChange={onChange} />);
    }
  });

  it('is non-modal: the page behind keeps pointer events and the window has no backdrop', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'win-menu' }));
    expect(screen.getByRole('menuitem', { name: 'TL' })).toBeInTheDocument();
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(screen.getByRole('menuitem', { name: 'extra' })).toBeInTheDocument();
  });
});

describe('FloatingWindow handles and pointer', () => {
  it('has eight named resize handles', () => {
    render(<Harness />);
    const handles = [...win().querySelectorAll('[data-resize]')];
    expect(handles.map(h => h.getAttribute('data-resize')).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    expect(handles.map(h => h.getAttribute('title')).sort()).toEqual(['h-e', 'h-n', 'h-ne', 'h-nw', 'h-s', 'h-se', 'h-sw', 'h-w']);
    expect(handles.every(h => h.className.includes('touch-none'))).toBe(true);
    expect(bar().className).toContain('touch-none');
  });

  it('reports a drag once on release, drawing the live position meanwhile', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.pointerDown(bar(), { button: 0, clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 340, clientY: 310, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 360, clientY: 320, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
    expect(win()).toHaveStyle({ '--fw-left': '170px', '--fw-top': '120px' });
    fireEvent.pointerUp(bar(), { clientX: 360, clientY: 320, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...start, x: 160, y: 100 });
  });

  it('clamps a drag past the area and a handle resize at minSize', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.pointerDown(bar(), { button: 0, clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: -9000, clientY: -9000, pointerId: 1 });
    fireEvent.pointerUp(bar(), { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith({ ...start, x: 0, y: 0 });
    const se = win().querySelector('[data-resize="se"]')!;
    fireEvent.pointerDown(se, { button: 0, clientX: 500, clientY: 500, pointerId: 2 });
    fireEvent.pointerMove(se, { clientX: -5000, clientY: -5000, pointerId: 2 });
    fireEvent.pointerUp(se, { pointerId: 2 });
    expect(onChange).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 640, height: 420 });
  });

  it('does not report a cancelled gesture and a title-bar button press does not start a drag', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.pointerDown(bar(), { button: 0, clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 340, clientY: 340, pointerId: 1 });
    fireEvent.pointerCancel(bar(), { pointerId: 1 });
    const close = screen.getByRole('button', { name: 'close' });
    fireEvent.pointerDown(close, { button: 0, clientX: 300, clientY: 300, pointerId: 3 });
    fireEvent.pointerMove(bar(), { clientX: 400, clientY: 400, pointerId: 3 });
    fireEvent.pointerUp(bar(), { pointerId: 3 });
    expect(onChange).not.toHaveBeenCalled();
    expect(win()).toHaveStyle({ '--fw-left': '110px', '--fw-top': '100px' });
  });
});

describe('FloatingWindow non-modal behaviour', () => {
  it('traps no focus: Tab leaves the window', async () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'inside' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    for (let i = 0; i < 5; i++) await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus();
  });

  it('draws no backdrop and closes nothing on an outside click', async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'before' }));
    expect(win()).toBeInTheDocument();
    expect(container.querySelector('.fixed, .inset-0')).toBeNull();
  });
});

describe('FloatingWindow announcements', () => {
  it('announces the result once, debounced across key repeats', async () => {
    vi.useFakeTimers();
    const { container } = render(<Harness />);
    const live = container.querySelector('[aria-live="polite"]')!;
    bar().focus();
    fireEvent.keyDown(bar(), { key: 'ArrowRight' });
    fireEvent.keyDown(bar(), { key: 'ArrowRight' });
    fireEvent.keyDown(bar(), { key: 'ArrowRight', altKey: true });
    expect(live).toHaveTextContent('');
    act(() => { vi.advanceTimersByTime(400); });
    expect(live).toHaveTextContent('resized 708x500');
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    act(() => { vi.advanceTimersByTime(400); });
    expect(live).toHaveTextContent('moved 116,88');
  });
});

describe('FloatingWindow modes', () => {
  it('never remounts children across window -> fill -> off -> window', () => {
    const mounts = vi.fn();
    const Probe = () => { useState(() => { mounts(); return 0; }); return <span>probe</span>; };
    const view = (mode: FloatingWindowMode) => (
      <FloatingWindow area={area} geometry={start} mode={mode} title="Board" titleId="t" labels={labels} onGeometryChange={() => undefined}><Probe /></FloatingWindow>
    );
    const { rerender } = render(view('window'));
    for (const mode of ['fill', 'off', 'window'] as const) rerender(view(mode));
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('fill covers the whole area without frame chrome; off adds no box', () => {
    const { rerender, container } = render(<Harness mode="fill" />);
    expect(container.querySelector('[data-floating-mode="fill"]')).toHaveStyle({ '--fw-left': '10px', '--fw-top': '20px', '--fw-width': '1200px', '--fw-height': '800px' });
    expect(container.querySelectorAll('[data-resize]')).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'bar' })).toBeNull();
    rerender(<Harness mode="off" />);
    expect(container.querySelector('[data-floating-mode="off"]')?.className).toBe('contents');
  });

  it('shows the clamped geometry and restores the stored one on expansion, without ever calling onGeometryChange', () => {
    const onChange = vi.fn();
    const small: FloatingArea = { left: 0, top: 0, width: 700, height: 450 };
    const { rerender } = render(<Harness onChange={onChange} />);
    expect(win()).toHaveStyle({ '--fw-left': '110px', '--fw-top': '100px', '--fw-width': '700px', '--fw-height': '500px' });
    rerender(<Harness onChange={onChange} areaIn={small} />);
    expect(win()).toHaveStyle({ '--fw-left': '0px', '--fw-top': '0px', '--fw-width': '700px', '--fw-height': '450px' });
    rerender(<Harness onChange={onChange} />);
    expect(win()).toHaveStyle({ '--fw-left': '110px', '--fw-top': '100px', '--fw-width': '700px', '--fw-height': '500px' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FloatingWindow gesture lifecycle', () => {
  const Probe = () => { useState(() => { mounts(); return 0; }); return <span>probe</span>; };
  const mounts = vi.fn();
  const view = (mode: FloatingWindowMode, geometry: FloatingGeometry, a: FloatingArea = area, onChange: (g: FloatingGeometry) => void = () => undefined) => (
    <FloatingWindow area={a} geometry={geometry} mode={mode} title="Board" titleId="t" labels={labels} onGeometryChange={onChange}><Probe /></FloatingWindow>
  );

  it('drops a drag interrupted by fill/off: controlled geometry wins and a bare move does nothing', () => {
    mounts.mockClear();
    const onChange = vi.fn();
    const { rerender } = render(view('window', start, area, onChange));
    fireEvent.pointerDown(bar(), { button: 0, clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 400, clientY: 400, pointerId: 1 });
    expect(win()).toHaveStyle({ '--fw-left': '210px' });
    rerender(view('fill', start, area, onChange));
    rerender(view('window', { ...start, x: 50 }, area, onChange));
    expect(win()).toHaveStyle({ '--fw-left': '60px', '--fw-top': '100px' });
    fireEvent.pointerMove(bar(), { clientX: 700, clientY: 700, pointerId: 1 });
    fireEvent.pointerUp(bar(), { pointerId: 1 });
    expect(win()).toHaveStyle({ '--fw-left': '60px', '--fw-top': '100px' });
    expect(onChange).not.toHaveBeenCalled();
    expect(mounts).toHaveBeenCalledTimes(1);
  });

  it('cancels on lost pointer capture and ignores other pointers', () => {
    const onChange = vi.fn();
    render(view('window', start, area, onChange));
    fireEvent.pointerDown(bar(), { button: 0, clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 500, clientY: 500, pointerId: 2 });
    fireEvent.pointerUp(bar(), { pointerId: 2 });
    expect(win()).toHaveStyle({ '--fw-left': '110px' });
    fireEvent.pointerMove(bar(), { clientX: 340, clientY: 300, pointerId: 1 });
    expect(win()).toHaveStyle({ '--fw-left': '150px' });
    fireEvent(bar(), new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }));
    expect(win()).toHaveStyle({ '--fw-left': '110px' });
    fireEvent.pointerMove(bar(), { clientX: 600, clientY: 600, pointerId: 1 });
    expect(win()).toHaveStyle({ '--fw-left': '110px' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps the committed resize to the area at pointer-up when the area shrank mid-gesture', () => {
    const onChange = vi.fn();
    const small: FloatingArea = { left: 0, top: 0, width: 500, height: 300 };
    const { rerender } = render(view('window', start, area, onChange));
    const se = () => win().querySelector('[data-resize="se"]')!;
    fireEvent.pointerDown(se(), { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(se(), { clientX: 520, clientY: 500, pointerId: 1 });
    // Released right after the bounds change: only the final clamp can bring the committed geometry back inside the area.
    rerender(view('window', start, small, onChange));
    fireEvent.pointerUp(se(), { pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ x: 0, y: 0, width: 500, height: 300 });
  });
});
