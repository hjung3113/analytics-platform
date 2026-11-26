import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePicker } from '../DatePicker.js';

afterEach(cleanup);

// #3147: the calendar sits on `surface-popover` and the field usually on a card; both are white (tokens.css), and so are
// `surface-card` and `surface-card-elevated`. A hover painted with one of them changes nothing. Hover uses the shared row
// hover (DESIGN.md: «hover는 공유 row-hover»), the rule #3142 applied to menus.
const WHITE_HOVER = /^hover:bg-surface-(card|card-elevated|detail|popover)$/;
const hoverOf = (element: Element) => Array.from(element.classList).filter(name => name.startsWith('hover:bg-'));

describe('DatePicker hover is visible on white surfaces (#3147)', () => {
  it('field buttons, month and year steps, and day buttons use the shared row hover', () => {
    render(<DatePicker aria-label="날짜" value="2026-06-12" onChange={vi.fn()} />);
    const buttons = [screen.getByRole('button', { name: '날짜 지우기' }), screen.getByRole('button', { name: '달력 열기' })];
    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));
    const dialog = screen.getByRole('dialog');
    buttons.push(...Array.from(dialog.querySelectorAll('button')));
    expect(buttons.length).toBeGreaterThan(30);
    for (const button of buttons) {
      const hover = hoverOf(button);
      expect(hover.filter(name => WHITE_HOVER.test(name)), button.getAttribute('aria-label') ?? button.textContent ?? '').toEqual([]);
      expect(hover).toContain('hover:bg-surface-row-hover');
    }
  });
});
