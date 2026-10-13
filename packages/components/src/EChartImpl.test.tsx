import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EChartsCore from 'echarts/core';
import EChartImpl from './EChartImpl';

type EChartsModule = typeof EChartsCore;

// The real EChartImpl runs, but the echarts instance is fake: init is mocked, setOption calls are recorded.
const state = vi.hoisted(() => ({ setOption: vi.fn() }));

vi.mock('echarts/core', async importOriginal => {
  const actual = await importOriginal<EChartsModule>();
  return {
    ...actual,
    init: vi.fn(() => ({ setOption: state.setOption, on: vi.fn(), off: vi.fn(), resize: vi.fn(), dispose: vi.fn(), dispatchAction: vi.fn() })),
  };
});

/** prefersReducedMotion reads window.matchMedia at every setOption, so the stub flips per phase. */
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query === '(prefers-reduced-motion: reduce)',
  })));
}

const option: EChartsCore.EChartsCoreOption = {
  animation: true,
  animationDuration: 400,
  series: [
    { id: 'a', type: 'line', animation: true, data: [[1, 2]] },
    { id: 'b', type: 'bar', animation: true, data: [3] },
  ],
};

beforeEach(() => { state.setOption.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('EChartImpl reduced-motion (#297, 06 §26)', () => {
  it('forces the global and each series animation off after the consumer merge when the OS asks for reduced motion', () => {
    stubReducedMotion(true);
    render(<EChartImpl option={option} ariaLabel="plot" height={120} />);
    expect(state.setOption).toHaveBeenCalledTimes(1);
    const merged = state.setOption.mock.calls[0][0];
    expect(merged.animation).toBe(false);
    expect(merged.series.map((s: { animation?: boolean }) => s.animation)).toEqual([false, false]);
    // Consumer content survives the override; the impl defaults still apply.
    expect(merged.animationDuration).toBe(400);
    expect(merged.useUTC).toBe(true);
    expect(merged.series[0].data).toEqual([[1, 2]]);
  });

  it('keeps consumer animation on when motion is allowed', () => {
    stubReducedMotion(false);
    render(<EChartImpl option={option} ariaLabel="plot" height={120} />);
    const merged = state.setOption.mock.calls[0][0];
    expect(merged.animation).toBe(true);
    expect(merged.series.map((s: { animation?: boolean }) => s.animation)).toEqual([true, true]);
  });

  it('preserves a consumer opt-out when motion is allowed', () => {
    stubReducedMotion(false);
    render(<EChartImpl option={{ animation: false, animationDuration: 0, series: [{ id: 'a', type: 'line' }] }} ariaLabel="plot" />);
    const merged = state.setOption.mock.calls[0][0];
    expect(merged.animation).toBe(false);
    expect(merged.animationDuration).toBe(0);
    expect(merged.series[0]).not.toHaveProperty('animation');
  });

  it('re-reads the preference on every setOption and reflects it on rerender', () => {
    stubReducedMotion(true);
    const updated: EChartsCore.EChartsCoreOption = { ...option, animationDuration: 200 };
    const { rerender } = render(<EChartImpl option={option} ariaLabel="plot" height={120} />);
    stubReducedMotion(false);
    rerender(<EChartImpl option={updated} ariaLabel="plot" height={120} />);
    expect(state.setOption.mock.calls[1][0].animation).toBe(true);
    stubReducedMotion(true);
    rerender(<EChartImpl option={{ ...updated }} ariaLabel="plot" height={120} />);
    expect(state.setOption.mock.calls[2][0].animation).toBe(false);
    expect(state.setOption.mock.calls[2][0].animationDuration).toBe(200);
  });
});
