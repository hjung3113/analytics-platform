import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PanelRight } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowActionIcon } from './RowActionIcon';

afterEach(cleanup);

describe('RowActionIcon (compact row action, ADR-0037)', () => {
  it('keeps the accessible name when the tooltip text differs, and renders an icon without visible text', () => {
    render(<RowActionIcon icon={PanelRight} label="engineer 보기" tooltip="보기" />);
    const button = screen.getByRole('button', { name: 'engineer 보기' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).toHaveTextContent('');
  });

  it('opens the tooltip on keyboard focus', async () => {
    render(<RowActionIcon icon={PanelRight} label="engineer 보기" tooltip="보기" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    screen.getByRole('button', { name: 'engineer 보기' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('보기');
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<RowActionIcon icon={PanelRight} label="engineer 보기" tooltip="보기" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'engineer 보기' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps href and target of a link child and names it', () => {
    render(<RowActionIcon icon={PanelRight} label="VOC-1 FeedbackOps에서 보기" tooltip="FeedbackOps에서 보기"
      link={<a href="https://fo.example/voc/1" target="_blank" rel="noopener noreferrer">x</a>} />);
    const link = screen.getByRole('link', { name: 'VOC-1 FeedbackOps에서 보기' });
    expect(link).toHaveAttribute('href', 'https://fo.example/voc/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link).not.toHaveTextContent('x');
  });

  it('keeps aria-describedby and is disabled', () => {
    render(<><p id="why">연결 없음</p><RowActionIcon icon={PanelRight} label="VOC-1 보기" tooltip="보기" disabled aria-describedby="why" /></>);
    const button = screen.getByRole('button', { name: 'VOC-1 보기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-describedby', 'why');
  });
});
