import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChart, type ChartSpec } from './AnalysisChart';
import type { EChartProps } from './EChart';

let plot: EChartProps;
// Keep readiness under test control, including delayed readiness of a replacement renderer.
vi.mock('./EChart', async importOriginal => ({
  ...await importOriginal<typeof import('./EChart')>(),
  EChart: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; },
}));
function mount(spec: ChartSpec, canExport = false, hasRoute = true) {
  window.history.replaceState(null, '', hasRoute ? '/?v=1&scopeId=MEM' : '/missing?v=1&scopeId=MEM');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: 'G', en: 'G' }, icon: House, space: 'analytics' }], menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: canExport, compare: true, annotate: true, savedView: false }, pageKeys: [] }] });
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const wrap = (next: ChartSpec) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><AnalysisChart chartId="test" title="Chart" unit="ea" spec={next} /></PlatformProvider></I18nProvider>;
  const view = render(wrap(spec));
  return { ...view, update: (next: ChartSpec) => view.rerender(wrap(next)) };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const scatter = { kind: 'scatter', xUnit: 's', xLabel: 'X', yLabel: 'Y', points: [{ id: 'a', label: 'Alpha', x: 1, y: 2 }, { id: 'b', label: 'Beta', x: 3, y: 4 }] } satisfies ChartSpec;
const stats = { min: 1, q1: 2, median: 3, q3: 4, max: 5 };
const box = { kind: 'boxPlot', whisker: 'minMax', groups: [{ id: 'a', label: 'Alpha', stats }, { id: 'b', label: 'Beta', stats }] } satisfies ChartSpec;
it.each(['empty', 'kind'] as const)('replays pre-enabled scatter drag on delayed readiness after a %s round trip', async roundTrip => {
  const view = mount(scatter); await screen.findByRole('img');
  act(() => plot.onReady?.({ dispatchAction: vi.fn() } as never));
  fireEvent.click(screen.getByRole('button', { name: '끌어서 선택' }));
  view.update(roundTrip === 'empty' ? { ...scatter, points: [] } : box);
  view.update(scatter); await screen.findByRole('img');
  if (roundTrip === 'kind') fireEvent.click(screen.getByRole('button', { name: '끌어서 선택' }));
  expect(screen.getByRole('button', { name: '끌어서 선택' })).toHaveAttribute('aria-pressed', 'true');
  const dispatchAction = vi.fn();
  act(() => plot.onReady?.({ dispatchAction } as never));
  expect(dispatchAction).toHaveBeenCalledWith({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect', brushMode: 'single' } }, { silent: true });
});
