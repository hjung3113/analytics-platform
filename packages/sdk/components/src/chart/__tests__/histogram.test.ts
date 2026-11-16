import { afterEach, describe, expect, it, vi } from 'vitest';
import { histogramBins, histogramData } from '../histogram';
import type { HistogramSpec } from '../AnalysisChart';
import { statusColor } from '../chartStatus';
import { token } from '../EChart';

afterEach(() => vi.restoreAllMocks());
const base = { kind: 'histogram', xUnit: 's', xLabel: 'Duration' } as const;
const bins = [{ start: 0, end: 1, count: 3 }, { start: 1, end: 2, count: 1 }];
type Option = {
  tooltip: { formatter: (p: { dataIndex: number }) => string };
  xAxis: object; yAxis: object; brush?: unknown; dataZoom?: unknown;
  series: {
    data: { itemStyle: { color: string }; label: { formatter: string } }[];
    markLine: { data: { label: { formatter: () => string } }[] };
    renderItem: (p: object, api: { value: (dim: number) => number; coord: (point: number[]) => number[]; visual: (key: string) => string }) => { shape: object };
  }[];
};

describe('histogram binning', () => {
  it.each([
    [{ values: [0, 1, 2, 3], binning: { count: 2 } }, [2, 2]],
    [{ values: [0, 1, 2, 3], binning: { width: 1 } }, [1, 1, 2]],
    [{ values: [-1, 0, 1, 2, 3], binning: { count: 2, domain: [0, 2] } }, [1, 2]],
    [{ values: [1, 1, 1] }, [3]],
    [{ values: [10, 10], binning: { width: 0.1 } }, [2]],
    [{ values: [] }, []],
    [{ values: [0, 1, NaN, Infinity], binning: { count: 1 } }, [2]],
  ] satisfies [Partial<HistogramSpec>, number[]][])('bins values with %j', (input, counts) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(histogramBins({ ...base, ...input } as HistogramSpec).map(bin => bin.count)).toEqual(counts);
  });
  it('uses Sturges by default, equal widths, and keeps the maximum in the last bin', () => {
    const result = histogramBins({ ...base, values: Array.from({ length: 16 }, (_, i) => i) });
    expect(result).toHaveLength(5);
    expect(result.every(bin => bin.end - bin.start === 3)).toBe(true);
    expect(result.reduce((sum, bin) => sum + bin.count, 0)).toBe(16);
    expect(result.at(-1)?.end).toBe(15);
  });
  it('retains an explicit domain and width, including empty bins', () => {
    expect(histogramBins({ ...base, values: [1, 3], binning: { width: 2, domain: [0, 5] } })).toEqual([
      { start: 0, end: 2, count: 1 }, { start: 2, end: 4, count: 1 }, { start: 4, end: 6, count: 0 },
    ]);
  });
  it('places decimal boundary values in the following bin despite floating point division', () => {
    expect(histogramBins({ ...base, values: [0.1, 0.2, 0.3, 0.4], binning: { width: 0.1, domain: [0, 0.4] } }).map(bin => bin.count)).toEqual([0, 1, 1, 2]);
    expect(histogramBins({ ...base, values: [0.1, 0.4], binning: { width: 0.1, domain: [0.1, 0.4] } })).toHaveLength(3);
  });
  it('counts representable values on both sides of an interior edge in their advertised bins', () => {
    const bins = histogramBins({ ...base, values: [0, 1 - Number.EPSILON, 1, 2], binning: { count: 2 } });
    expect(bins.map(bin => bin.count)).toEqual([2, 2]);
    expect(bins.map(bin => [bin.start, bin.end])).toEqual([[0, 1], [1, 2]]);
  });
  it('keeps every counted value inside its bin and covers the domain maximum in width mode', () => {
    const domainMax = 1 + Number.EPSILON;
    const bins = histogramBins({ ...base, values: [0, domainMax], binning: { width: 1, domain: [0, domainMax] } });
    expect(bins.at(-1)!.end).toBeGreaterThanOrEqual(domainMax);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(2);
    const values = Array.from({ length: 200 }, (_, i) => i * 0.037 + 0.1);
    for (const spec of [{ width: 0.1 }, { count: 7 }, { width: 0.3, domain: [0, 8] as [number, number] }]) {
      const out = histogramBins({ ...base, values, binning: spec });
      for (const value of values) {
        const at = out.findIndex((bin, i) => value >= bin.start && (value < bin.end || (i === out.length - 1 && value <= bin.end)));
        expect(at).toBeGreaterThanOrEqual(0);
      }
      const counted = out.map(bin => values.filter(v => v >= bin.start && (v < bin.end || (bin === out.at(-1) && v <= bin.end))).length);
      expect(out.map(bin => bin.count)).toEqual(counted);
    }
  });
  it('keeps exact equal-width edges for narrow bins at large offsets', () => {
    const A = 1e15;
    const edgesOf = (spec: Partial<HistogramSpec>) => histogramBins({ ...base, ...spec } as HistogramSpec).map(bin => [bin.start, bin.end]);
    expect(edgesOf({ values: [A, A + 4], binning: { count: 2 } })).toEqual([[A, A + 2], [A + 2, A + 4]]);
    expect(edgesOf({ values: [A, A + 32], binning: { count: 2 } })).toEqual([[A, A + 16], [A + 16, A + 32]]);
    expect(edgesOf({ values: [A, A + 512], binning: { width: 1 } })).toHaveLength(512);
    expect(edgesOf({ values: [A], binning: { width: 4 } })).toEqual([[A - 2, A + 2]]);
  });
  it('keeps one centred bin for a single decimal value with an explicit width', () => {
    const bins = histogramBins({ ...base, values: [0.1], binning: { width: 0.1 } });
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(1);
    expect(bins[0].start).toBeCloseTo(0.05, 12);
    expect(bins[0].end).toBeCloseTo(0.15, 12);
  });
  it('caps count allocation and rejects excessive width allocations with diagnostics', () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(histogramBins({ ...base, values: [0, 1], binning: { count: 10000 } })).toHaveLength(512);
    expect(histogramBins({ ...base, values: [0, 1], binning: { width: 1e-9 } })).toEqual([]);
    expect(diagnostic).toHaveBeenCalledTimes(2);
  });
  it('retains given zero-count bins as data without mutating caller input', () => {
    const input = [{ start: 0, end: 1, count: 0 }];
    const data = histogramData({ ...base, bins: input }, 'en');
    expect(data.empty).toBe(false);
    expect(data.csvValues).toEqual([[0, 1, 0, 0]]);
    expect(input).toEqual([{ start: 0, end: 1, count: 0 }]);
  });
  it('validates supplied bins in input order without changing their widths or sorting', () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(histogramBins({ ...base, bins: [bins[0], { start: 0.5, end: 1.5, count: 2 },
      { start: 2, end: 2, count: 2 }, { start: 2, end: 3, count: -1 },
      { start: 2, end: 3, count: 1.5 }, { start: 2, end: Infinity, count: 1 },
      { start: 3, end: 5, count: 2 + 1e-12 }, bins[1]] })).toEqual([bins[0], { start: 3, end: 5, count: 2 }]);
    expect(diagnostic).toHaveBeenCalled();
  });
  it.each([
    { bins, values: [1] }, {}, { values: [1], binning: { width: 0 } },
    { values: [1], binning: { count: 0 } }, { values: [1], binning: { domain: [2, 1] } },
    { values: [1], binning: { width: 1, count: 2 } },
  ])('diagnoses invalid input %j', input => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(histogramBins({ ...base, ...input } as HistogramSpec)).toEqual([]);
    expect(diagnostic).toHaveBeenCalled();
  });
});

it('shares bin status, count and percentage across plot, tooltip, table and CSV', () => {
  const status = { tone: 'danger', label: 'Limit exceeded', reason: 'Consumer judgement' } as const;
  const data = histogramData({ ...base, bins, binStatus: bin => bin.start >= 1 ? status : undefined }, 'en');
  expect(data.total).toBe(4);
  expect(data.tableValues[1]).toEqual(['1 s', '2 s', '1', '25%', '■ Limit exceeded · Consumer judgement']);
  expect(data.csvValues[1]).toEqual([1, 2, 1, 25, '■ Limit exceeded', 'Consumer judgement']);
  expect(data.legend.at(-1)?.status).toEqual(status);
  const option = data.option([]) as unknown as Option;
  expect(option.tooltip.formatter({ dataIndex: 1 })).toContain('1–2 s');
  expect(option.tooltip.formatter({ dataIndex: 1 })).toContain('25%');
  expect(option.tooltip.formatter({ dataIndex: 1 })).toContain('Consumer judgement');
  expect(option.series[0].data[1].itemStyle.color).toBe(statusColor(status));
  expect(option.series[1].data[0].label.formatter).toContain('■');
  expect(data.seriesKeys.every(keys => keys.length === 0)).toBe(true);
});

it('marks each contiguous status run once at its first tallest bin while retaining every bin status', () => {
  const counts = [2, 5, 9, 11, 1, 4, 8, 8, 0, 2];
  const data = histogramData({ ...base,
    bins: counts.map((count, start) => ({ start, end: start + 1, count })),
    binStatus: bin => {
      if (bin.start >= 2 && bin.start < 4) return undefined;
      return { tone: 'danger', label: bin.start < 2 ? 'Under' : 'Over', reason: `Bin ${bin.start}` };
    },
  }, 'en');
  const option = data.option([]) as unknown as Option;
  expect(option.series[1].data).toMatchObject([{ value: [1.5, 5] }, { value: [6.5, 8] }]);
  expect(data.legend.filter(entry => entry.status).map(entry => entry.status!.label)).toEqual(['Under', 'Over']);
  for (const index of [0, 1, 4, 5, 6, 7, 8, 9]) {
    const label = index < 2 ? 'Under' : 'Over';
    expect(option.tooltip.formatter({ dataIndex: index })).toContain(`${label} · Bin ${index}`);
    expect(data.tableValues[index].at(-1)).toBe(`■ ${label} · Bin ${index}`);
    expect(data.csvValues[index].slice(-2)).toEqual([`■ ${label}`, `Bin ${index}`]);
    expect(option.series[0].data[index].itemStyle.color).toBe(statusColor({ tone: 'danger', label }));
  }
});

it.each([
  { start: 2, tone: 'danger', label: 'Over' },
  { start: 1, tone: 'warning', label: 'Over' },
  { start: 1, tone: 'danger', label: 'Under' },
] as const)('splits status runs at a gap or a different tone/label: %j', second => {
  const data = histogramData({ ...base,
    bins: [{ start: 0, end: 1, count: 1 }, { start: second.start, end: second.start + 1, count: 2 }],
    binStatus: bin => bin.start === 0 ? { tone: 'danger', label: 'Over' } : { tone: second.tone, label: second.label },
  }, 'en');
  expect((data.option([]) as unknown as Option).series[1].data).toMatchObject([
    { value: [0.5, 1] }, { value: [second.start + 0.5, 2] },
  ]);
});

it.each([true, false])('lets the consumer decide whether a zero-count bin joins a status run: %s', statusOnEmpty => {
  const data = histogramData({ ...base,
    bins: [1, 0, 2].map((count, start) => ({ start, end: start + 1, count })),
    binStatus: bin => statusOnEmpty || bin.count > 0 ? { tone: 'danger', label: 'Over' } : undefined,
  }, 'en');
  const markers = (data.option([]) as unknown as Option).series[1].data;
  expect(markers).toMatchObject(statusOnEmpty ? [{ value: [2.5, 2] }] : [{ value: [0.5, 1] }, { value: [2.5, 2] }]);
});

it('retains a marker for an entirely zero-count status run', () => {
  const data = histogramData({ ...base,
    bins: [0, 1].map(start => ({ start, end: start + 1, count: 0 })),
    binStatus: () => ({ tone: 'danger', label: 'Over' }),
  }, 'en');
  expect((data.option([]) as unknown as Option).series[1].data).toMatchObject([{ value: [0.5, 0] }]);
});

it('has no inferred status and draws labelled dashed reference lines with extended numeric axes', () => {
  const data = histogramData({ ...base, bins, referenceLines: [
    { id: 'lo', value: -2, label: 'Low' }, { id: 'hi', value: 5, label: 'High', tone: 'danger' },
  ] }, 'en');
  const option = data.option([]) as unknown as Option;
  expect(data.rows.every(row => row.status === undefined)).toBe(true);
  expect(data.headers).not.toContain('Status');
  expect(data.csvValues[0]).toEqual([0, 1, 3, 75]);
  expect(option.xAxis).toMatchObject({ type: 'value', min: -2, max: 5 });
  expect(option.yAxis).toMatchObject({ type: 'value', min: 0, minInterval: 1, name: 'Count' });
  expect(option.series[0].markLine.data).toEqual([
    expect.objectContaining({ name: 'Low', xAxis: -2, lineStyle: { type: 'dashed', color: token('text-secondary') }, label: expect.objectContaining({ formatter: expect.any(Function) }) }),
    expect.objectContaining({ name: 'High', xAxis: 5, lineStyle: { type: 'dashed', color: statusColor({ tone: 'danger', label: 'High' }) }, label: expect.objectContaining({ formatter: expect.any(Function) }) }),
  ]);
  expect(option.series[0].markLine.data.map((line: { label: { formatter: () => string } }) => line.label.formatter())).toEqual(['Low', 'High']);
  expect(option.brush).toBeUndefined();
  expect(option.dataZoom).toBeUndefined();
});

it('draws the actual numeric bin extents, including gaps and unequal supplied widths', () => {
  const data = histogramData({ ...base, bins: [{ start: 0, end: 1, count: 2 }, { start: 3, end: 5, count: 4 }] }, 'en');
  const option = data.option([]) as unknown as Option;
  const rect = option.series[0].renderItem({}, { value: (dim: number) => [3, 5, 4][dim], coord: ([x, y]: number[]) => [x * 10, 100 - y * 10], visual: () => 'series' });
  expect(rect.shape).toEqual({ x: 30, y: 60, width: 20, height: 40 });
  expect(histogramData({ ...base, values: [] }, 'en').empty).toBe(true);
});

it('evaluates each consumer status once for all outputs and diagnoses invalid reference lines', () => {
  const binStatus = vi.fn(() => undefined);
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  const data = histogramData({ ...base, bins, binStatus, referenceLines: [
    { id: 'a', value: 1, label: 'First' }, { id: 'a', value: 100, label: 'Duplicate' }, { id: 'b', value: NaN, label: 'Invalid' },
  ] }, 'en');
  const option = data.option([]) as unknown as Option;
  expect(option.series[0].markLine.data).toHaveLength(1);
  expect(option.xAxis).toMatchObject({ min: 0, max: 2 });
  expect(binStatus).toHaveBeenCalledTimes(2);
  expect(diagnostic).toHaveBeenCalledTimes(2);
});
