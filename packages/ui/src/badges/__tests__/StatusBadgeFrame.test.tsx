import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadgeFrame } from '../StatusBadgeFrame';

// Carried over from the removed domain badge tests (ADR-0050): the frame owns token and tint forwarding.
describe('StatusBadgeFrame token and tint', () => {
  it('puts the caller token on data-token and builds the 12% tint style from it with a tone', () => {
    const { container } = render(<StatusBadgeFrame appearance="compact" tone="danger" token="--example-token">x</StatusBadgeFrame>);
    const frame = container.querySelector('[data-token="--example-token"]') as HTMLElement;
    expect(frame).not.toBeNull();
    expect(frame.style.getPropertyValue('--status-badge-tint')).toBe('rgb(var(--example-token) / 0.12)');
    expect(frame.className).toContain('bg-(--status-badge-tint)');
  });

  it('uses the caller text class over the tone text class', () => {
    const { container } = render(
      <StatusBadgeFrame appearance="compact" tone="danger" token="--example-token" textClassName="text-example-label">x</StatusBadgeFrame>,
    );
    const frame = container.querySelector('[data-token]') as HTMLElement;
    expect(frame).toHaveClass('text-example-label');
    expect(frame).not.toHaveClass('text-text-danger-label');
  });

  it('keeps the caller style and merges the tint into it', () => {
    const { container } = render(
      <StatusBadgeFrame appearance="compact" tone="success" token="--example-token" style={{ minWidth: '3px' }}>x</StatusBadgeFrame>,
    );
    const frame = container.querySelector('[data-token]') as HTMLElement;
    expect(frame.style.minWidth).toBe('3px');
    expect(frame.style.getPropertyValue('--status-badge-tint')).toBe('rgb(var(--example-token) / 0.12)');
  });

  it('without a token it forwards only the caller style and sets no data-token', () => {
    const { container } = render(
      <StatusBadgeFrame appearance="compact" tone="success" style={{ minWidth: '3px' }}>x</StatusBadgeFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.hasAttribute('data-token')).toBe(false);
    expect(frame.style.getPropertyValue('--status-badge-tint')).toBe('');
    expect(frame.style.minWidth).toBe('3px');
  });
});
