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

describe('reduced motion holds in every accepted option shape (#297 F1, 06 §26)', () => {
  it('forces a single series object off, not just a top-level series array', () => {
    stubReducedMotion(true);
    render(<EChartImpl option={{
      animation: true, animationDuration: 400,
      series: { id: 'a', type: 'line', animation: true, data: [1, 2] },
    }} ariaLabel="plot" height={120} />);
    const merged = state.setOption.mock.calls[0][0];
    expect(merged.animation).toBe(false);
    expect(merged.series.animation).toBe(false);
    // Consumer content survives the override.
    expect(merged.series.data).toEqual([1, 2]);
    expect(merged.animationDuration).toBe(400);
  });

  it('forces the global and series animation off inside baseOption (echarts makes it the effective option)', () => {
    stubReducedMotion(true);
    render(<EChartImpl option={{
      baseOption: { animation: true, series: [{ id: 'a', type: 'line', animation: true, data: [1] }] },
    }} ariaLabel="plot" height={120} />);
    const merged = state.setOption.mock.calls[0][0];
    expect(merged.animation).toBe(false);
    expect(merged.baseOption.animation).toBe(false);
    expect(merged.baseOption.series[0].animation).toBe(false);
    expect(merged.baseOption.series[0].data).toEqual([1]);
  });

  it('forces global and series animation off inside every media[].option override', () => {
    stubReducedMotion(true);
    render(<EChartImpl option={{
      animation: true,
      series: [{ id: 'a', type: 'line', animation: true, data: [1] }],
      media: [
        { query: { maxWidth: 500 }, option: { animation: true, series: [{ id: 'a', type: 'line', animation: true, data: [2] }] } },
        { option: { animation: true } },
      ],
    }} ariaLabel="plot" height={120} />);
    const merged = state.setOption.mock.calls[0][0];
    expect(merged.animation).toBe(false);
    expect(merged.series.map((s: { animation?: boolean }) => s.animation)).toEqual([false]);
    expect(merged.media[0].option.animation).toBe(false);
    expect(merged.media[0].option.series[0].animation).toBe(false);
    expect(merged.media[0].option.series[0].data).toEqual([2]);
    expect(merged.media[1].option.animation).toBe(false);
  });

  it('keeps consumer single-object, baseOption and media animation when motion is allowed', () => {
    stubReducedMotion(false);
    render(<EChartImpl option={{
      animation: true,
      series: { id: 'a', type: 'line', animation: true, data: [1] },
      baseOption: { animation: true, series: [{ id: 'b', type: 'bar', animation: true }] },
      media: [{ option: { animation: true, series: { animation: true } } }],
    }} ariaLabel="plot" height={120} />);
    const merged = state.setOption.mock.calls[0][0];
    expect(merged.animation).toBe(true);
    expect(merged.series.animation).toBe(true);
    expect(merged.baseOption.animation).toBe(true);
    expect(merged.baseOption.series[0].animation).toBe(true);
    expect(merged.media[0].option.animation).toBe(true);
    expect(merged.media[0].option.series.animation).toBe(true);
  });

  it('never mutates the consumer option object', () => {
    stubReducedMotion(true);
    const input: EChartsCore.EChartsCoreOption = {
      animation: true,
      series: [{ id: 'a', type: 'line', animation: true, data: [1] }],
      baseOption: { animation: true, series: { type: 'line', animation: true } },
      media: [{ option: { animation: true, series: { animation: true } } }],
    };
    const snapshot = JSON.stringify(input);
    render(<EChartImpl option={input} ariaLabel="plot" height={120} />);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.animation).toBe(true);
    expect((input.series as { animation?: boolean }[])[0].animation).toBe(true);
    expect(input.baseOption && 'animation' in input.baseOption && input.baseOption.animation).toBe(true);
    expect(input.media && input.media[0].option.animation).toBe(true);
  });
});
