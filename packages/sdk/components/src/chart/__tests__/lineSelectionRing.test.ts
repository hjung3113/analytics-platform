// @vitest-environment node
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { expect, it } from 'vitest';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import { CHART_ECHARTS_THEME } from '../chartMarks';
import { chartPointKey } from '../chartStatus';
import type { ChartSeries } from '../AnalysisChartFrame';

echarts.use([LineChart, GridComponent, SVGRenderer]);

// A line point is a hollow symbol by default: ECharts strokes it in the series colour, so a datum border alone never shows (UX-2, #2736).
it('draws a selected line point with the 1.5px ring in the selection colour, on the point’s own fill', () => {
  const line: ChartSeries = { id: 'l', name: 'L', color: 'chart-blue', points: [['R1', 1], ['R2', 2], ['R3', 3]] };
  const base = baselineInput();
  const option = buildChartOption(baselineInput({
    displayed: [line], horizontal: false, stacked: false, rowPitch: undefined, activeCategory: null, extremes: undefined, markLines: undefined,
    palette: { ...base.palette, selection: '#ff0000', series: [{ stroke: '#0000ff', fill: '#00ff00' }], segmentText: [{ color: '#000000', chip: false }] },
    selectedPointKeys: [chartPointKey({ seriesId: 'l', x: 'R2' })],
  }));
  const chart = echarts.init(null, CHART_ECHARTS_THEME, { renderer: 'svg', ssr: true, width: 600, height: 240 });
  try {
    chart.setOption({ ...option, animation: false });
    const svg = chart.renderToSVGString();
    const rings = [...svg.matchAll(/<path[^>]*stroke="#ff0000"[^>]*>/g)].map(match => match[0]);
    expect(rings).toHaveLength(1);
    // The symbol path is unit-sized and scaled by its transform, so the drawn ring is stroke-width × scale.
    const scale = Number(/matrix\(([\d.]+),/.exec(rings[0])![1]);
    expect(Number(/stroke-width="([\d.]+)"/.exec(rings[0])![1]) * scale).toBeCloseTo(1.5);
    expect(rings[0]).toContain('fill="#00ff00"');
  } finally { chart.dispose(); }
});
