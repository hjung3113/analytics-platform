import { mount as mountChart } from './__tests__/test-support';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { type ChartSpec } from './AnalysisChart';
import type { EChartProps } from './EChart';

const mount = (spec: ChartSpec, canExport = false, hasRoute = true) => mountChart(spec, canExport, hasRoute, false);
let plot: EChartProps;
// Keep readiness under test control, including delayed readiness of a replacement renderer.
vi.mock('./EChart', async importOriginal => ({
  ...await importOriginal<typeof import('./EChart')>(),
  EChart: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; },
}));
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
