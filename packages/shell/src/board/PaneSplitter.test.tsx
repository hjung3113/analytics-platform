import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaneSplitter } from './PaneSplitter';

afterEach(cleanup);
it('uses effective bounds for arrows/Home/End and pointer capture drag, cancelling lost capture', () => {
  const change = vi.fn();
  render(<PaneSplitter label="columns" controls="pane" value={50} bounds={{ min: 34, max: 66 }} extent={1000} placement={{ left: 0, top: 0, width: 12, height: 600 }} onChange={change} />);
  const split = screen.getByRole('separator');
  fireEvent.keyDown(split, { key: 'ArrowRight' }); expect(change).toHaveBeenLastCalledWith([55, 45], true);
  fireEvent.keyDown(split, { key: 'Home' }); expect(change).toHaveBeenLastCalledWith([34, 66], true);
  fireEvent.keyDown(split, { key: 'End' }); expect(change).toHaveBeenLastCalledWith([66, 34], true);
  split.setPointerCapture = vi.fn(); split.hasPointerCapture = () => true; split.releasePointerCapture = vi.fn();
  const pointer = (name: string, x: number) => {
    const event = new MouseEvent(name, { bubbles: true, button: 0, clientX: x });
    Object.defineProperty(event, 'pointerId', { value: 7 }); fireEvent(split, event);
  };
  pointer('pointerdown', 100); expect(split.setPointerCapture).toHaveBeenCalledWith(7);
  pointer('pointermove', 200); expect(change).toHaveBeenLastCalledWith([60, 40], false);
  change.mockClear();
  pointer('pointerup', 200); expect(split.releasePointerCapture).toHaveBeenCalledWith(7);
  // The drag is saved once, at the end (#823): the moves only resize.
  expect(change.mock.calls).toEqual([[[60, 40], true]]);
  change.mockClear(); pointer('pointermove', 300); expect(change).not.toHaveBeenCalled();
  pointer('pointerdown', 100); fireEvent.lostPointerCapture(split); change.mockClear();
  pointer('pointermove', 300); expect(change).not.toHaveBeenCalled();
});

it('a drag that loses its capture still saves where it stopped, and a press without a move saves nothing (#823)', () => {
  const change = vi.fn();
  render(<PaneSplitter label="columns" controls="pane" value={50} bounds={{ min: 34, max: 66 }} extent={1000} placement={{ left: 0, top: 0, width: 12, height: 600 }} onChange={change} />);
  const split = screen.getByRole('separator');
  split.setPointerCapture = vi.fn(); split.hasPointerCapture = () => true; split.releasePointerCapture = vi.fn();
  const pointer = (name: string, x: number) => {
    const event = new MouseEvent(name, { bubbles: true, button: 0, clientX: x });
    Object.defineProperty(event, 'pointerId', { value: 7 }); fireEvent(split, event);
  };
  pointer('pointerdown', 100); pointer('pointerup', 100);
  expect(change).not.toHaveBeenCalled();
  pointer('pointerdown', 100); pointer('pointermove', 150); change.mockClear();
  fireEvent.lostPointerCapture(split);
  expect(change.mock.calls).toEqual([[[55, 45], true]]);
});
