import { useEffect, type ComponentType } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ECharts } from 'echarts/core';
import { I18nProvider } from '@ap/kernel';
import { EChart, type EChartProps } from './EChart';

// Regression test for the #48 P2 finding: a rejected EChartImpl chunk import must not escape
// Suspense and unmount the app. EChart catches it chart-locally, shows the danger StateMessage
// and retries by recreating the lazy import. Mocks the './EChartImpl' chunk import itself.
const implState = vi.hoisted(() => ({
  mode: 'reject' as 'reject' | 'resolve',
  instances: 0,
}));

vi.mock('./EChartImpl', () => {
  if (implState.mode === 'reject') return Promise.reject(new Error('Failed to fetch dynamically imported module: EChartImpl'));
  // new Promise form: @ap/tsconfig base lib is ES2022, so Promise.withResolvers is unavailable.
  return new Promise<{ default: ComponentType<EChartProps> }>(resolve => setTimeout(() => resolve({ default: MockImpl }), 0));
});

/** Stand-in for the real EChartImpl: reports readiness through onReady like the real one does. */
function MockImpl(props: EChartProps) {
  useEffect(() => {
    implState.instances++;
    props.onReady?.({ dispose: () => {} } as unknown as ECharts);
  }, []);
  return <div data-testid="chart-plot" role="img" aria-label={props.ariaLabel} style={{ height: props.height, width: '100%' }} />;
}

afterEach(cleanup);

describe('EChart chunk load failure (P2)', () => {
  it('shows a chart-local error state, keeps siblings mounted, and renders the chart after retry', async () => {
    render(<I18nProvider>
      <div data-testid="sibling">sibling-content</div>
      <EChart option={{}} height={240} ariaLabel="chart" />
    </I18nProvider>);

    // Rejected import → chart-local danger state (StateMessage renders role="alert") with a retry action.
    const alert = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(screen.getByTestId('sibling')).toHaveTextContent('sibling-content');

    implState.mode = 'resolve';
    fireEvent.click(within(alert).getByRole('button'));
    await screen.findByTestId('chart-plot', {}, { timeout: 2000 });
    expect(implState.instances).toBe(1);
  });
});
