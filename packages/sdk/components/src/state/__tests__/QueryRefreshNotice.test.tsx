import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { QueryView } from '../../StateView';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';
import { AnalysisSectionContext } from '../../archetypes/AnalysisSectionContext';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const label = '이전 선택의 결과 · 갱신 중';
const query = {
  response: { outcome: 'ok' as const, data: 'previous', assessments: [], trust: null, correlationId: 'previous' },
  refetch: vi.fn(), missing: [], completedAt: null, status: 'refreshing' as const, showingPrevious: true,
};

function view({ previous = true, status = 'refreshing', notice = 'visible', fill = false }: {
  previous?: boolean; status?: 'refreshing' | 'done'; notice?: 'visible' | 'hidden'; fill?: boolean;
} = {}) {
  return <I18nProvider><div data-testid="clip" style={{ overflow: 'hidden' }}>
    <header><button>Maximize panel</button></header>
    <QueryView query={{ ...query, showingPrevious: previous, status }} refreshNotice={notice} fill={fill}>{data => <section>
      <p>{data}</p><footer><button>Next page</button></footer>
    </section>}</QueryView>
  </div></I18nProvider>;
}

describe('previous-selection in-flow notice (#1365 FIX4V)', () => {
  it('puts a full-width constant-height row above the result, outside its tint', () => {
    const { container } = render(view());
    const status = screen.getByRole('status', { name: label });
    const content = container.querySelector('[data-query-result-content]');
    expect(status).toHaveClass('flex', 'h-6', 'w-full', 'shrink-0', 'pr-12', 'text-xs', 'bg-surface-sunken', 'text-text-secondary');
    expect(status.nextElementSibling).toBe(content);
    expect(content).toContainElement(screen.getByText('previous'));
    expect(content).toContainElement(container.querySelector('[data-query-stale-tint]') as HTMLElement);
    expect(status.querySelector('[data-query-stale-tint]')).toBeNull();
    expect(status).not.toHaveClass('absolute', 'fixed', 'sticky');
    expect(status.style.cssText).toBe('');
    expect(status).not.toHaveAttribute('popover');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('keeps named status, busy semantics, non-interactive tint and reduced motion', () => {
    const { container } = render(view());
    const status = screen.getByRole('status', { name: label });
    expect(status).toHaveTextContent(label);
    expect(status).toHaveClass('pointer-events-none');
    expect(status.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(status.querySelector('svg')).toHaveClass('animate-spin', 'motion-reduce:animate-none');
    expect(container.querySelector('[data-query-stale-tint]')).toHaveClass('pointer-events-none', 'bg-surface-sunken/20');
  });

  it.each([
    { previous: false, status: 'done' as const },
    { previous: true, status: 'done' as const },
    { previous: false, status: 'refreshing' as const },
    { notice: 'hidden' as const },
  ])('reserves no notice row for %o', options => {
    const { container } = render(view(options));
    expect(screen.queryByRole('status', { name: label })).toBeNull();
    expect(container.querySelector('.h-6')).toBeNull();
  });

  it.each(['fill', 'panel'] as const)('gives %s results a stable remaining-height container', kind => {
    const bounded = (previous: boolean) => kind === 'panel'
      ? <InWorkspacePanelProvider value>{view({ previous, status: previous ? 'refreshing' : 'done' })}</InWorkspacePanelProvider>
      : view({ previous, status: previous ? 'refreshing' : 'done', fill: true });
    const result = render(bounded(false));
    const body = screen.getByText('previous');
    const content = result.container.querySelector('[data-query-result-content]');
    expect(content).toHaveClass('contents');
    expect(content?.parentElement).toHaveClass('flex', 'flex-col', 'min-h-0');
    result.rerender(bounded(true));
    expect(content).toHaveClass('flex', 'flex-col', 'flex-1', 'min-h-0');
    expect(screen.getByText('previous')).toBe(body);
    expect(result.container.querySelector('[data-query-result-content]')).toBe(content);
    expect(screen.getByRole('status', { name: label }).nextElementSibling).toBe(content);
    result.rerender(bounded(false));
    expect(content).toHaveClass('contents');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('previous')).toBe(body);
  });

  it('keeps two result subgrid rows below a separate notice track only while previous', () => {
    const chartView = (previous: boolean) => <AnalysisSectionContext.Provider value={{ title: 'Chart', kind: 'chart', collapse: vi.fn() }}>
      {view({ previous, status: previous ? 'refreshing' : 'done' })}
    </AnalysisSectionContext.Provider>;
    const result = render(chartView(false));
    const content = result.container.querySelector('[data-query-result-content]');
    const wrapper = content?.parentElement;
    expect(wrapper).toHaveClass('grid-rows-subgrid', 'row-span-2');
    expect(content).toHaveClass('contents');
    result.rerender(chartView(true));
    expect(wrapper).toHaveClass('grid-rows-[auto_auto_minmax(0,1fr)]');
    expect(wrapper).not.toHaveClass('grid-rows-subgrid');
    expect(content).toHaveClass('row-span-2', 'grid', 'grid-rows-subgrid');
    result.rerender(chartView(false));
    expect(content).toHaveClass('contents');
    expect(wrapper).toHaveClass('grid-rows-subgrid');
    expect(wrapper).not.toHaveClass('grid-rows-[auto_auto_minmax(0,1fr)]');
  });
});

describe('layout-neutral live result container (#1365 FIX5V)', () => {
  it.each(['plain', 'fill', 'panel', 'chart'] as const)('keeps %s children in the original layout for every metadata value', kind => {
    const live = (previous: boolean | undefined) => <I18nProvider>
      <AnalysisSectionContext.Provider value={kind === 'chart' ? { title: 'Chart', kind: 'chart', collapse: vi.fn() } : null}>
        <InWorkspacePanelProvider value={kind === 'panel'}>
          <QueryView query={{ ...query, status: 'done', showingPrevious: previous }} fill={kind === 'fill'}>{data => <p>{data}</p>}</QueryView>
        </InWorkspacePanelProvider>
      </AnalysisSectionContext.Provider>
    </I18nProvider>;
    const result = render(live(undefined));
    const body = screen.getByText('previous');
    const content = result.container.querySelector('[data-query-result-content]');
    for (const previous of [undefined, false, true]) {
      result.rerender(live(previous));
      expect(result.container.querySelector('[data-query-result-content]')).toBe(content);
      expect(content).toHaveClass('contents');
      expect(content).not.toHaveClass('flex', 'grid', 'relative', 'row-span-2');
      expect(screen.getByText('previous')).toBe(body);
      expect(content?.parentElement).not.toHaveClass('grid-rows-[auto_auto_minmax(0,1fr)]');
      expect(result.container.querySelector('[data-query-stale-tint]')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    }
  });
});
