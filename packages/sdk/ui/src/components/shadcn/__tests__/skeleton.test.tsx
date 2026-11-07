/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { Skeleton } from '../skeleton.js';

describe('Skeleton', () => {
  it('renders the registered placeholder token, not the raised surface it sits on', () => {
    render(<Skeleton data-testid="skeleton" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveClass('bg-surface-blocked');
    expect(el).not.toHaveClass('bg-surface-raised');
  });
});
