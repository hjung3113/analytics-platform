/// <reference types="@testing-library/jest-dom" />
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InfoTip } from '../InfoTip.js';

describe('InfoTip (#2300)', () => {
  it('is a button named by label and described by a persistent sr-only paragraph', () => {
    render(<InfoTip label="설명">조회 기준 설명</InfoTip>);
    const button = screen.getByRole('button', { name: '설명' });
    const text = screen.getByText('조회 기준 설명');
    expect(button).toHaveAttribute('type', 'button');
    expect(text).toHaveClass('sr-only');
    expect(button).toHaveAttribute('aria-describedby', text.id);
    expect(button).toHaveAccessibleDescription('조회 기준 설명');
  });

  it('holds a block description without nesting it in a paragraph (#2364 review)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<InfoTip label="설명"><ul><li>집계 기준</li></ul></InfoTip>);
    const list = screen.getByRole('list', { hidden: true });
    expect(list.closest('p')).toBeNull();
    expect(screen.getByRole('button', { name: '설명' })).toHaveAccessibleDescription('집계 기준');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('uses the given description id so a section can point at the same paragraph', () => {
    render(<section aria-describedby="d1"><InfoTip label="설명" descriptionId="d1">기준</InfoTip></section>);
    expect(document.getElementById('d1')).toHaveTextContent('기준');
    expect(screen.getByRole('button', { name: '설명' })).toHaveAttribute('aria-describedby', 'd1');
  });

  it('opens its tooltip on focus and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<InfoTip label="설명">조회 기준 설명</InfoTip>);
    await user.tab();
    expect(screen.getByRole('button', { name: '설명' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('조회 기준 설명');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
