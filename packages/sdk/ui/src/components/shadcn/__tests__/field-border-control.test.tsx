import { render, screen } from '@testing-library/react';
import { Combobox } from '../combobox.js';
import { Input } from '../input.js';
import { Select, SelectTrigger, SelectValue } from '../select.js';
import { Textarea } from '../textarea.js';
import { DatePicker } from '../../../forms/DatePicker.js';

// DESIGN.md "border-control" / ADR-0023: an input's identifying border is `border-control` (≥3:1), never `border-subtle` (1.44:1, #1423).
const expectControlBorder = (el: HTMLElement) => {
  expect(el).toHaveClass('border-border-control');
  expect(el).not.toHaveClass('border-border-subtle');
};

describe('field default border (#1423)', () => {
  it('Input and Textarea', () => {
    render(<><Input aria-label="i" /><Textarea aria-label="t" /></>);
    expectControlBorder(screen.getByLabelText('i'));
    expectControlBorder(screen.getByLabelText('t'));
  });
  it('SelectTrigger', () => {
    render(<Select><SelectTrigger aria-label="s"><SelectValue /></SelectTrigger></Select>);
    expectControlBorder(screen.getByLabelText('s'));
  });
  it('Combobox trigger', () => {
    render(<Combobox options={[]} value={null} onChange={() => {}} placeholder="p" />);
    expectControlBorder(screen.getByRole('combobox'));
  });
  it('DatePicker field frame', () => {
    const { container } = render(<DatePicker value="" onChange={() => {}} aria-label="d" />);
    expectControlBorder(container.querySelector<HTMLElement>('div.h-10')!);
  });
});
