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
        if (expected === 'standard') {
          if (kind === 'frame') {
            expect(screen.queryByRole('region', { name: '선택 요약' })).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
            const editor = screen.getByRole('dialog', { name: '시작과 끝으로 구간 선택' });
            fireEvent.click(within(editor).getByRole('button', { name: '선택' }));
          }
          expect(screen.getByRole('region', { name: '선택 요약' })).toBeVisible();
        }
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
      // Side keys sit in a column as wide as the longest name, 128px up to min(224px, 40% of the row) (#2889).
      const keys = legendPlacement === 'side' ? screen.getByTestId('chart-side-legend') : legend;
      if (legendPlacement === 'side') expect(keys).toHaveClass('w-max', 'min-w-32', 'max-w-[min(14rem,40%)]', 'shrink-0');
      expect(children.indexOf(keys)).toBe(legendPlacement === 'top' ? 0 : 1);
      expect(legend!.lastElementChild).toHaveTextContent('Context caption');
      expect(legend).toHaveClass(legendPlacement === 'side' ? 'flex-col' : 'whitespace-nowrap');
      cleanup();
    }
  });
  it('keeps a fixed-size side legend visible with its own height; only a fill row zeroes it (#2889)', () => {
    for (const kind of ['frame', 'heatmap', 'donut']) {
      mount(kind, true, undefined, { legendPlacement: 'side', size: 'regular', height: 240 });
      const keys = screen.getByTestId('chart-side-legend');
      expect(keys).toHaveClass('w-max', 'min-w-32');
      expect(keys).not.toHaveClass('h-0');
      expect(keys).not.toHaveClass('min-h-full');
      cleanup();
    }
    mount('frame', true, undefined, { legendPlacement: 'side' });
    expect(screen.getByTestId('chart-side-legend')).toHaveClass('h-0', 'min-h-full');
  });
  it('a fitted donut takes its side keys out of the row height without zeroing them (#2933, #2889)', () => {
    const slices = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, label: `Slice ${i}`, value: i + 1 }));
    // An unbounded container: the keys get the row's height (0px basis on a stretched column), never their own.
    render(<I18nProvider><div><AnalysisChart chartId="chart" title="Chart" unit="s" size="fill" chrome="standard" legendPlacement="side" spec={{ kind: 'donut', slices }} /></div></I18nProvider>);
    const column = screen.getByTestId('chart-side-legend');
    expect(screen.getByRole('group', { name: '범례' })).toHaveClass('flex-1', 'basis-0', 'min-h-0', 'overflow-y-auto');
    // A 0 height of its own collapses the keys where the row height is not set (#2889 review): the column keeps auto height.
    expect(column).not.toHaveClass('h-0');
    expect(column).not.toHaveClass('min-h-full');
    expect(screen.getByRole('region', { name: 'Chart' })).toHaveClass('min-h-64');
    cleanup();
    // Other side lists keep their 0% basis: a fill row zeroes the column instead, a fixed-size row keeps the keys' own height.
    for (const extra of [{}, { size: 'regular', height: 240 }]) {
      for (const kind of ['frame', 'heatmap']) {
        mount(kind, true, undefined, { legendPlacement: 'side', ...extra });
        expect(screen.getByRole('group', { name: '범례' })).not.toHaveClass('basis-0');
        cleanup();
      }
    }
    mount('donut', true, undefined, { legendPlacement: 'side', size: 'regular', height: 240 });
    expect(screen.getByRole('group', { name: '범례' })).not.toHaveClass('basis-0');
  });
  it('never squeezes side legend rows; the list scrolls instead (#2889)', () => {
    mount('heatmap', true, undefined, { legendPlacement: 'side' });
    expect(screen.getByRole('group', { name: '범례' })).toHaveClass('[&>*]:shrink-0', 'overflow-y-auto');
  });
  it('ellipsizes a long heatmap null label and keeps its full name (#2889)', () => {
    const nullLabel = '측정되지 않은 구간 — 장비가 꺼져 있거나 수집이 멈춘 시간';
    render(<I18nProvider><InWorkspacePanelProvider value>
      <AnalysisChart chartId="chart" title="Chart" description="Explanation" unit="s" size="fill" legendPlacement="side" spec={{ ...specs.heatmap, nullLabel } as ChartSpec} />
    </InWorkspacePanelProvider></I18nProvider>);
    const name = within(screen.getByRole('group', { name: '범례' })).getByText(nullLabel);
    expect(name).toHaveAttribute('title', nullLabel);
    expect(name).toHaveClass('truncate', 'min-w-0');
  });
  it.each(['frame', 'heatmap', 'donut'])('%s wraps the top/bottom legend and uses the summary layout for its chart kind', kind => {
    for (const legendPlacement of ['top', 'bottom'] as const) {
      mount(kind, true, undefined, { legendPlacement, legendCaption: 'Context caption' });
      const legend = screen.getByLabelText('범례');
      const wrappingRows = [legend];
      if (kind === 'frame') {
        expect(screen.queryByRole('region', { name: '선택 요약' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
        const editor = screen.getByRole('dialog', { name: '시작과 끝으로 구간 선택' });
        fireEvent.click(within(editor).getByRole('button', { name: '선택' }));
        const rangeLabel = screen.getByText(/선택 구간:/);
        expect(rangeLabel.closest('[data-reveal-x]')).not.toHaveClass('overflow-x-auto');
        expect(rangeLabel.parentElement).toHaveClass('flex-wrap');
      } else {
        wrappingRows.push(screen.getByRole('region', { name: '선택 요약' }));
      }
      for (const row of wrappingRows) {
        expect(row).toHaveClass('flex-wrap', 'overflow-y-auto');
        expect(row).not.toHaveClass('overflow-x-auto');
      }
      cleanup();
    }
  });
  it.each(['side', 'top', 'bottom'] as const)('%s Frame legend truncates long series labels and keeps the full checkbox name', legendPlacement => {
    const name = 'MEM-PHOTO-0103';
    render(<I18nProvider>
      <AnalysisChartFrame chartId="chart" title="Chart" unit="s" xType="category" chrome="standard"
        legendPlacement={legendPlacement} series={[{ ...series[0], name }]} />
    </I18nProvider>);
    const legend = screen.getByRole('group', { name: '범례' });
    const checkbox = within(legend).getByRole('checkbox', { name: `${name} (s)` });
    const label = within(legend).getByText(`${name} (s)`);
    expect(label).toHaveClass('truncate');
    expect(label).toHaveAttribute('title', name);
    expect(checkbox.closest('label')).toContainElement(label);
  });
  it('keeps the full name and metrics in a truncatable AnalysisChart side legend', () => {
    const name = 'Equipment with a long identifier';
    render(<I18nProvider>
      <AnalysisChart chartId="chart" title="Chart" unit="s" chrome="standard" legendPlacement="side"
        spec={{ kind: 'donut', slices: [{ id: 'a', label: name, value: 2 }] }} />
    </I18nProvider>);
    const legend = screen.getByRole('group', { name: '범례' });
    const label = within(legend).getByText(`${name} · 2 s · 100%`);
    expect(label).toHaveClass('truncate');
    expect(label).toHaveAttribute('title', name);
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
