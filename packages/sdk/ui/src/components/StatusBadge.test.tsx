import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge decision shape', () => {
  it('keeps the existing soft default and offers an outlined badge with the same tone and geometry', () => {
    render(<><StatusBadge tone="neutral">Default</StatusBadge><StatusBadge tone="neutral" variant="outline">Decision</StatusBadge></>);
    expect(screen.getByText('Default')).toHaveClass('bg-accent-neutral-soft', 'rounded-pill', 'text-text-secondary');
    expect(screen.getByText('Default')).not.toHaveClass('border');
    expect(screen.getByText('Decision')).toHaveClass('border', 'border-border-subtle', 'rounded-pill', 'text-text-secondary');
    expect(screen.getByText('Decision')).not.toHaveClass('bg-accent-neutral-soft');
  });
});
