// @vitest-environment node
import { expect, it } from 'vitest';
import { plotOption, renderPlot } from './plot';
import { initialChart, pan, validRange } from './model';
import { colors } from './design-tokens';
import { AnnotationRepository } from './annotations';
it('real ECharts SVG renders two overlay series and annotation at data coordinates', () => {
  const state = { ...initialChart(), compare: true, brush: [4,12] as const };
  const option = plotOption(state, { threshold: 0 }, [{ id: 1, range: [6,9], text: 'Saved note' }]);
  const series = option.series as Array<{ name: string; data: unknown[] }>;
  expect(series.filter(s => s.name.startsWith('Synthetic')).map(s => s.name)).toEqual(['Synthetic A','Synthetic B']); expect(series.filter(s => s.name.startsWith('Synthetic')).every(s => s.data.length === 21)).toBe(true);
  const svg = renderPlot(option); expect(svg).toContain('<svg'); expect(svg).toContain('<path'); expect(svg).toContain('Saved note'); expect(svg).toContain('Brush'); expect(svg).toContain('stroke-dasharray');
});
it('real SVG changes under zoom, filtering, visibility and Compare', () => {
  const initial = renderPlot(plotOption(initialChart(), { threshold: 0 }, []));
  for (const state of [{ ...initialChart(), viewport: [5,15] as const }, { ...initialChart(), compare: true }, { ...initialChart(), visibleA: false }]) {
    const option = plotOption(state, { threshold: 0 }, []); expect(renderPlot(option)).not.toBe(initial);
    expect(option.xAxis).toMatchObject({ min: state.viewport[0], max: state.viewport[1] });
    expect((option.series as unknown[]).length).toBe(!state.visibleA ? 1 : state.compare ? 3 : 2);
  }
  expect((plotOption(initialChart(), { threshold: 100 }, []).series as Array<{data: [number, null][]}>)[0].data.every(row => row[1] === null)).toBe(true);
});
it('repository rejects invalid writes and returns isolated snapshots', () => {
  const repo = new AnnotationRepository(); expect(() => repo.add([5,3], 'bad')).toThrow(); expect(() => repo.add([0,20], ' ')).toThrow();
  repo.add([0,20], 'kept'); const rows = repo.list(); (rows[0].range as unknown as number[])[0] = 8; rows.pop(); expect(repo.list()[0].range).toEqual([0,20]);
});
it('range boundary validation and pan never expand outside fixture', () => {
  expect(validRange([NaN,10])).toBe(false); expect(validRange([0,Infinity])).toBe(false); expect(validRange([4,4])).toBe(false); expect(validRange([0,20])).toBe(true);
  expect(pan([0,10],-2)).toEqual([0,10]); expect(pan([10,20],2)).toEqual([10,20]);
});

it('Brush and annotation remain in real SVG when every data series is hidden', () => {
  const state = { ...initialChart(), compare: true, visibleA: false, visibleB: false, brush: [4,12] as const };
  const svg = renderPlot(plotOption(state, { threshold: 0 }, [{ id: 1, range: [6,9], text: 'Independent note' }]));
  expect(svg).toContain('Brush'); expect(svg).toContain('Independent note');
});
it('Compare renders an annotation label exactly once', () => {
  const svg = renderPlot(plotOption({ ...initialChart(), compare: true }, { threshold: 0 }, [{ id: 1, range: [6,9], text: 'Unique annotation' }]));
  expect(svg.match(/Unique annotation/g)).toHaveLength(1);
});

it('real SVG uses DESIGN chart series and grid tokens', () => {
  const svg = renderPlot(plotOption({ ...initialChart(), compare: true }, { threshold: 0 }, []));
  expect(svg).toContain(colors['chart-blue']);
  expect(svg).toContain(colors['chart-purple']);
  expect(svg).toContain(colors['chart-grid']);
});
