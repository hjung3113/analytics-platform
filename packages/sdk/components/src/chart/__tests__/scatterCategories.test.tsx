import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChart, type ScatterSpec } from '../AnalysisChart';
import { scatterData } from '../analysisChartKinds';
import type { EChartProps } from '../EChart';
import { downloadChartCsv } from '../analysisChartCsv';
let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (p: EChartProps) => { plot = p; return <div role="img" />; } }));
vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const plain: ScatterSpec = { kind: 'scatter', xLabel: 'Cell', xUnit: 'ignored', yLabel: 'Duration', groups: [{ id: 'g', label: 'G' }], points: [{ id: 'one', x: 9, y: 4, group: 'g' }, { id: 'two', x: null, y: null, group: 'g' }], referenceLines: [{ axis: 'y', value: 10, label: 'Ref' }] };
const category = (extra: Partial<NonNullable<ScatterSpec['xCategories']>> = {}): ScatterSpec => ({ ...plain, points: [{ id: 'one', category: 'a', x: NaN, y: 4, group: 'g' }, { id: 'two', category: 'b', x: null, y: null, group: 'g' }], xCategories: { order: ['a', 'b', 'c'], ...extra } });
type Datum = { value: number[]; label?: { formatter: string }; itemStyle: { borderWidth: number; shadowColor?: string } };
type Series = { id?: string; type: string; data: Datum[]; markLine?: { data: { coord: number[]; lineStyle?: { type: number[] } }[][] }; markArea?: { data: { coord: number[] }[][] }; renderItem?: (p: unknown, api: unknown) => unknown };
type Option = { series: Series[]; xAxis: { min: number; max: number; name: string; interval: number; axisLabel: { formatter: (v: number) => string } }; yAxis: { min: (e: { min: number; max: number }) => number; max: (e: { min: number; max: number }) => number }; tooltip: { renderMode: string; formatter: (p: { seriesIndex: number; dataIndex: number }) => string }; brush: unknown };
const option = (spec: ScatterSpec) => scatterData(spec, 'en', 's').option([]) as Option;
const coordinates = (spec: ScatterSpec) => {
  const projection = scatterData(spec, 'en', 's'); const chart = projection.option([]) as Option;
  return Object.fromEntries(projection.seriesKeys.flatMap((keys, s) => keys.flatMap((key, d) => key ? [[key, chart.series[s].data[d].value[0]]] : [])));
};
// Captured from the unmodified projection before implementing #2332. Functions are sampled separately.
it('preserves the complete legacy projection without opt-in fields', () => {
  const p = scatterData(plain, 'en', 's'); const o = p.option([]) as Option;
  expect(JSON.parse(JSON.stringify({ ...p, option: o }))).toMatchSnapshot();
  const absent = scatterData({ ...plain, xCategories: undefined, points: plain.points.map(point => ({ ...point, category: undefined, status: undefined })) }, 'en', 's');
  expect(JSON.parse(JSON.stringify({ ...absent, option: absent.option([]) }))).toEqual(JSON.parse(JSON.stringify({ ...p, option: o })));
  expect(o.tooltip.formatter({ seriesIndex: 0, dataIndex: 0 })).toBe('one · G: Cell 9 ignored · Duration 4 s');
  expect(o.yAxis.min({ min: 4, max: 4 })).toBe(3.7);
  expect(o.yAxis.max({ min: 4, max: 4 })).toBe(10.3);
});
describe('scatter categories (#2332)', () => {
  it('joins accepted rows to their own category bounds and keeps synthetic series out of tooltips and selection', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const spec = category({ order: ['b', 'a'], groups: { header: 'Rack', byCategory: new Map([['a', { group: 'R1', label: 'A' }]]) }, bounds: new Map([['a', { lower: 1, upper: 8 }], ['b', { upper: 3 }]]) });
    spec.points = [
      { id: 'invalid', category: 'a', x: null, y: NaN },
      { id: 'b', category: 'b', x: null, y: null },
      { id: 'a', category: 'a', x: null, y: 4, status: { tone: 'danger', label: 'High' } },
      { id: 'a', category: 'b', x: null, y: 2 },
    ];
    const p = scatterData(spec, 'en', 's'); const o = p.option([]) as Option;
    expect(error).toHaveBeenCalled();
    expect(p.tableValues.map(row => row.slice(3))).toEqual([['', 'b', 'Unknown', '', '3', ''], ['R1', 'A', '4 s', '1', '8', '■ High']]);
    expect(p.csvValues.map(row => row.slice(-3))).toEqual([['', 3, ''], [1, 8, '■ High']]);
    expect(p.rows[1].label).toContain('Rack: R1 · A · Lower bound: 1 s · Upper bound: 8 s');
    const pointSeries = p.seriesKeys.findIndex(keys => keys.includes(p.rows[1].key));
    expect(o.tooltip.formatter({ seriesIndex: pointSeries, dataIndex: 0 })).toContain('Upper bound: 8');
    o.series.forEach((series, index) => {
      if (!series.id) return;
      expect(p.seriesKeys[index]).toEqual([]);
      expect(o.tooltip.formatter({ seriesIndex: index, dataIndex: 0 })).toBe('');
    });
  });
  it.each([undefined, 0, 0.2, 0.9, -1, 2, NaN])('keeps deterministic jitter %s inside its cell independent of order', jitter => {
    const spec = category({ jitter }); spec.points = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, x: null, y: i, category: i % 2 ? 'b' : 'a', group: 'g' }));
    const actual = coordinates(spec); const width = Number.isFinite(jitter) ? Math.min(0.9, Math.max(0, jitter!)) : 0.6;
    for (const p of spec.points) expect(Math.abs(actual[JSON.stringify(['scatter', 'row', p.id])] - (p.category === 'a' ? 0 : 1))).toBeLessThanOrEqual(width / 2);
    expect(coordinates({ ...spec, points: [...spec.points].reverse() })).toEqual(actual);
    expect(coordinates(spec)).toEqual(actual);
    if (width > 0) expect(new Set(Object.values(actual)).size).toBeGreaterThan(2);
  });
  it('uses declared category order, ignores x, preserves null y, and diagnoses missing/unknown categories', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {}); const spec = category({ jitter: 0, order: ['b', 'a'] });
    spec.points.push({ id: 'bad', x: 2, y: 2, category: 'c' }, { id: 'missing', x: 1, y: 2 });
    const p = scatterData(spec, 'en', 's'); const o = p.option([]) as Option;
    expect(p.rows.map(r => r.key)).toEqual(['one', 'two'].map(id => JSON.stringify(['scatter', 'row', id])));
    expect(o.series[0].data.map(d => d.value)).toEqual([[1, 4]]);
    expect(p.tableValues[1]).toContain('Unknown'); expect(p.summary).toContain('1 unknown');
    expect(o.xAxis).toMatchObject({ min: -0.5, max: 1.5, interval: 0.5, name: 'Cell' });
    expect(o.xAxis.axisLabel.formatter(0)).toBe('b'); expect(o.xAxis.axisLabel.formatter(0.5)).toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('category')); expect(o.brush).toBeDefined();
    expect(p.headers).toContain('Cell'); expect(p.headers.join(' ')).not.toContain('ignored');
  });
  it('merges equal neighbour bounds, distinguishes dash patterns and only bands paired bounds', () => {
    const spec = category({ bounds: new Map([['a', { lower: -10, upper: 40 }], ['b', { lower: -10, upper: 40 }], ['c', { upper: 50 }]]) });
    const p = scatterData(spec, 'en', 's'); const o = p.option([]) as Option;
    const lines = o.series[0].markLine!.data.filter(Array.isArray);
    expect(lines).toHaveLength(3);
    expect(lines.map(line => line.map(end => end.coord))).toEqual([[[-0.5, 40], [1.5, 40]], [[1.5, 50], [2.5, 50]], [[-0.5, -10], [1.5, -10]]]);
    expect(lines[0][0].lineStyle!.type).not.toEqual(lines[2][0].lineStyle!.type);
    expect(o.series[0].markArea!.data.map(b => b.map(end => end.coord))).toEqual([[[-0.5, -10], [1.5, 40]]]);
    expect(o.yAxis.min({ min: 4, max: 4 })).toBeLessThan(-10); expect(o.yAxis.max({ min: 4, max: 4 })).toBeGreaterThan(50);
    expect(p.legend.map(l => l.label)).toEqual(['G', 'Upper bound', 'Lower bound', 'Bound range']);
    expect(p.csvHeaders.slice(-2)).toEqual(['Lower bound', 'Upper bound']); expect(p.csvValues[0].slice(-2)).toEqual([-10, 40]);
    expect(p.rows[0].label).toContain('Lower bound: -10 s'); expect(p.rows[0].label).toContain('Upper bound: 40 s'); expect(p.summary).not.toContain('Lower bound');
  });
  it.each([{ upper: 5 }, { lower: -2 }, {}])('only advertises the bounds present: %j', bound => {
    const p = scatterData(category({ bounds: new Map([['a', bound]]), boundLabels: { upper: 'Ceiling', lower: 'Floor', band: 'Allowed' } }), 'en', 's');
    expect(p.legend.map(l => l.label)).toEqual(['G', ...('upper' in bound ? ['Ceiling'] : []), ...('lower' in bound ? ['Floor'] : [])]);
    expect((p.option([]) as Option).series[0].markArea?.data ?? []).toHaveLength(0);
    expect(p.csvValues[1].slice(-2)).toEqual(['', '']);
  });
  it('shares row group labels across the second axis line, table, CSV and summary', () => {
    const spec = category({ groups: { header: 'Rack', byCategory: new Map([['a', { group: 'R1', label: 'A' }], ['b', { group: 'R1', label: 'B' }], ['c', { group: 'R2', label: 'C' }]]) } });
    const p = scatterData(spec, 'en', 's'); const o = p.option([]) as Option;
    expect(o.xAxis.axisLabel.formatter(0)).toBe('A'); expect(p.headers).toContain('Rack');
    expect(p.tableValues[0]).toEqual(['one', 'one', 'G', 'R1', 'A', '4 s']);
    expect(p.csvValues[0]).toEqual(['one', 'one', 'G', 'R1', 'A', 4]); expect(p.rows[0].label).toContain('Rack: R1 · A'); expect(p.summary).not.toContain('Rack: R1');
    const groups = o.series.find(s => s.type === 'custom')!; expect(groups.data).toEqual([[0, 1], [2, 2]]);
    const api = { coord: ([x, y]: number[]) => [100 + x * 50, 200 - y], size: () => [50, 20] };
    expect(groups.renderItem!({ dataIndex: 0, coordSys: { x: 75, y: 0, width: 150, height: 200 } }, api)).toMatchObject({ children: expect.arrayContaining([expect.objectContaining({ type: 'text', style: expect.objectContaining({ text: 'R1', x: 125 }) })]) });
    expect(groups.renderItem!({ dataIndex: 1, coordSys: { x: 75, y: 0, width: 150, height: 200 } }, api)).toMatchObject({ children: expect.arrayContaining([expect.objectContaining({ type: 'line' })]) });
  });
  it('keeps undeclared group cells empty and separates nonconsecutive equal bounds', () => {
    const p = scatterData(category({ groups: { header: 'Rack', byCategory: new Map([['a', { group: 'R1', label: 'A' }]]) }, bounds: new Map([['a', { upper: 9 }], ['c', { upper: 9 }]]) }), 'en', 's');
    expect(p.tableValues[1].slice(3, 5)).toEqual(['', 'b']);
    const lines = (p.option([]) as Option).series[0].markLine!.data.filter(Array.isArray);
    expect(lines.map(line => line.map(end => end.coord))).toEqual([[[-0.5, 9], [0.5, 9]], [[1.5, 9], [2.5, 9]]]);
  });
  it('maps retained duplicate ids to their accepted category and status after dropping an invalid category', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spec = category({ jitter: 0 }); spec.points.unshift({ id: 'one', category: 'absent', x: 0, y: 0 });
    spec.points[1].status = { tone: 'neutral', label: 'Unjudged' };
    const p = scatterData(spec, 'en', 's');
    expect(p.tableValues[0]).toContain('a'); expect(p.tableValues[0]).toContain('○ Unjudged');
    expect((p.option([]) as Option).series[0].data[0].value).toEqual([0, 4]);
  });
  it('diagnoses invalid bounds, retains valid sides and never emits NaN geometry', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = scatterData(category({ order: ['a', 'b', 'a'], bounds: new Map([['a', { upper: Infinity, lower: -2 }], ['b', { upper: 2, lower: 9 }]]) }), 'en', 's');
    expect(p.legend.map(l => l.label)).toEqual(['G', 'Lower bound']);
    expect(p.csvValues[0].slice(-2)).toEqual([-2, '']); expect(p.csvValues[1].slice(-2)).toEqual(['', '']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('non-finite')); expect(error).toHaveBeenCalledWith(expect.stringContaining('reversed'));
  });
  it.each([false, true])('deduplicates status legend by tone/label and carries reason text in value/category mode=%s', categorical => {
    const status = { tone: 'danger' as const, label: 'Outside', reason: 'Above range' }; const source = categorical ? category() : plain;
    const spec = { ...source, points: source.points.map(p => ({ ...p, status })) };
    const p = scatterData(spec, 'en', 's'); const o = p.option([p.rows[0].key]) as Option;
    expect(p.legend.filter(l => l.label === 'Outside')).toHaveLength(1);
    expect(o.series[0].data[0].label?.formatter).toContain('■'); expect(o.series[0].data[0].itemStyle).toMatchObject({ borderWidth: 2, shadowColor: expect.any(String) });
    expect(p.headers).toContain('Status'); expect(p.tableValues[0]).toContain('■ Outside · Above range'); expect(p.csvValues[0]).toContain('■ Outside · Above range');
    expect(p.rows[0].label).toContain('■ Outside · Above range'); expect(p.summary).toContain(`■ Outside: ${spec.points.length}`); expect(p.summary).not.toContain('Above range'); expect(o.tooltip.formatter({ seriesIndex: 0, dataIndex: 0 })).toContain('Above range');
    const changed = { ...spec, points: [...spec.points, { ...spec.points[0], id: 'another', status: { ...status, tone: 'warning' as const } }] };
    expect(scatterData(changed, 'en', 's').legend.filter(l => l.label === 'Outside')).toHaveLength(2);
  });
  it('escapes all tooltip text in HTML mode and never interprets caller richText tokens', () => {
    const unsafe = '<img src=x onerror=alert(1)>{status|payload}'; const spec = category({ order: [unsafe], groups: { header: unsafe, byCategory: new Map([[unsafe, { group: unsafe, label: unsafe }]]) }, bounds: new Map([[unsafe, { upper: 5 }]]), boundLabels: { upper: unsafe } });
    spec.points = [{ id: 'one', label: unsafe, category: unsafe, x: null, y: 1, status: { tone: 'warning', label: unsafe, reason: unsafe } }];
    const o = option(spec); const tip = o.tooltip.formatter({ seriesIndex: 1, dataIndex: 0 });
    expect(o.tooltip.renderMode).toBe('html'); expect(tip).toContain('&lt;img'); expect(tip).not.toContain('<img'); expect(tip).toContain('{status|payload}');
  });
  it('keeps brush indices on points and exposes category/status data through the mounted chart', async () => {
    const spec = category({ bounds: new Map([['a', { upper: 5 }]]) }); spec.points[0].status = { tone: 'warning', label: 'Check', reason: 'Inspect' };
    render(<I18nProvider><AnalysisChart chartId="category" title="Category" unit="s" spec={spec} exportActions={{ exportAllowed: true }} /></I18nProvider>); await screen.findByRole('img');
    expect(screen.getAllByText('Check')).toHaveLength(1);
    act(() => { plot.onEvents!.brushselected({ batch: [{ selected: [{ seriesIndex: 0, dataIndex: [0] }] }] }, {} as never); plot.onEvents!.brushEnd({}, {} as never); });
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('Check');
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' })); expect(screen.getByRole('table')).toHaveTextContent('상한');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' })); fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' })); expect(downloadChartCsv).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(['상태', '하한', '상한']), expect.arrayContaining([expect.arrayContaining(['◆ Check · Inspect'])]));
  });
});
