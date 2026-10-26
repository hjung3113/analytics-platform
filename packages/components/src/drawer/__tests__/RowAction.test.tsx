import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PanelRight } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RowAction } from '../RowAction';

afterEach(cleanup);

describe('RowAction (row action, compact ↔ full, ADR-0037)', () => {
  it('compact: keeps the accessible name when the tooltip text differs, and renders an icon without visible text', () => {
    render(<RowAction compact icon={PanelRight} label="engineer 보기" text="보기" />);
    const button = screen.getByRole('button', { name: 'engineer 보기' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button).toHaveTextContent('');
  });

  it('full: shows the text, no icon, and the same toolbar button classes', () => {
    const { rerender } = render(<RowAction compact icon={PanelRight} label="engineer 보기" text="보기" />);
    const compactClass = screen.getByRole('button').className;
    rerender(<RowAction compact={false} icon={PanelRight} label="engineer 보기" text="보기" />);
    const button = screen.getByRole('button', { name: 'engineer 보기' });
    expect(button).toHaveTextContent('보기');
    expect(button.querySelector('svg')).toBeNull();
    expect(button.className).toBe(compactClass);
  });

  it('opens the tooltip on keyboard focus in compact', async () => {
    render(<RowAction compact icon={PanelRight} label="engineer 보기" text="보기" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    screen.getByRole('button', { name: 'engineer 보기' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('보기');
  });

  it('never opens the tooltip in full, and closes it when the form turns full', async () => {
    const { rerender } = render(<RowAction compact={false} icon={PanelRight} label="engineer 보기" text="보기" />);
    const button = screen.getByRole('button', { name: 'engineer 보기' });
    button.focus();
    fireEvent.pointerMove(button);
    await new Promise(r => setTimeout(r, 300));
    expect(screen.queryByRole('tooltip')).toBeNull();
    rerender(<RowAction compact icon={PanelRight} label="engineer 보기" text="보기" />);
    rerender(<RowAction compact={false} icon={PanelRight} label="engineer 보기" text="보기" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not reopen a stale tooltip when the form returns to compact after focus left during the full form', async () => {
    const make = (compact: boolean) => <><RowAction compact={compact} icon={PanelRight} label="engineer 보기" text="보기" /><button>다른 곳</button></>;
    const { rerender } = render(make(true));
    screen.getByRole('button', { name: 'engineer 보기' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('보기');
    rerender(make(false));
    expect(screen.queryByRole('tooltip')).toBeNull();
    screen.getByRole('button', { name: '다른 곳' }).focus();
    rerender(make(true));
    await new Promise(r => setTimeout(r, 300));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays closed when focus bounces back to the trigger and away within one tick after leaving (drawer focus bounce)', async () => {
    render(<><RowAction compact icon={PanelRight} label="engineer 보기" text="보기" /><button>다른 곳</button></>);
    const trigger = screen.getByRole('button', { name: 'engineer 보기' });
    const other = screen.getByRole('button', { name: '다른 곳' });
    act(() => trigger.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('보기');
    act(() => other.focus());
    act(() => {
      trigger.focus();
      other.focus();
    });
    await new Promise(r => setTimeout(r, 300));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each([
    ['button', 'button', (c: boolean) => <RowAction compact={c} icon={PanelRight} label="x 보기" text="보기" />],
    ['link', 'link', (c: boolean) => <RowAction compact={c} icon={PanelRight} label="x 보기" text="보기" link={<a href="/x">z</a>} />],
    ['text link', 'link', (c: boolean) => <RowAction compact={c} icon={PanelRight} label="x 상세" text="상세" textLink="primary" link={<a href="/x">z</a>} />],
  ] as const)('%s: the same DOM node and focus survive a compact flip both ways', (_name, role, make) => {
    const { rerender } = render(make(true));
    const node = screen.getByRole(role);
    node.focus();
    for (const compact of [false, true, false]) {
      rerender(make(compact));
      expect(screen.getByRole(role)).toBe(node);
      expect(document.activeElement).toBe(node);
    }
  });

  it('full text link uses the text-link classes and no aria-label when the name equals the text', () => {
    render(<RowAction compact={false} icon={PanelRight} label="정의" text="정의" textLink="primary" link={<a href="/x">z</a>} />);
    const link = screen.getByRole('link', { name: '정의' });
    expect(link.className).toBe('text-xs font-medium text-accent-primary hover:underline');
    expect(link).not.toHaveAttribute('aria-label');
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<RowAction compact icon={PanelRight} label="engineer 보기" text="보기" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'engineer 보기' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps href and target of a link child and names it', () => {
    render(<RowAction compact icon={PanelRight} label="VOC-1 FeedbackOps에서 보기" text="FeedbackOps에서 보기"
      link={<a href="https://fo.example/voc/1" target="_blank" rel="noopener noreferrer">x</a>} />);
    const link = screen.getByRole('link', { name: 'VOC-1 FeedbackOps에서 보기' });
    expect(link).toHaveAttribute('href', 'https://fo.example/voc/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link).not.toHaveTextContent('x');
  });

  it('keeps aria-describedby and is disabled', () => {
    render(<><p id="why">연결 없음</p><RowAction compact icon={PanelRight} label="VOC-1 보기" text="보기" disabled aria-describedby="why" /></>);
    const button = screen.getByRole('button', { name: 'VOC-1 보기' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-describedby', 'why');
  });
});
