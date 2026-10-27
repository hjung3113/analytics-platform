import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkbox } from '../checkbox';

afterEach(cleanup);

describe('Checkbox', () => {
  it.each([true, 'indeterminate', false] as const)('renders the indicator for controlled %s', checked => {
    render(<Checkbox aria-label="check" checked={checked} />);
    const control = screen.getByRole('checkbox');
    expect(control.querySelector('.lucide-check') !== null).toBe(checked === true);
    expect(control.querySelector('.lucide-minus') !== null).toBe(checked === 'indeterminate');
    expect(control).toHaveClass('data-[state=checked]:bg-accent-primary', 'data-[state=indeterminate]:bg-accent-primary',
      'data-[state=checked]:text-text-on-accent', 'data-[state=indeterminate]:text-text-on-accent');
  });

  it('updates controlled indicators as the value changes', () => {
    const view = render(<Checkbox checked="indeterminate" />);
    view.rerender(<Checkbox checked />);
    expect(screen.getByRole('checkbox').querySelector('.lucide-check')).not.toBeNull();
    view.rerender(<Checkbox checked={false} />);
    expect(screen.getByRole('checkbox').querySelector('svg')).toBeNull();
  });

  it.each([true, 'indeterminate', false] as const)('supports defaultChecked %s and uncontrolled transitions', initial => {
    render(<Checkbox defaultChecked={initial} />);
    const control = screen.getByRole('checkbox');
    expect(control).toHaveAttribute('aria-checked', initial === 'indeterminate' ? 'mixed' : String(initial));
    if (initial === 'indeterminate') expect(control.querySelector('.lucide-minus')).not.toBeNull();
    fireEvent.click(control);
    expect(control).toHaveAttribute('aria-checked', String(initial !== true));
    expect(control.querySelector('.lucide-check') !== null).toBe(initial !== true);
  });
});
