// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { AnalysisChartProps } from '@ap/components';
import type { HwTimeDistribution } from '../../../endpoints';
import type { HwTimeFilter } from '../../../shared/useHwTimeFilter';
import { DistributionPanel } from '../DistributionPanel';

const fixture: HwTimeDistribution = {
  bins: [{ start: 1, end: 2, count: 3 }, { start: 2, end: 3, count: 1000 }, { start: 3, end: 4, count: 0 }, { start: 4, end: 5, count: 237 }, { start: 5, end: 6, count: 0 }],
  total: 1240, equipment: 24, bounds: { lower: 2, upper: 4 },
};
const query = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@ap/kernel', async importOriginal => ({ ...await importOriginal<typeof import('@ap/kernel')>(), useMenuQuery: query.read }));
vi.mock('@ap/components', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/components')>(),
  QueryView: ({ children }: { children: (data: HwTimeDistribution) => React.ReactNode }) => children(fixture),
  AnalysisChart: (props: AnalysisChartProps) => <div data-testid="chart">{JSON.stringify({
    ...props, spec: { ...props.spec, statuses: props.spec.kind === 'histogram' ? props.spec.bins?.map(bin => props.spec.kind === 'histogram' && props.spec.binStatus?.(bin)) : [] },
  })}</div>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const filter = (modules = ['PM2'], motions = ['Pump']): Pick<HwTimeFilter, 'selectionFor'> => ({ selectionFor: () => ({ modules, motions }) });
const input = { drillModule: 'PM2', drillMotion: 'Pump', trend: 'PM1/Vent' };
describe('distribution panel', () => {
  it('draws received bins, caption, both references and only nonempty out-of-bound status bins', () => {
    render(<I18nProvider><DistributionPanel input={input} filter={filter()} /></I18nProvider>);
    const chart = JSON.parse(screen.getByTestId('chart').textContent!);
    expect(chart).toMatchObject({ title: '분포', legendCaption: 'PM2 · Pump 회차 1,240개 · 설비 24', unit: '회차', size: 'fill', legendPlacement: 'bottom', toolsReveal: 'always' });
    expect(chart.spec).toMatchObject({ kind: 'histogram', bins: fixture.bins, xUnit: '초', xLabel: '회차별' });
    expect(chart.spec).not.toHaveProperty('values');
    expect(chart.spec.referenceLines).toEqual([
      { id: 'htm-upper', value: 4, label: 'HTM 상한 4s', tone: 'danger' },
      { id: 'htm-lower', value: 2, label: 'HTM 하한 2s', tone: 'warning' },
    ]);
    expect(chart.spec.statuses).toEqual([{ tone: 'warning', label: '하한 미달' }, null, null, { tone: 'danger', label: '상한 초과' }, null]);
    expect(query.read.mock.calls[0]![1]).toEqual({ moduleType: 'PM', drillModule: 'PM2', drillMotion: 'Pump' });
  });
  it('passes the linked verdict and date to the query', () => {
    render(<I18nProvider><DistributionPanel input={{ ...input, verdict: 'over', date: '2026-09-20' }} filter={filter()} /></I18nProvider>);
    expect(query.read.mock.calls[0]![1]).toEqual({ moduleType: 'PM', drillModule: 'PM2', drillMotion: 'Pump', verdict: 'over', date: '2026-09-20' });
  });
  it.each([[[], ['Pump']], [['PM2'], []]])('hides a target unchecked in %j / %j', (modules, motions) => {
    const { container } = render(<I18nProvider><DistributionPanel input={input} filter={filter(modules, motions)} /></I18nProvider>);
    expect(container.querySelector('[hidden]')).toBeTruthy();
  });
  it('uses trend when no drill is present and shows no chart without any target', () => {
    const { rerender } = render(<I18nProvider><DistributionPanel input={{ trend: 'PM2/Pump' }} filter={filter()} /></I18nProvider>);
    expect(query.read.mock.calls[0]![1]).toEqual({ moduleType: 'PM', drillModule: 'PM2', drillMotion: 'Pump' });
    rerender(<I18nProvider><DistributionPanel input={{}} filter={filter()} /></I18nProvider>);
    expect(screen.queryByTestId('chart')).toBeNull();
  });
  it('omits reference lines and statuses when the server has no HTM criteria', () => {
    const bounds = fixture.bounds;
    fixture.bounds = { lower: null, upper: null };
    try {
      render(<I18nProvider><DistributionPanel input={input} filter={filter()} /></I18nProvider>);
      const spec = JSON.parse(screen.getByTestId('chart').textContent!).spec;
      expect(spec.referenceLines).toEqual([]);
      expect(spec.statuses).toEqual([null, null, null, null, null]);
    } finally { fixture.bounds = bounds; }
  });
});
