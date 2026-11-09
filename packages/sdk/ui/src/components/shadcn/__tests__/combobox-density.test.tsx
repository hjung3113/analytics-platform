import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from '../combobox';

describe('Combobox density', () => {
  it('can display stable keys in monospace without changing default typography', () => {
    render(<Combobox font="mono" options={[{ value: 'CHAMBER/START', label: 'CHAMBER/START' }]} value="CHAMBER/START" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveClass('font-mono');
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox').closest('[data-radix-popper-content-wrapper]')?.textContent).toContain('CHAMBER/START');
  });
  it('keeps the default control size', () => {
    render(<Combobox options={[]} value={null} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveClass('h-10', 'px-3', 'py-2');
  });

  it('offers a compact control with the same keyboard selection', () => {
    const change = vi.fn();
    render(<label>Event A<Combobox density="compact" options={[{ value: 'CHAMBER/START', label: 'CHAMBER/START' }]} value={null} onChange={change} /></label>);
    const trigger = screen.getByRole('combobox', { name: 'Event A' });
    expect(trigger).toHaveClass('h-8');
    expect(trigger).not.toHaveClass('h-10');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const search = screen.getByRole('textbox');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith('CHAMBER/START');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
