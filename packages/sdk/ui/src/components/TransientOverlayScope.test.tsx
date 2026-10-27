import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle, DialogTrigger, Popover, PopoverContent, PopoverTrigger, TransientOverlayScope } from '../index';

afterEach(cleanup);
describe('retained owner transient portals', () => {
  it.each(['dialog', 'popover'])('closes an uncontrolled %s and cancels delayed autofocus while keeping ordinary state', async kind => {
    const autofocus = vi.fn();
    function Fixture({ active }: { active: boolean }) {
      const [value, setValue] = useState('kept');
      return <TransientOverlayScope active={active}>
        <input aria-label="local" value={value} onChange={e => setValue(e.target.value)} />
        {kind === 'dialog' ? <Dialog><DialogTrigger>open</DialogTrigger><DialogContent onCloseAutoFocus={autofocus}><DialogTitle>overlay</DialogTitle></DialogContent></Dialog>
          : <Popover><PopoverTrigger>open</PopoverTrigger><PopoverContent>overlay</PopoverContent></Popover>}
      </TransientOverlayScope>;
    }
    const view = render(<Fixture active />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByText('overlay')).toBeInTheDocument();
    view.rerender(<Fixture active={false} />);
    expect(screen.queryByText('overlay')).toBeNull();
    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(autofocus).not.toHaveBeenCalled();
    view.rerender(<Fixture active />);
    expect(screen.queryByText('overlay')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('edited');
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByText('overlay')).toBeInTheDocument();
  });
});

it('rapid hide/show does not revive an outgoing dialog autofocus handoff', async () => {
  const autofocus = vi.fn();
  const viewOf = (active: boolean) => <TransientOverlayScope active={active}><Dialog defaultOpen><DialogContent onCloseAutoFocus={autofocus}><DialogTitle>rapid</DialogTitle></DialogContent></Dialog></TransientOverlayScope>;
  const view = render(viewOf(true));
  view.rerender(viewOf(false));
  view.rerender(viewOf(true));
  await act(() => new Promise(resolve => setTimeout(resolve, 20)));
  expect(autofocus).not.toHaveBeenCalled();
  expect(screen.queryByText('rapid')).toBeNull();
});
