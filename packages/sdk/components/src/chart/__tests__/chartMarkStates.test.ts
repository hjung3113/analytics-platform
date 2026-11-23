import { expect, it } from 'vitest';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { CHART_ECHARTS_THEME, paintRangeBand, rangeBandFill, selectionRing } from '../chartMarks';
import { insideLabelStyle } from '../chartValueLabels';
import { chartPointKey } from '../chartStatus';
import { brushOptions } from '../analysisChartShared';
import { paretoData, scatterData } from '../analysisChartKinds';
import { topNData } from '../topNBar';
import type { ChartSeries } from '../AnalysisChartFrame';

// Hover, selection and range marks share one look on every chart (#2736); the numbers live in chartMarks.ts.
type Datum = { itemStyle?: Record<string, unknown>; emphasis?: { itemStyle?: Record<string, unknown> } };
type Series = { id: string; emphasis?: { focus?: string; lineStyle?: { width?: number }; itemStyle?: Record<string, unknown> }; data: unknown[]; markArea?: { data: [{ itemStyle?: { opacity?: number } }][] } };

const ROWS = ['R1', 'R2', 'R3'];
const line: ChartSeries = { id: 'l', name: 'L', color: 'chart-blue', points: ROWS.map((x, n) => [x, n + 1]) };
const dashed: ChartSeries = { ...line, id: 'd', name: 'D', dashed: true };
const bar: ChartSeries = { id: 'b', name: 'B', color: 'chart-blue', kind: 'bar', points: ROWS.map((x, n) => [x, n + 2]) };
const base = baselineInput();
const palette = { ...base.palette, series: [{ stroke: 'lStroke', fill: 'lFill' }, { stroke: 'dStroke', fill: 'dFill' }, { stroke: 'bStroke', fill: 'bFill' }], segmentText: [0, 1, 2].map(() => ({ color: 'x', chip: false })) };
const vertical = (extra = {}) => buildChartOption(baselineInput({
  displayed: [line, dashed, bar], horizontal: false, stacked: false, rowPitch: undefined, activeCategory: null, extremes: undefined, markLines: undefined, palette,
  ...extra,
})) as unknown as { series: Series[] };

it('marks the hovered series only: a wider line or a series-coloured bar edge, without dimming the others by default (#2342)', () => {
  const series = vertical().series;
  const byId = (id: string) => series.find(s => s.id === id)!;
  expect(byId('l').emphasis).toEqual({ focus: 'none', lineStyle: { width: 3 } });
  expect(byId('d').emphasis).toEqual({ focus: 'none', lineStyle: { width: 2.5 } });
  expect(byId('b').emphasis).toEqual({ focus: 'none', itemStyle: { borderColor: 'bStroke', borderWidth: 1 } });
});

it('dims the other series to 30%, not ECharts’ 10%, only on a chart that opts into dimming', () => {
  for (const kind of ['bar', 'line', 'scatter', 'pie', 'boxplot'] as const) {
    expect(CHART_ECHARTS_THEME[kind].blur.itemStyle.opacity).toBe(0.3);
  }
  expect(CHART_ECHARTS_THEME.line.blur.lineStyle.opacity).toBe(0.3);
  expect(vertical({ emphasisFocus: 'series' }).series.find(s => s.id === 'l')!.emphasis!.focus).toBe('series');
});

it('rings a selected point in the selection colour at 1.5px, keeps its fill and keeps the ring on hover', () => {
  const series = vertical({ selectedPointKeys: [chartPointKey({ seriesId: 'b', x: 'R2' })] }).series;
  const datum = series.find(s => s.id === 'b')!.data[1] as Datum;
  expect(datum.itemStyle).toEqual({ borderColor: 'sel', borderWidth: 1.5 });
  expect(datum.emphasis!.itemStyle).toEqual(datum.itemStyle);
  expect(series.find(s => s.id === 'b')!.data[0]).toBe(2);
});

it('draws the selection label once, in the selection colour with no text outline (#2790)', () => {
  const overlay = vertical({ selection: { from: 'R1', to: 'R2' } }).series.find(s => s.id === '__overlay')!;
  expect(overlay.markArea!.data).toHaveLength(1);
  // An inside label gets ECharts' default outline in the band colour, which reads as the word drawn twice; the card surface keeps the text readable.
  expect(overlay.markArea!.data[0][0]).toMatchObject({
    name: '선택',
    label: { position: 'insideBottom', color: 'sel', textBorderWidth: 0, backgroundColor: palette.labelSurface },
  });
});

it('draws every range band in the selection colour at 10%', () => {
  const overlay = vertical({ selection: { from: 'R1', to: 'R2' } }).series.find(s => s.id === '__overlay')!;
  expect(overlay.markArea!.data[0][0].itemStyle!.opacity).toBe(0.1);
  expect(rangeBandFill('rgb(1,2,3)')).toBe('rgba(1,2,3,0.1)');
  const brush = (brushOptions() as { brush: { brushStyle: { color: string; borderColor: string } } }).brush.brushStyle;
  expect(brush.color).toMatch(/^rgba\(.+,0\.1\)$/);
  expect(brush.color.replace('rgba', 'rgb').replace(',0.1)', ')')).toBe(brush.borderColor);
});

it('rings selected category marks at 1.5px on scatter, Pareto and Top N', () => {
  expect(selectionRing(true)).toBe(1.5);
  expect(selectionRing(false)).toBe(0);
  const keys = (p: { seriesKeys: (string | undefined)[][] }) => p.seriesKeys.flat().filter((k): k is string => k !== undefined);
  const ring = (option: unknown, index = 0) => ((option as { series: { data: Datum[] }[] }).series[index].data[0].itemStyle!.borderWidth);
  const scatter = scatterData({ kind: 'scatter', points: [{ id: 'a', x: 1, y: 2 }], xLabel: 'X', yLabel: 'Y', xUnit: 's' }, 'en', 'ea');
  expect(ring(scatter.option(keys(scatter)))).toBe(1.5);
  const pareto = paretoData({ kind: 'pareto', items: [{ id: 'a', label: 'A', value: 2 }, { id: 'b', label: 'B', value: 1 }] }, 'en', 's');
  expect(ring(pareto.option(keys(pareto)))).toBe(1.5);
  const topN = topNData({ kind: 'topNBar', items: [{ id: 'a', label: 'A', value: 2, colorToken: 'chart-series-1' }] }, 'en', 's');
  expect(ring(topN.option(keys(topN)))).toBe(1.5);
});

it('paints a canvas range band once: a 10% fill and a 2px outline inset by 1px, restoring the alpha it found', () => {
  const calls: string[] = [];
  const ctx = { globalAlpha: 0.5, fillRect: (...a: number[]) => calls.push(`fill ${a.join(',')} @${ctx.globalAlpha}`), strokeRect: (...a: number[]) => calls.push(`stroke ${a.join(',')} w${ctx.lineWidth}`) } as unknown as CanvasRenderingContext2D & { lineWidth: number };
  paintRangeBand(ctx, 'rgb(1,2,3)', 10, 30, 100);
  expect(calls).toEqual(['fill 10,0,20,100 @0.1', 'stroke 10,1,20,98 w2']);
  expect(ctx.globalAlpha).toBe(0.5);
});

it('puts an inside label on a surface chip only when its fill asks for one', () => {
  expect(insideLabelStyle({ color: 'white', chip: false }, 'card')).toEqual({ color: 'white' });
  expect(insideLabelStyle({ color: 'ink', chip: true }, 'card')).toEqual({ color: 'ink', backgroundColor: 'card', borderRadius: 2, padding: 0 });
});
