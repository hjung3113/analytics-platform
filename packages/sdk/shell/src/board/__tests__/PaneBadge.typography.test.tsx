import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { cn } from '@ap/ui';
import { PaneBadge } from '../PaneBadge';
import { PANE_CHIP } from '../../context/contextChip';

afterEach(cleanup);

it.each([false, true])('keeps pane badges on badge typography (selected=%s)', selected => {
  render(<PaneBadge label="칸 1" selected={selected} />);
  expect(screen.getByText('칸 1')).toHaveClass('t-badge', 'h-5');
  expect(screen.getByText('칸 1')).not.toHaveClass('text-caption', 'font-semibold');
});

it('keeps pane chips at 24px high with the tiny font even after class merging', () => {
  const classes = cn(PANE_CHIP).split(' ');
  expect(classes).toContain('h-6');
  expect(classes).toContain('text-tiny');
  expect(classes).toContain('text-accent-primary');
  expect(classes).not.toContain('text-caption');
});
