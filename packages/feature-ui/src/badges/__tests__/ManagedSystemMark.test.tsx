import { render, screen } from '@testing-library/react';
import { ManagedSystemMark } from '../ManagedSystemMark.js';

describe('ManagedSystemMark', () => {
  it('keeps font classes nondecreasing from size 18 through 22 to 28', () => {
    render(<>{([18, 22, 28] as const).map(size => (
      <ManagedSystemMark key={size} label={`mark-${size}`} color="rgb(var(--managed-system-power-bi) / 1)" size={size} />
    ))}</>);
    // All three use the same 11px token, so 18 <= 22 <= 28 holds without changing size 28.
    for (const size of [18, 22, 28]) {
      expect(screen.getByText(`mark-${size}`)).toHaveClass('text-tiny');
      expect(screen.getByText(`mark-${size}`)).not.toHaveClass('text-caption');
    }
  });

  it('renders the supplied initials decoratively at the requested size', () => {
    render(
      <ManagedSystemMark label="PB" color="rgb(var(--managed-system-power-bi) / 1)" size={22} />,
    );

    expect(screen.getByText('PB')).toHaveAttribute('aria-hidden', 'true');
  });
});
