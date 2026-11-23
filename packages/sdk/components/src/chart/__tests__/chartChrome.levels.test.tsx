import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { AnalysisChart, type ChartSpec } from '../AnalysisChart';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';

vi.mock('../EChartImpl', () => ({ default: () => <div role="img" aria-label="plot" /> }));
afterEach(cleanup);
const series = [{ id: 's', name: 'Series', color: 'chart-blue' as const, points: [['A', 1]] as [string, number][] }];
const specs: Record<string, ChartSpec> = {
  heatmap: { kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 2, status: { tone: 'warning', label: 'Check' } }] },
  donut: { kind: 'donut', slices: [{ id: 'a', label: 'Slice', value: 2 }] },
};
type Level = 'full' | 'standard' | 'minimal';
function mount(kind: string, mode: boolean | 'pane', chrome?: Level, extra = {}) {
  const common = { chartId: 'chart', title: 'Chart', description: 'Explanation', unit: 's', size: 'fill' as const, chrome, exportActions: { exportAllowed: true }, ...extra };
  return render(<I18nProvider><InWorkspacePanelProvider value={mode}>
    {kind === 'frame' ? <AnalysisChartFrame {...common} xType="category" series={series} /> : <AnalysisChart {...common} spec={specs[kind]} />}
  </InWorkspacePanelProvider></I18nProvider>);
}
describe('Chart chrome levels (#2372)', () => {
  it.each(['frame', 'heatmap', 'donut'])('%s resolves context defaults and explicit overrides', kind => {
    for (const [mode, prop, expected] of [
      [false, undefined, 'full'], ['pane', undefined, 'full'], [true, undefined, 'standard'],
      [true, 'full', 'full'], [false, 'standard', 'standard'], [false, 'minimal', 'minimal'],
      [true, 'minimal', 'minimal'],
    ] as const) {
      mount(kind, mode, prop);
      expect(screen.getByRole('heading', { name: 'Chart' }).classList.contains('sr-only')).toBe(expected !== 'full');
      const legend = screen.queryByLabelText('범례');
      if (expected === 'minimal') expect(legend).toBeNull();
      else expect(legend).toBeVisible();
      if (expected === 'full') {
        expect(screen.getByText('Explanation')).toBeVisible();
      } else {
        if (expected === 'standard') expect(screen.getByRole('region', { name: '선택 요약' })).toBeVisible();
      }
      // Export stays on the toolbar at every chrome level for every kind (#2736).
      expect(within(screen.getByRole('toolbar')).getByRole('button', { name: '내보내기' })).toBeVisible();
      if (expected === 'full') { cleanup(); continue; }
      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      const more = screen.getByRole('dialog', { name: '더보기' });
      expect(within(more).queryByRole('button', { name: '내보내기' })).toBeNull();
      if (expected === 'minimal') expect(within(more).getByLabelText('범례')).toBeVisible();
      if (expected === 'standard') {
        expect(within(more).queryByLabelText('범례')).toBeNull();
        expect(within(more).queryByRole('region', { name: '선택 요약' })).toBeNull();
      }
      cleanup();
    }
  });
  it('keeps Frame series/status/bound keys and diagnostic notes outside More', () => {
    mount('frame', true, undefined, {
      bounds: new Map([['A', { lower: 0, upper: 3 }]]),
      pointStatus: () => ({ tone: 'warning', label: 'Check' }),
      markLines: [{ y: 2, label: 'Wrong unit', unit: 'ms' }],
    });
    const legend = screen.getByRole('group', { name: '범례' });
    expect(within(legend).getByRole('checkbox', { name: 'Series (s)' })).toBeVisible();
    expect(within(legend).getByText('Check')).toBeVisible();
    expect(legend.querySelectorAll('[data-chart-bound-legend]')).toHaveLength(3);
    expect(screen.getByText('Wrong unit 기준선은 단위가 달라 표시하지 않음')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog');
    expect(more.querySelector('[data-chart-notes]')).toBeNull();
    expect(within(more).queryByRole('group', { name: '범례' })).toBeNull();
  });
  it.each(['frame', 'heatmap', 'donut'])('%s defaults to a bottom legend with the caption last', kind => {
    mount(kind, true, undefined, { legendCaption: 'Context caption' });
    const layout = screen.getByTestId('chart-legend-layout');
    expect(layout).toHaveAttribute('data-legend-placement', 'bottom');
    const legend = screen.getByRole('group', { name: '범례' });
    expect(legend.lastElementChild).toHaveTextContent('Context caption');
    expect(layout.lastElementChild).toBe(legend);
    expect(layout.firstElementChild).toContainElement(screen.getByRole('img', { name: 'plot' }));
  });
  it.each(['top', 'bottom', 'side'] as const)('applies explicit %s placement to Frame and kinds', legendPlacement => {
    for (const kind of ['frame', 'heatmap', 'donut']) {
      mount(kind, true, undefined, { legendPlacement, legendCaption: 'Context caption' });
      const layout = screen.getByTestId('chart-legend-layout');
      expect(layout).toHaveAttribute('data-legend-placement', legendPlacement);
      expect(within(layout).getByText('Context caption')).toHaveAttribute('title', 'Context caption');
      const children = [...layout.children];
      const legend = screen.getByLabelText('범례');
      expect(children.indexOf(legend!)).toBe(legendPlacement === 'top' ? 0 : 1);
      expect(legend!.lastElementChild).toHaveTextContent('Context caption');
      expect(legend).toHaveClass(legendPlacement === 'side' ? 'flex-col' : 'whitespace-nowrap');
      cleanup();
    }
  });
  it.each(['frame', 'heatmap', 'donut'])('%s wraps the top/bottom legend row and compact summary instead of scrolling sideways', kind => {
    for (const legendPlacement of ['top', 'bottom'] as const) {
      mount(kind, true, undefined, { legendPlacement, legendCaption: 'Context caption' });
      for (const row of [screen.getByLabelText('범례'), screen.getByRole('region', { name: '선택 요약' })]) {
        expect(row).toHaveClass('flex-wrap', 'overflow-y-auto');
        expect(row).not.toHaveClass('overflow-x-auto');
      }
      cleanup();
    }
  });
  it.each(['frame', 'heatmap'])('%s reveals hover tools on focus and while More is open, keeping keyboard/AT access', async kind => {
    const user = userEvent.setup();
    mount(kind, true, undefined, { toolsReveal: 'hover' });
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.closest('header')).toHaveAttribute('data-tools-reveal', 'hover');
    expect(toolbar.closest('header')).toHaveClass('opacity-0', 'group-hover/chart:opacity-100', 'group-focus-within/chart:opacity-100');
    for (const button of within(toolbar).getAllByRole('button')) {
      expect(button).toBeVisible();
      expect(button).not.toHaveAttribute('tabindex', '-1');
    }
    const buttons = within(toolbar).getAllByRole('button');
    // The description is the first stop; every visually hidden primary tool still follows in DOM order.
    await user.tab();
    expect(screen.getByRole('button', { name: '차트 설명' })).toHaveFocus();
    for (const button of buttons.filter(button => !button.hasAttribute('disabled'))) {
      await user.tab();
      expect(button).toHaveFocus();
    }
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(toolbar.closest('header')).not.toHaveClass('opacity-0');
    expect(within(toolbar).getByRole('button', { name: '더보기' })).not.toHaveAttribute('tabindex', '-1');
  });
  it.each(['full', 'minimal'] as const)('%s ignores standard-only placement, caption and hover tools', chrome => {
    for (const kind of ['frame', 'heatmap', 'donut']) {
      mount(kind, true, chrome, { legendPlacement: 'side', toolsReveal: 'hover', legendCaption: 'Ignored caption' });
      expect(screen.queryByTestId('chart-legend-layout')).toBeNull();
      expect(document.querySelector('[data-tools-reveal=hover]')).toBeNull();
      expect(screen.queryByText('Ignored caption')).toBeNull();
      cleanup();
    }
  });
});

describe('standard chrome with legend={false} (#2416)', () => {
  it('draws no empty focusable 범례 group, and keeps the caption as plain text', () => {
    mount('frame', true, undefined, { legend: false });
    expect(screen.queryByRole('group', { name: '범례' })).toBeNull();
    expect(screen.queryByTestId('chart-legend-layout')).toBeNull();
    cleanup();
    mount('frame', true, undefined, { legend: false, legendCaption: 'Note' });
    expect(screen.getByText('Note')).toBeVisible();
    expect(screen.queryByRole('group', { name: '범례' })).toBeNull();
  });
  it('keeps the point gesture hint as plain text', () => {
    mount('frame', true, undefined, { legend: false, onPointClick: () => undefined });
    const hint = screen.getByText('클릭으로 선택 · ⌘/Shift+클릭으로 추가 · 더블클릭/Enter로 안쪽 단계');
    expect(hint).toBeVisible();
    expect(hint).toHaveRole('paragraph');
    expect(hint.closest('button, a, [role="button"], [role="link"], [tabindex]')).toBeNull();
    expect(screen.queryByRole('group', { name: '범례' })).toBeNull();
  });
  it('keeps the 범례 group when the legend is shown', () => {
    mount('frame', true);
    expect(screen.getByRole('group', { name: '범례' })).toBeVisible();
  });
});
