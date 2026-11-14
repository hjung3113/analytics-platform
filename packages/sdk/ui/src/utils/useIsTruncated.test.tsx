import { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsTruncated } from './useIsTruncated';

// #2219: jsdom has no layout, so the box sizes are stubbed on the element the hook measures.
function Probe({ text }: { text: string; scrollWidth?: number; clientWidth?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const truncated = useIsTruncated(ref);
  return <span ref={ref} data-testid="label" data-truncated={String(truncated)}>{text}</span>;
}
const sizes = (scrollWidth: number, clientWidth: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth; delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth; });

describe('useIsTruncated', () => {
  it('is false for a fitting label and true once the text is wider than its box, after a re-render', () => {
    sizes(100, 100);
    const { rerender } = render(<Probe text="short" scrollWidth={100} clientWidth={100} />);
    expect(screen.getByTestId('label')).toHaveAttribute('data-truncated', 'false');
    sizes(180, 100);
    rerender(<Probe text="a much longer label" scrollWidth={180} clientWidth={100} />);
    expect(screen.getByTestId('label')).toHaveAttribute('data-truncated', 'true');
  });

  it('re-measures when the box is resized, and stops observing on unmount', () => {
    const callbacks: (() => void)[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { callbacks.push(cb); } observe() {} disconnect = disconnect; });
    sizes(100, 100);
    const { unmount } = render(<Probe text="label" scrollWidth={100} clientWidth={100} />);
    expect(screen.getByTestId('label')).toHaveAttribute('data-truncated', 'false');
    sizes(100, 60);
    act(() => callbacks[0]!());
    expect(screen.getByTestId('label')).toHaveAttribute('data-truncated', 'true');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('works without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    sizes(120, 100);
    render(<Probe text="label" scrollWidth={120} clientWidth={100} />);
    expect(screen.getByTestId('label')).toHaveAttribute('data-truncated', 'true');
  });

  it('adds no component renders when an unrelated parent re-renders and the label still fits', () => {
    let bodies = 0;
    function Counted({ tick }: { tick: number }) { bodies += 1; const ref = useRef<HTMLSpanElement>(null); useIsTruncated(ref); return <span ref={ref}>{tick}</span>; }
    sizes(100, 100);
    const { rerender } = render(<Counted tick={0} />);
    const afterMount = bodies;
    for (let tick = 1; tick <= 4; tick += 1) rerender(<Counted tick={tick} />);
    expect(bodies - afterMount).toBe(4);
  });
});
