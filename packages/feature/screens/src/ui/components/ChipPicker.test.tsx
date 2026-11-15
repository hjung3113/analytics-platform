import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChipPicker } from './ChipPicker';

afterEach(cleanup);
describe('ChipPicker disabled options', () => {
  it.each([null, 'closed'])('keeps a denied option muted and described, including selected value %s', value => {
    const onChange = vi.fn();
    render(<ChipPicker variant="managed-system" value={value} onChange={onChange} options={[
      { id: 'open', label: 'Tableau' },
      { id: 'closed', label: 'Power BI', disabled: true, title: '등록 권한이 없습니다 · 관리자에게 문의' },
    ]} />);
    const closed = screen.getByRole('radio', { name: 'Power BI' });
    expect(closed).toBeDisabled();
    expect(closed).toHaveClass('text-text-muted', 'bg-surface-canvas');
    expect(closed.querySelector('.lucide-lock-keyhole')).toBeInTheDocument();
    expect(closed).toHaveAccessibleDescription('등록 권한이 없습니다 · 관리자에게 문의');
    expect(closed).toHaveTextContent('등록 권한이 없습니다 · 관리자에게 문의');
    fireEvent.click(closed); expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Tableau' }));
    expect(onChange).toHaveBeenCalledWith('open');
  });
});
