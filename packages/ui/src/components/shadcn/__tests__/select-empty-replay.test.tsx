import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { vi } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select.js';

/** #644: Radix 2.3 replays `onValueChange("")` when the new value's item registers after the commit. */
function LateItems({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) {
  const [items, setItems] = React.useState(['a']);
  React.useEffect(() => {
    if (value === 'b') setItems(['a', 'b']);
  }, [value]);
  return (
    <form>
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label="Choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map(item => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    </form>
  );
}

describe('Select empty-value replay', () => {
  it('does not forward "" when the new value item mounts after the change', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<LateItems value="a" onValueChange={onValueChange} />);
    act(() => {
      rerender(<LateItems value="b" onValueChange={onValueChange} />);
    });
    expect(onValueChange).not.toHaveBeenCalledWith('');
  });

  it('still forwards a user pick once with its value', () => {
    const onValueChange = vi.fn();
    render(
      <Select defaultValue="apple" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Fruit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Fruit' }), { key: 'b' });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('banana');
  });
});

const tick = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

describe('Select deliberate empty clears', () => {
  it('forwards "" from an enabled empty-value item on a controlled select', async () => {
    const onValueChange = vi.fn();
    render(
      <Select value="a" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Choice">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">None</SelectItem>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    await tick();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Choice' }), { key: 'n' });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('forwards "" from form.reset() to the initial empty value', async () => {
    const onValueChange = vi.fn();
    function Field({ value }: { value: string }) {
      return (
        <form aria-label="f">
          <Select value={value} onValueChange={onValueChange} name="choice">
            <SelectTrigger aria-label="Choice">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">A</SelectItem>
            </SelectContent>
          </Select>
        </form>
      );
    }
    const { rerender } = render(<Field value="" />);
    rerender(<Field value="a" />);
    await tick();
    onValueChange.mockClear();
    act(() => {
      (screen.getByRole('form', { name: 'f' }) as HTMLFormElement).reset();
    });
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('notifies the consumer when an uncontrolled select is cleared by an empty-value item', () => {
    const onValueChange = vi.fn();
    render(
      <Select defaultValue="a" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Choice">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">None</SelectItem>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Choice' }), { key: 'n' });
    expect(onValueChange).toHaveBeenCalledWith('');
  });
});
