import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './Table';

describe('static Table', () => {
  it('keeps sticky header borders on cells and removes only the final body cell borders', () => {
    render(<Table><TableHeader className="sticky top-0"><TableRow><TableHead>Count</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>12</TableCell></TableRow></TableBody></Table>);
    expect(screen.getByRole('table')).toHaveClass('border-separate', 'border-spacing-0');
    expect(screen.getByRole('columnheader').closest('thead')).toHaveClass('sticky', 'top-0');
    for (const cell of [screen.getByRole('columnheader'), screen.getByRole('cell')]) expect(cell).toHaveClass('border-b', 'border-border-subtle');
    for (const row of screen.getAllByRole('row')) expect(row).not.toHaveClass('border-b');
    expect(screen.getByRole('cell').closest('tbody')).toHaveClass('[&_tr:last-child>td]:border-b-0');
  });

  it('marks the current row with the accent surface and aria-current, and leaves other rows plain', () => {
    render(<Table><TableBody><TableRow current><TableCell>a</TableCell></TableRow><TableRow><TableCell>b</TableCell></TableRow></TableBody></Table>);
    const [on, off] = screen.getAllByRole('row');
    expect(on).toHaveAttribute('aria-current', 'true');
    expect(on).toHaveClass('bg-accent-primary-soft');
    expect(off).not.toHaveAttribute('aria-current');
    expect(off).not.toHaveClass('bg-accent-primary-soft');
  });

  it('keeps aria-current on a current row even when the caller passes a conflicting aria-current', () => {
    render(<Table><TableBody><TableRow current aria-current={undefined}><TableCell>a</TableCell></TableRow><TableRow current aria-current={false}><TableCell>b</TableCell></TableRow><TableRow aria-current="page"><TableCell>c</TableCell></TableRow></TableBody></Table>);
    const [first, second, third] = screen.getAllByRole('row');
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(third).toHaveAttribute('aria-current', 'page');
  });

  it('aligns numeric headers and cells at the end with tabular figures', () => {
    render(<Table><TableHeader><TableRow><TableHead align="end">Count</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell align="end">12</TableCell></TableRow></TableBody></Table>);
    expect(screen.getByRole('columnheader')).toHaveClass('text-right', 'tabular');
    expect(screen.getByRole('cell')).toHaveClass('text-right', 'tabular');
  });

  it.each(['ascending', 'descending', 'none'] as const)('exposes %s sorting and a native button that invokes onSort', direction => {
    const onSort = vi.fn();
    render(<Table><TableHeader><TableRow><TableHead sort={{ direction, onSort }}>Count</TableHead></TableRow></TableHeader></Table>);
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', direction);
    fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    expect(onSort).toHaveBeenCalledOnce();
  });

  it('opts into compact density without changing the default density', () => {
    const { rerender } = render(<Table aria-label="Summary" />);
    expect(screen.getByRole('table')).toHaveClass('text-sm');
    rerender(<Table density="compact" aria-label="Summary" />);
    expect(screen.getByRole('table')).toHaveClass('text-xs', '[&_th]:h-7', '[&_td]:h-7');
  });

  it('reduces horizontal padding for both headers and cells only in compact density', () => {
    const { rerender } = render(<Table><TableHeader><TableRow><TableHead>Count</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>12</TableCell></TableRow></TableBody></Table>);
    expect(screen.getByRole('columnheader')).toHaveClass('px-4');
    expect(screen.getByRole('cell')).toHaveClass('px-4');
    expect(screen.getByRole('table')).not.toHaveClass('[&_th]:px-3');
    expect(screen.getByRole('table')).not.toHaveClass('[&_td]:px-3');
    rerender(<Table density="compact"><TableHeader><TableRow><TableHead>Count</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>12</TableCell></TableRow></TableBody></Table>);
    expect(screen.getByRole('table')).toHaveClass('[&_th]:px-3', '[&_td]:px-3');
  });

  it('keeps a caption visible by default and supports a screen-reader-only caption', () => {
    const { rerender } = render(<Table><TableCaption>Summary</TableCaption></Table>);
    expect(screen.getByText('Summary')).not.toHaveClass('sr-only');
    rerender(<Table><TableCaption srOnly>Summary</TableCaption></Table>);
    expect(screen.getByText('Summary')).toHaveClass('sr-only');
    expect(screen.getByRole('table', { name: 'Summary' })).toBeInTheDocument();
  });
});
