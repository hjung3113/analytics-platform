import { useLayoutEffect, useState, type ComponentType } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixAlert from '@radix-ui/react-dialog';
import * as RadixPopover from '@radix-ui/react-popover';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import * as RadixSelect from '@radix-ui/react-select';
import { AlertDialog, Dialog, DropdownMenu, Popover, Select, Sheet } from '../index';

afterEach(cleanup);
type OpenProps = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode };
const cases = [
  { name: 'Dialog', Wrapped: Dialog, Raw: RadixDialog.Root, Trigger: RadixDialog.Trigger, Content: RadixDialog.Content, Portal: RadixDialog.Portal, Close: RadixDialog.Close },
  { name: 'Sheet', Wrapped: Sheet, Raw: RadixDialog.Root, Trigger: RadixDialog.Trigger, Content: RadixDialog.Content, Portal: RadixDialog.Portal, Close: RadixDialog.Close },
  { name: 'AlertDialog', Wrapped: AlertDialog, Raw: RadixAlert.Root, Trigger: RadixAlert.Trigger, Content: RadixAlert.Content, Portal: RadixAlert.Portal, Close: RadixAlert.Close },
  { name: 'Popover', Wrapped: Popover, Raw: RadixPopover.Root, Trigger: RadixPopover.Trigger, Content: RadixPopover.Content, Portal: RadixPopover.Portal, Close: RadixPopover.Close },
  { name: 'DropdownMenu', Wrapped: DropdownMenu, Raw: RadixMenu.Root, Trigger: RadixMenu.Trigger, Content: RadixMenu.Content, Portal: RadixMenu.Portal, Close: RadixMenu.Item },
  { name: 'Select', Wrapped: Select, Raw: RadixSelect.Root, Trigger: RadixSelect.Trigger, Content: RadixSelect.Content, Portal: RadixSelect.Portal, Close: RadixSelect.Item },
];

it.each(cases)('$name preserves unscoped Radix callback count and commit order in controlled and uncontrolled use', async entry => {
  async function trace(Root: ComponentType<OpenProps>, controlled: boolean, escape: boolean) {
    const events: string[] = [];
    function Commit() { useLayoutEffect(() => { events.push('content committed'); return () => { events.push('content removed'); }; }, []); return null; }
    function Fixture() {
      const [open, setOpen] = useState(false);
      const { Trigger, Content, Portal, Close } = entry;
      return <Root open={controlled ? open : undefined} onOpenChange={next => {
        events.push(`callback ${next} expanded=${screen.getByTestId('trigger').getAttribute('aria-expanded')}`);
        if (controlled) setOpen(next);
      }}>
        <Trigger data-testid="trigger">open</Trigger>
        <Portal><Content aria-label="overlay" aria-describedby={undefined}>
          {entry.name === 'Dialog' || entry.name === 'Sheet' ? <RadixDialog.Title>title</RadixDialog.Title> : null}
          {entry.name === 'AlertDialog' ? <RadixAlert.Title>title</RadixAlert.Title> : null}
          <Commit /><Close value="item">close</Close>
        </Content></Portal>
      </Root>;
    }
    const view = render(<Fixture />);
    const trigger = screen.getByTestId('trigger');
    // Keyboard activation is shared by all six Radix trigger contracts.
    if (entry.name === 'Select' || entry.name === 'DropdownMenu') fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    else fireEvent.click(trigger);
    expect(screen.getByText('close')).toBeInTheDocument();
    if (escape) fireEvent.keyDown(screen.getByText('close'), { key: 'Escape' });
    else if (entry.name === 'Select' || entry.name === 'DropdownMenu') fireEvent.keyDown(screen.getByText('close'), { key: 'Enter' });
    else fireEvent.click(screen.getByText('close'));
    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(screen.queryByText('close')).toBeNull();
    expect(events.filter(event => event.startsWith('callback'))).toHaveLength(2);
    view.unmount();
    return events;
  }
  for (const controlled of [false, true]) {
    for (const escape of [false, true]) {
      const expected = await trace(entry.Raw, controlled, escape);
      expect(await trace(entry.Wrapped, controlled, escape)).toEqual(expected);
    }
  }
});

it.each(cases)('$name preserves defaultOpen and batched trigger notifications without a scope', async entry => {
  async function trace(Root: ComponentType<OpenProps>, controlled: boolean, initiallyOpen: boolean) {
    const events: string[] = [];
    function Fixture() {
      const [open, setOpen] = useState(initiallyOpen);
      const { Trigger } = entry;
      return <Root open={controlled ? open : undefined} defaultOpen={initiallyOpen} onOpenChange={next => {
        events.push(`${next}:${screen.getByTestId('batched').getAttribute('aria-expanded')}`);
        if (controlled) setOpen(next);
      }}><Trigger data-testid="batched">toggle</Trigger></Root>;
    }
    const view = render(<Fixture />);
    const trigger = screen.getByTestId('batched');
    expect(trigger).toHaveAttribute('aria-expanded', String(initiallyOpen));
    act(() => {
      for (let i = 0; i < 2; i++) {
        if (entry.name === 'Select' || entry.name === 'DropdownMenu') fireEvent.keyDown(trigger, { key: ' ' });
        else fireEvent.click(trigger);
      }
    });
    await act(() => Promise.resolve());
    const result = { events, expanded: trigger.getAttribute('aria-expanded') };
    view.unmount();
    return result;
  }
  for (const controlled of [false, true]) {
    for (const initiallyOpen of [false, true]) {
      const expected = await trace(entry.Raw, controlled, initiallyOpen);
      expect(await trace(entry.Wrapped, controlled, initiallyOpen)).toEqual(expected);
    }
  }
});
