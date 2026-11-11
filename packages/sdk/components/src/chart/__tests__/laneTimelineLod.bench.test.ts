// Node microbenchmark of one full-view LaneTimeline frame (stub canvas, no canvas cost). Skipped unless LANE_BENCH=1:
//   LANE_BENCH=1 pnpm vitest run src/chart/__tests__/laneTimelineLod.bench.test.ts
import { describe, it } from 'vitest';
import type { ThemeColorToken } from '@ap/ui/theme';
import { createLaneStyle, paintFrame } from '../laneTimelineLod';
import { prepareLanes, RectBuffer, GUTTER } from '../laneTimelineModel';
import { benchLanes } from './laneTimelineLod.helpers';

const COLORS: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
describe.skipIf(!process.env.LANE_BENCH)('LOD frame bench', () => {
  it.each([50_000, 200_000])('%i segments', n => {
    const model = prepareLanes(benchLanes(n), []); const width = 1440; const height = 520; const plot = width - GUTTER;
    const style = createLaneStyle({ model, colors: COLORS, neutral: 'chart-no-data', resolve: t => `c:${t}`, outlineMode: 'strong' });
    const fr = { view: model.domain, width, height, scroll: 0 }; const buf = new RectBuffer();
    const f = () => {}; const noop = { fillRect: f, strokeRect: f, beginPath: f, moveTo: f, lineTo: f, stroke: f, setLineDash: f, fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    let t = performance.now(); paintFrame(noop, style, fr, buf, plot); const cold = performance.now() - t;
    const reps = 25; const totals: number[] = [];
    for (let r = 0; r < reps; r++) {
      t = performance.now(); paintFrame(noop, style, fr, buf, plot); totals.push(performance.now() - t);
    }
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
    console.info(`BENCH n=${n} cold=${cold.toFixed(1)} median=${med(totals).toFixed(2)}`);
  });
});
