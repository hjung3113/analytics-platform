import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../input';

describe('Input size', () => {
  it('keeps the 40px field by default', () => {
    render(<Input aria-label="a" />);
    const input = screen.getByLabelText('a');
    expect(input.className).toContain('h-10');
    expect(input.className).toContain('bg-surface-field');
    expect(input.hasAttribute('data-size')).toBe(false);
  });
  it('inputSize="toolbar" is 32px, sunken and 13px (text-sm)', () => {
    render(<Input aria-label="t" inputSize="toolbar" />);
    const input = screen.getByLabelText('t');
    expect(input.className).toContain('h-8');
    expect(input.className).toContain('bg-surface-sunken');
    expect(input.className).toContain('text-sm');
    expect(input.className).not.toContain('h-10');
    expect(input.getAttribute('data-size')).toBe('toolbar');
  });
  it('still forwards the native numeric size attribute', () => {
    render(<Input aria-label="n" size={20} />);
    const input = screen.getByLabelText('n');
    expect(input.getAttribute('size')).toBe('20');
    expect(input.className).toContain('h-10');
  });
});
