import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardGroupByButton } from '../TaskBoardGroupByButton';

afterEach(cleanup);

// #3147: the options sit on `surface-popover`, the same white as `surface-card` (tokens.css); a `surface-card` hover changes
// nothing, so hover uses the shared row hover (DESIGN.md «hover는 공유 row-hover»).
const WHITE_HOVER = /^hover:bg-surface-(card|card-elevated|detail|popover)$/;

describe('TaskBoardGroupByButton hover (#3147)', () => {
  it('shows hover on each popover option with the shared row hover', () => {
    render(<TaskBoardGroupByButton value="status" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /그룹화/ }));
    const options = screen.getAllByRole('radio').map((radio) => radio.closest('label'));
    expect(options.length).toBeGreaterThan(1);
    for (const option of options) {
      expect(option).not.toBeNull();
      const hover = Array.from(option?.classList ?? []).filter((name) => name.startsWith('hover:bg-'));
      expect(hover.filter((name) => WHITE_HOVER.test(name))).toEqual([]);
      expect(hover).toContain('hover:bg-surface-row-hover');
    }
  });
});
