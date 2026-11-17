// #2494: a popover opened inside a modal Dialog/Sheet must scroll with the wheel. Radix attaches the modal's scroll
// lock (react-remove-scroll) to the overlay and the content's DOM only; the popover is portaled to <body>, so the
// lock's document listener treated it as outside and cancelled every wheel over it.
import { cleanup, render, screen } from '@testing-library/react';
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
