import type { ComponentType } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { EChart, type EChartProps } from './EChart';

// #915: a chart mounted after the EChartImpl chunk has loaded once (a drill step swaps the panel, a new pane opens) draws in its first
// commit. A per-mount lazy component re-suspended every time and waited out React's 300 ms fallback throttle (~400 ms per drill step).
const loads = vi.hoisted(() => ({ count: 0 }));

vi.mock('./EChartImpl', () => {
  loads.count++;
  return new Promise<{ default: ComponentType<EChartProps> }>(resolve => setTimeout(() => resolve({ default: MockImpl }), 0));
});

function MockImpl(props: EChartProps) {
  return <div data-testid="chart-plot" role="img" aria-label={props.ariaLabel} />;
}

afterEach(cleanup);

describe('EChart after the chunk has loaded (#915)', () => {
  it('draws a newly mounted chart without the loading fallback', async () => {
    const first = render(<I18nProvider><EChart option={{}} ariaLabel="first" /></I18nProvider>);
    await screen.findByTestId('chart-plot');
    first.unmount();

    render(<I18nProvider><EChart option={{}} ariaLabel="second" /></I18nProvider>);
    // First commit of the new mount: the plot is there and no aria-busy skeleton was drawn.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('img', { name: 'second' })).toBeInTheDocument();
  });
});
