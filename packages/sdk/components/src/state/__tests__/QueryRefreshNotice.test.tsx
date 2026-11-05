import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { QueryView } from '../../StateView';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const label = '이전 선택의 결과 · 갱신 중';
const query = {
  response: { outcome: 'ok' as const, data: 'previous', assessments: [], trust: null, correlationId: 'previous' },
  refetch: vi.fn(), missing: [], completedAt: null, status: 'refreshing' as const, showingPrevious: true,
};

function view(placement?: 'bottom-end' | 'top-end') {
  return <I18nProvider><div data-testid="clip" style={{ overflow: 'hidden' }}>
    <header><button>Maximize panel</button></header>
    <QueryView query={query} refreshNoticePlacement={placement}>{data => <section>
      <p>{data}</p><footer><button>Next page</button></footer>
    </section>}</QueryView>
  </div></I18nProvider>;
}

function geometry() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const status = this.getAttribute('role') === 'status';
    const footer = this.tagName === 'FOOTER' || this.textContent === 'Next page';
    const header = this.tagName === 'HEADER' || this.textContent === 'Maximize panel';
    const top = header ? 0 : footer ? 204 : 40;
    const height = status ? 22 : header ? 40 : footer ? 28 : 200;
    const width = status ? 160 : 300;
    return { top, bottom: top + height, left: 20, right: 20 + width, width, height, x: 20, y: top, toJSON: () => ({}) };
  });
}

describe('previous-selection notice placement (#1365 FIX3V)', () => {
  it('defaults inside the bottom edge with no top offset or native popover dependency', () => {
    geometry();
    render(view());
    const status = screen.getByRole('status', { name: label });
    expect(status).toHaveClass('absolute', 'bottom-0', 'right-3', 'pointer-events-none');
    expect(status.className).not.toMatch(/(?:^|\s)-?top-/);
    expect(status.style.top).toBe('');
    expect(status).not.toHaveAttribute('popover');
    expect(status.style.position).not.toBe('fixed');
    expect(status.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelector('svg')).toHaveClass('motion-reduce:animate-none');
  });

  it('clears bottom pagination controls while remaining below the panel header', () => {
    geometry();
    render(view());
    const status = screen.getByRole('status', { name: label });
    const top = 240 - Number.parseFloat(status.style.bottom) - 22;
    expect(top + 22).toBeLessThanOrEqual(200);
    expect(top).toBeGreaterThanOrEqual(40);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('accepts an explicit top-end placement within the query section', () => {
    geometry();
    const result = render(view('top-end'));
    const body = screen.getByText('previous');
    const status = screen.getByRole('status', { name: label });
    expect(status).toHaveClass('top-0');
    expect(status).not.toHaveClass('bottom-0');
    expect(status.style.top).toBe('0px');
    result.rerender(view('bottom-end'));
    expect(status).toHaveClass('bottom-0');
    expect(status.style.top).toBe('');
    expect(screen.getByText('previous')).toBe(body);
  });
});
