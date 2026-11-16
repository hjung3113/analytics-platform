// @vitest-environment node
import * as echarts from 'echarts/core';
import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette, type ChartOptionInput } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';

echarts.use([BarChart, CustomChart, LineChart, ScatterChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, LabelLayout, SVGRenderer]);
function draw(extra: Partial<ChartOptionInput>) {
  const input = baselineInput(extra);
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 260 });
  try {
    chart.setOption({ ...buildChartOption({ ...input, palette: resolveChartPalette(input.displayed) }), animation: false });
    return chart.renderToSVGString();
  } finally { chart.dispose(); }
}
const rowGroups = { header: '설비', byCategory: new Map([
  ['R1', { group: 'EQ1', label: 'PM1' }], ['R2', { group: 'EQ1', label: 'PM2' }], ['R3', { group: 'EQ2', label: 'PM1' }], ['R4', { group: 'EQ1', label: 'PM3' }],
]) };
const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
describe('ECharts draws the reading aids (#2326)', () => {
  it.each([26, undefined])('draws one group label per run and short labels, rowPitch=%s', rowPitch => {
    const drawn = texts(draw({ rowGroups, rowPitch }));
    expect(drawn.filter(t => t === 'EQ1')).toHaveLength(2);
    expect(drawn.filter(t => t === 'EQ2')).toHaveLength(1);
    expect(drawn).toContain('PM2');
    expect(drawn).not.toContain('R2');
  });
  it('keeps a partially zoomed group and excludes group runs outside the zoom window', () => {
    const drawn = texts(draw({ rowGroups, rowPitch: undefined, zoom: [25, 66] }));
    expect(drawn.filter(t => t === 'EQ1')).toHaveLength(1);
    expect(drawn.filter(t => t === 'EQ2')).toHaveLength(1);
  });
  it('draws status markers alongside minimum and maximum chips, never on null pieces', () => {
    const drawn = texts(draw({ pointStatus: () => ({ tone: 'warning', label: 'High' }) }));
    expect(drawn.filter(t => t === '▼')).toHaveLength(7);
    expect(drawn.some(t => t.includes('최소'))).toBe(true);
    expect(drawn.some(t => t.includes('최대'))).toBe(true);
  });
});

it.each([26, undefined])('draws aligned run labels and separators in startAlign, rowPitch=%s', rowPitch => {
  const svg = draw({ startAlign: true, rowGroups, rowPitch });
  const drawn = texts(svg);
  expect(drawn.filter(t => t === 'EQ1')).toHaveLength(2);
  expect(drawn.filter(t => t === 'EQ2')).toHaveLength(1);
  expect(drawn).toContain('PM2');
  const rowYs = [...svg.matchAll(/<text[^>]*transform="translate\([^ ]+ ([^)]+)\)"[^>]*>PM[^<]*<\/text>/g)].map(m => Number(m[1]));
  const groupYs = [...svg.matchAll(/<text[^>]*y="([^" ]+)"[^>]*>EQ[^<]*<\/text>/g)].map(m => Number(m[1]));
  expect(rowYs).toHaveLength(4);
  expect(groupYs).toEqual([(rowYs[0] + rowYs[1]) / 2, rowYs[2], rowYs[3]]);
  const separators = [...svg.matchAll(/<path d="M12 ([^L]+)L[^ ]+ ([^" ]+)"[^>]*ecmeta_silent="true"/g)].map(m => [Number(m[1]), Number(m[2])]);
  expect(separators).toEqual([[(rowYs[1] + rowYs[2]) / 2, (rowYs[1] + rowYs[2]) / 2], [(rowYs[2] + rowYs[3]) / 2, (rowYs[2] + rowYs[3]) / 2]]);
});
it.each([false, true])('draws startAlign status glyphs only on real pieces, minMax=%s', minMax => {
  const drawn = texts(draw({ startAlign: true, extremes: minMax ? baselineInput().extremes : undefined, pointStatus: () => ({ tone: 'warning', label: 'High' }) }));
  expect(drawn.filter(t => t === '▼')).toHaveLength(7);
  expect(drawn.some(t => t.includes('최소'))).toBe(minMax);
  expect(drawn.some(t => t.includes('최대'))).toBe(minMax);
});
