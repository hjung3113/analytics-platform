// #2494: a popover opened inside a modal Dialog/Sheet must scroll with the wheel. Radix attaches the modal's scroll
// lock (react-remove-scroll) to the overlay and the content's DOM only; the popover is portaled to <body>, so the
// lock's document listener treated it as outside and cancelled every wheel over it.
import { cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog.js';
import { Popover, PopoverContent, PopoverTrigger } from '../popover.js';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../sheet.js';

afterEach(cleanup);

function scrollable(element: HTMLElement) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 800 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 300 });
  element.style.overflowY = 'auto';
}

const popover = (
  <Popover open>
    <PopoverTrigger>Open</PopoverTrigger>
    <PopoverContent data-testid="pop" className="max-h-72 overflow-y-auto">
      <p data-testid="row">row</p>
    </PopoverContent>
  </Popover>
);
function wheelOverRow() {
  scrollable(screen.getByTestId('pop'));
  const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
  screen.getByTestId('row').dispatchEvent(wheel);
  return wheel;
}

it('a wheel over an overflowing popover inside a modal dialog is not cancelled', () => {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Outer</DialogTitle>
        <DialogDescription>Popover inside</DialogDescription>
        {popover}
      </DialogContent>
    </Dialog>,
  );
  expect(wheelOverRow().defaultPrevented).toBe(false);
});

it('a wheel over an overflowing popover inside a sheet is not cancelled', () => {
  render(
    <Sheet open>
      <SheetContent>
        <SheetTitle>Outer</SheetTitle>
        <SheetDescription>Popover inside</SheetDescription>
        {popover}
      </SheetContent>
    </Sheet>,
  );
  expect(wheelOverRow().defaultPrevented).toBe(false);
});

it('outside a modal the wheel still bubbles to the document', () => {
  const seen = vi.fn();
  document.addEventListener('wheel', seen);
  render(popover);
  wheelOverRow();
  document.removeEventListener('wheel', seen);
  expect(seen).toHaveBeenCalledTimes(1);
});

// The scroll pass-through wraps the forwarded ref; it must keep React 19 ref semantics for consumers.
function OpenPopover({ contentRef }: { contentRef: React.Ref<HTMLDivElement> }) {
  return (
    <Popover open>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent ref={contentRef}>body</PopoverContent>
    </Popover>
  );
}

it('a forwarded callback ref that returns a cleanup gets the cleanup, not null, on unmount', () => {
  const dispose = vi.fn();
  const calls: Array<HTMLDivElement | null> = [];
  const ref = (node: HTMLDivElement | null) => {
    calls.push(node);
    return dispose;
  };
  const { unmount } = render(<OpenPopover contentRef={ref} />);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toBeInstanceOf(HTMLDivElement);
  unmount();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(1);
});

it('a plain callback ref gets null and an object ref is cleared on unmount', () => {
  const callback = vi.fn();
  const object = React.createRef<HTMLDivElement>();
  const first = render(<OpenPopover contentRef={callback} />);
  expect(callback).toHaveBeenLastCalledWith(expect.any(HTMLDivElement));
  first.unmount();
  expect(callback).toHaveBeenLastCalledWith(null);
  const second = render(<OpenPopover contentRef={object} />);
  expect(object.current).toBeInstanceOf(HTMLDivElement);
  second.unmount();
  expect(object.current).toBeNull();
});
