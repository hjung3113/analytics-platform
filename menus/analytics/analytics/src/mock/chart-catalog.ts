import { formatDateTime, parseDateTime } from '@ap/contracts';
import { defineMockEndpoint } from '@ap/mock-server';
import { chartCatalogEndpoint, isCatalogKind, type CatalogData } from '../endpoints';

export const chartCatalogMock = defineMockEndpoint(chartCatalogEndpoint, {
  validate: ({ params }) => isCatalogKind(params.kind) ? null : 'Unknown chart kind',
  handle: ({ context, equipment }): CatalogData => {
    const empty: CatalogData = { current: [], previous: [], previousFrom: null, previousTo: null, heatmap: { xLabels: [], yLabels: [], cells: [] }, donut: [], scatter: [], boxPlot: [], pareto: [], topNBar: [], lane: [] };
    if (context.from === null || context.to === null || equipment.length === 0) return empty;
    const start = parseDateTime(context.from, 'from').getTime();
    const duration = parseDateTime(context.to, 'to').getTime() - start;
    if (duration <= 0) return empty;
    const stamp = (ms: number) => formatDateTime(new Date(ms));
    const current = Array.from({ length: 8 }, (_, i) => ({ at: stamp(start + Math.floor(duration * i / 8 / 1000) * 1000), sourceAt: stamp(start + Math.floor(duration * i / 8 / 1000) * 1000), value: 24 + (i * 7) % 23 }));
    const previous = current.map((bucket, i) => ({ at: bucket.at, sourceAt: stamp(parseDateTime(bucket.at, 'bucket').getTime() - duration), value: 21 + (i * 5) % 19 }));
    const targets = equipment.slice(0, 6);
    // Two-hour wall-clock buckets, bounded by the requested period.
    const xLabels = Array.from({ length: Math.ceil(duration / 7_200_000) }, (_, i) => stamp(start + i * 7_200_000));
    const yLabels = targets.map(row => row.equipmentId);
    return {
      current, previous, previousFrom: stamp(start - duration), previousTo: context.from,
      heatmap: { xLabels, yLabels, cells: yLabels.flatMap((y, j) => xLabels.flatMap((x, i) => j === yLabels.length - 1 && i === xLabels.length - 1 ? [] : [{ x, y, value: i === Math.min(1, xLabels.length - 1) && j === 0 ? null : 20 + i * 5 + j * 3 }])) },
      donut: targets.slice(0, 4).map((row, i) => ({ id: row.equipmentId, label: row.equipmentId, value: 40 - i * 7 })),
      scatter: targets.map((row, i) => ({ id: row.equipmentId, x: i === 0 ? null : 20 + i * 5, y: 30 + i * 3, group: row.room })),
      boxPlot: targets.slice(0, 3).map((row, i) => ({ id: row.equipmentId, label: row.equipmentId, stats: { min: 10 + i, q1: 20 + i, median: 25 + i, q3: 30 + i, max: 40 + i, n: 18 + i } })),
      topNBar: Array.from({ length: 12 }, (_, i) => ({ id: `item-${i}`, label: `Item ${i + 1}`, value: 60 - i * 3, colorToken: i % 2 === 0 ? 'chart-series-1' : 'chart-series-2' })),
      lane: Array.from({ length: 40 }, (_, i) => ({ id: `lane-${i}`, label: `Lane ${i + 1}`, segments: Array.from({ length: 6 }, (_, j) => ({
        id: `segment-${i}-${j}`, start: start + duration * (j / 8), end: start + duration * ((j + 2) / 8), depth: j % 3,
        rank: ['높음', '보통', '낮음'][j % 3], ...(j === 0 ? { startBoundary: 'orphan' as const } : {}), ...(j === 5 ? { endBoundary: 'open' as const } : {}),
      })) })),
      pareto: targets.map((row, i) => ({ id: row.equipmentId, label: row.equipmentId, value: 40 - i * 5 })),
    };
  },
  isEmpty: data => data.current.length === 0,
  metricVersion: () => 'synthetic v1',
});
