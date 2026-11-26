import type { ReactNode } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EChartsCore from 'echarts/core';
import { init } from 'echarts/core';
import EChartImpl from '../EChartImpl';
import { DeclaredQueryPanelContext } from '../../workspace/panelContext';

type EChartsModule = typeof EChartsCore;

// The real EChartImpl runs, but the echarts instance is fake: init is mocked, setOption calls are recorded.
const state = vi.hoisted(() => ({ setOption: vi.fn(), width: 640, handlers: new Map<string, (event: unknown) => void>() }));

vi.mock('echarts/core', async importOriginal => {
  const actual = await importOriginal<EChartsModule>();
  return {
    ...actual,
    init: vi.fn(() => ({
      setOption: state.setOption,
      on: vi.fn((name: string, handler: (event: unknown) => void) => { state.handlers.set(name, handler); }),
      off: vi.fn(), resize: vi.fn(), dispose: vi.fn(), dispatchAction: vi.fn(), getWidth: () => state.width,
    })),
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

beforeEach(() => { state.setOption.mockClear(); state.handlers.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('EChartImpl typography (#2726)', () => {
  it('floors positive label sizes across option shapes and preserves series data and consumer options', () => {
    const data = [{ value: 1, label: { fontSize: 9 } }];
    const label = Object.freeze({ fontSize: 9, rich: { strong: { fontSize: 16 }, yielded: { fontSize: 0 } } });
    const mark = { data: [[{ label: { fontSize: 9 } }, { label: { fontSize: 16 } }]] };
    const input = {
      series: { type: 'bar', label, data, markLine: mark, emphasis: { label: { fontSize: 0 } } },
      baseOption: { series: [{ type: 'bar', label }] },
      media: [{ option: { series: { type: 'bar', label } } }],
    };
    const original = JSON.stringify(input);
    render(<EChartImpl option={input} ariaLabel="plot" />);
    const merged = state.setOption.mock.calls[0][0];
    const expected = { fontSize: 12, rich: { strong: { fontSize: 16 }, yielded: { fontSize: 0 } } };
    expect(merged.series.label).toEqual(expected);
    expect(merged.series.emphasis.label.fontSize).toBe(0);
    expect(merged.series.markLine.data[0]).toEqual([{ label: { fontSize: 12 } }, { label: { fontSize: 16 } }]);
    expect(merged.series.data).toBe(data);
    expect(merged.baseOption.series[0].label).toEqual(expected);
    expect(merged.media[0].option.series.label).toEqual(expected);
    expect(JSON.stringify(input)).toBe(original);
  });

  it('updates axis defaults on the mounted engine while preserving explicit styles and zoom', async () => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    vi.mocked(init).mockClear();
    const input = {
      xAxis: { type: 'category', axisLabel: { fontSize: 9, fontWeight: 600 } },
      yAxis: [{ name: 'Value', nameTextStyle: { color: 'currentColor' } }],
      dataZoom: [{ type: 'inside', start: 10, end: 90 }],
      series: [{ type: 'bar', data: [1] }],
    };
    try {
      render(<>
        <style>{`
          [aria-label="axis-plot"] { --text-caption: 12px; --text-secondary: 55 65 81; }
          [data-theme="chart-typography-test"] [aria-label="axis-plot"] { --text-caption: 14px; --text-secondary: 61 71 91; }
        `}</style>
        <EChartImpl option={input} ariaLabel="axis-plot" />
      </>);
      expect(init).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
        categoryAxis: { axisTick: { show: false }, splitLine: { show: false } },
      }), { renderer: 'canvas' });
      expect(state.setOption.mock.lastCall?.[0].xAxis.nameTextStyle).toEqual({ fontSize: 12, fontWeight: 400, color: 'rgb(55,65,81)' });
      root.setAttribute('data-theme', 'chart-typography-test');
      await waitFor(() => {
        const [next, mode] = state.setOption.mock.lastCall!;
        expect(next.xAxis[0].axisLabel).toEqual({ fontSize: 9, fontWeight: 600, color: 'rgb(61,71,91)' });
        expect(next.xAxis[0].nameTextStyle).toEqual({ fontSize: 14, fontWeight: 400, color: 'rgb(61,71,91)' });
        expect(next.yAxis[0].nameTextStyle).toEqual({ fontSize: 14, fontWeight: 400, color: 'currentColor' });
        // Only the axis typography is sent, merged: no series, zoom or other declaration is replayed.
        expect(Object.keys(next).sort()).toEqual(['xAxis', 'yAxis']);
        expect(mode).toEqual({ notMerge: false, silent: true });
      });
      expect(init).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      if (previousTheme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', previousTheme);
    }
  });
});

describe('EChartImpl typography on compound options (#2726 review 2)', () => {
  it('keeps baseOption and media zoom out of a theme-only redraw, and a new option still sets the range', async () => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    const input = {
      baseOption: { xAxis: { type: 'category' }, dataZoom: [{ type: 'inside', start: 0, end: 100 }], series: [{ type: 'bar', data: [1] }] },
      media: [{ query: { minWidth: 1 }, option: { dataZoom: [{ start: 0, end: 50 }] } }],
    };
    try {
      const { rerender } = render(<EChartImpl option={input} ariaLabel="zoom-plot" />);
      const calls = state.setOption.mock.calls.length;
      root.setAttribute('data-theme', 'compound-zoom-test');
      await waitFor(() => expect(state.setOption.mock.calls.length).toBeGreaterThan(calls));
      const [patch] = state.setOption.mock.lastCall!;
      expect(JSON.stringify(patch)).not.toContain('dataZoom');
      expect(patch).not.toHaveProperty('baseOption');
      expect(patch).not.toHaveProperty('media');
      const changed = { ...input, baseOption: { ...input.baseOption, dataZoom: [{ type: 'inside', start: 20, end: 60 }] } };
      rerender(<EChartImpl option={changed} ariaLabel="zoom-plot" />);
      expect(state.setOption.mock.lastCall![0].baseOption.dataZoom).toEqual([{ type: 'inside', start: 20, end: 60 }]);
    } finally {
      cleanup();
      if (previousTheme === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', previousTheme);
    }
  });

  it('styles a frozen class-backed baseOption without writing to it', () => {
    class Base { xAxis = { type: 'category' }; series = [{ type: 'bar', data: [1] }]; }
    const base = Object.freeze(new Base());
    render(<EChartImpl option={{ baseOption: base as unknown as EChartsCore.EChartsCoreOption }} ariaLabel="frozen-plot" />);
    const sent = state.setOption.mock.calls[0][0];
    expect(sent.baseOption.xAxis.axisLabel).toEqual(expect.objectContaining({ fontWeight: 400 }));
    expect(base.xAxis).toEqual({ type: 'category' });
  });

  it('gives a media-added axis the defaults and leaves a branch patch to an existing axis sparse', () => {
    const input = {
      baseOption: { yAxis: [{ id: 'left', type: 'value', axisLabel: { fontWeight: 600 } }], series: [{ type: 'line', data: [1] }] },
      media: [{ query: { minWidth: 1 }, option: { yAxis: [{ id: 'left', axisLabel: { color: 'red' } }, { id: 'right', type: 'value' }] } }],
    };
    render(<EChartImpl option={input} ariaLabel="media-plot" />);
    const [left, right] = state.setOption.mock.calls[0][0].media[0].option.yAxis;
    expect(left).toEqual({ id: 'left', axisLabel: { color: 'red' } });
    expect(right.axisLabel).toEqual(expect.objectContaining({ fontWeight: 400 }));
    expect(right.nameTextStyle).toEqual(expect.objectContaining({ fontWeight: 400 }));
    expect(input.media[0].option.yAxis[1]).toEqual({ id: 'right', type: 'value' });
  });
});

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

describe('EChartImpl resize (#399 F3)', () => {
  it('reports the new plot width after its container resizes', () => {
    stubReducedMotion(false);
    let notify: () => void = () => {};
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { notify = cb; } observe() {} disconnect() {} });
    const onResize = vi.fn();
    render(<EChartImpl option={option} ariaLabel="plot" height={120} onResize={onResize} />);
    expect(onResize).not.toHaveBeenCalled();
    state.width = 320;
    notify();
    expect(onResize).toHaveBeenCalledWith(320);
    state.width = 640;
  });
});

describe('re-render keeps the inside dataZoom and brush (#705, #808)', () => {
  const zoomed: EChartsCore.EChartsCoreOption = { grid: { left: 52 }, brush: { xAxisIndex: 0, brushType: 'lineX' }, xAxis: { type: 'time' }, yAxis: {}, dataZoom: [{ type: 'inside', xAxisIndex: 0, start: 10, end: 90 }], series: [{ id: 'a', type: 'line', data: [[1, 2]] }] };
  it('rebuilds the first option, then empties the series and replace-merges everything but dataZoom, grid and brush', () => {
    stubReducedMotion(false);
    const { rerender } = render(<EChartImpl option={zoomed} ariaLabel="plot" height={120} />);
    expect(state.setOption.mock.calls[0][1]).toEqual({ notMerge: true });
    rerender(<EChartImpl option={{ ...zoomed, dataZoom: [{ type: 'inside', xAxisIndex: 0, start: 20, end: 80 }] }} ariaLabel="plot" height={120} />);
    expect(state.setOption.mock.calls[1]).toEqual([{ series: [] }, { replaceMerge: ['series'], silent: true, lazyUpdate: true }]);
    const mode = state.setOption.mock.calls[2][1] as { replaceMerge: string[] };
    expect(mode.replaceMerge).toEqual(expect.arrayContaining(['series', 'xAxis', 'yAxis']));
    expect(mode.replaceMerge).not.toEqual(expect.arrayContaining(['dataZoom']));
    expect(mode.replaceMerge).not.toEqual(expect.arrayContaining(['grid']));
    expect(mode.replaceMerge).not.toEqual(expect.arrayContaining(['brush']));
  });
  it('rebuilds when the dataZoom goes away', () => {
    stubReducedMotion(false);
    const { rerender } = render(<EChartImpl option={zoomed} ariaLabel="plot" height={120} />);
    rerender(<EChartImpl option={{ ...zoomed, dataZoom: [] }} ariaLabel="plot" height={120} />);
    expect(state.setOption.mock.calls[1][1]).toEqual({ notMerge: true });
    expect(state.setOption).toHaveBeenCalledTimes(2);
  });
});

describe('declared panel skips an equal drawing (#3094)', () => {
  const drawn = { series: [{ id: 'a', type: 'line' as const, data: [[1, 2]] }] };
  const declared = (child: ReactNode, lang = 'ko') => <DeclaredQueryPanelContext.Provider value={{ trust: null, lang }}>{child}</DeclaredQueryPanelContext.Provider>;
  it('skips setOption for equal inputs and still calls the latest click handler', () => {
    stubReducedMotion(false);
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(declared(<EChartImpl option={drawn} onEvents={{ click: first }} ariaLabel="plot" />));
    const calls = state.setOption.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    rerender(declared(<EChartImpl option={{ series: [{ id: 'a', type: 'line', data: [[1, 2]] }] }} onEvents={{ click: second }} ariaLabel="plot" />));
    expect(state.setOption).toHaveBeenCalledTimes(calls);
    state.handlers.get('click')?.({});
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });
  it('still setOption when the series data changes', () => {
    stubReducedMotion(false);
    const { rerender } = render(declared(<EChartImpl option={drawn} ariaLabel="plot" />));
    const calls = state.setOption.mock.calls.length;
    rerender(declared(<EChartImpl option={{ series: [{ id: 'a', type: 'line', data: [[1, 9]] }] }} ariaLabel="plot" />));
    expect(state.setOption.mock.calls.length).toBeGreaterThan(calls);
  });
  it('still setOption for equal inputs after a language change (formatters carry the language)', () => {
    stubReducedMotion(false);
    const { rerender } = render(declared(<EChartImpl option={drawn} ariaLabel="plot" />));
    const calls = state.setOption.mock.calls.length;
    rerender(declared(<EChartImpl option={{ series: [{ id: 'a', type: 'line', data: [[1, 2]] }] }} ariaLabel="plot" />, 'en'));
    expect(state.setOption.mock.calls.length).toBeGreaterThan(calls);
  });
  it('still setOption for equal inputs outside a declared panel', () => {
    stubReducedMotion(false);
    const { rerender } = render(<EChartImpl option={drawn} ariaLabel="plot" />);
    const calls = state.setOption.mock.calls.length;
    rerender(<EChartImpl option={{ series: [{ id: 'a', type: 'line', data: [[1, 2]] }] }} ariaLabel="plot" />);
    expect(state.setOption.mock.calls.length).toBeGreaterThan(calls);
  });
});
