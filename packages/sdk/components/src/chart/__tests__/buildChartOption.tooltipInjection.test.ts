import { afterEach, describe, expect, it } from 'vitest';
import * as echarts from 'echarts/core';
import { BarChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { buildChartOption } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';
import type { ChartSeries } from '../AnalysisChartFrame';

echarts.use([BarChart, ScatterChart, GridComponent, TooltipComponent, SVGRenderer]);

// The real ECharts (HTML tooltip mode, as in the app) sets a formatter's string as innerHTML (#1879): a markup-looking series name must stay text.
const NAME = '<img src=x onerror=alert(1)><b>x</b>';
const ROWS = ['R1', 'R2'];
const bar = (id: string, name: string, values: (number | null)[]): ChartSeries => ({ id, name, color: 'chart-blue', kind: 'bar', points: ROWS.map((x, i) => [x, values[i]]) });
const partial = () => buildChartOption(baselineInput({
  displayed: [bar('a', 'A', [5, 5]), bar('b', NAME, [5, null])], categories: ROWS, horizontal: true, stacked: true, valueLabels: 'total',
  totals: new Map([['R1', { value: 10, partial: false, missing: [] }], ['R2', { value: 5, partial: true, missing: [NAME] }]]),
})) as unknown as EChartsCoreOption;

let host: HTMLDivElement | null = null;
afterEach(() => { host?.remove(); host = null; });

describe('partial-total tooltip is text, never markup (#1879)', () => {
  it('shows the series name as text and creates no element from it', () => {
    host = document.body.appendChild(document.createElement('div'));
    const chart = echarts.init(host, undefined, { renderer: 'svg', width: 400, height: 200 });
    chart.setOption({ ...partial(), animation: false });
    const index = (chart.getOption().series as { id: string }[]).findIndex(s => s.id === '__total');
    chart.dispatchAction({ type: 'showTip', seriesIndex: index, dataIndex: 1 });
    chart.getZr().flush();
    expect(document.body.querySelector('img, b')).toBeNull();
    expect(document.body.textContent).toContain(NAME);
    chart.dispose();
  });
});
