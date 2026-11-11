import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillVisibleRects, hitTest, laneWindow, prepareLanes, RectBuffer, segmentSummary, segmentText, visibleRects } from '../laneTimelineGeometry';
import { GUTTER } from '../laneTimelineModel';
import { oldHitTest, oldPrepareLanes, oldVisibleRects, randomLanes, rng } from './laneTimelineOracle';

afterEach(() => vi.restoreAllMocks());

describe('window query and paint order match the old linear scan', () => {
  it.each(Array.from({ length: 60 }, (_, seed) => seed))('seed %i', seed => {
    const random = rng(seed + 1000);
    const lanes = randomLanes(seed, 3 + (seed % 5), 40 + (seed % 7) * 25, { longShare: seed % 3 === 0 ? 0.05 : 0, spanning: seed % 4 === 0 });
    const model = prepareLanes(lanes, []); const old = oldPrepareLanes(lanes);
    for (let q = 0; q < 12; q++) {
      const a = random() * 1000 - 20; const view: [number, number] = [a, a + (q % 3 === 0 ? 0.5 : random() * 600) + 0.01];
      const width = 352 + Math.floor(random() * 900); const height = 24 + Math.floor(random() * 120); const scroll = Math.floor(random() * 40);
      const got = visibleRects(model, view, width, height, scroll); const want = oldVisibleRects(old, view, width, height, scroll);
      expect(got.map(r => [r.segment.id, r.index, r.x, r.y, r.width, r.height])).toEqual(want.map(r => [r.segment.id, r.index, r.x, r.y, r.width, r.height]));
    }
  });
  it('buffer API reports the same rects as the array form', () => {
    const model = prepareLanes(randomLanes(7, 4, 200), []); const buf = new RectBuffer();
    const view: [number, number] = [100, 400];
    const n = fillVisibleRects(model, view, 800, 96, 0, buf); const rects = visibleRects(model, view, 800, 96, 0);
    expect(n).toBe(rects.length);
    expect(Array.from({ length: n }, (_, i) => [buf.flat[i], buf.x[i], buf.width[i]])).toEqual(rects.map(r => [r.index, r.x, r.width]));
  });
});

describe('hit test matches the old reverse linear search', () => {
  it.each(Array.from({ length: 60 }, (_, seed) => seed))('seed %i', seed => {
    const random = rng(seed + 5000);
    const lanes = randomLanes(seed + 100, 4 + (seed % 4), 60 + (seed % 5) * 40, { longShare: seed % 3 === 0 ? 0.05 : 0 });
    const model = prepareLanes(lanes, []); const old = oldPrepareLanes(lanes);
    const view: [number, number] = seed % 2 ? [0, 1000] : [200, 200 + random() * 300 + 1];
    const width = 352 + Math.floor(random() * 800); const height = 24 * (2 + (seed % 3)) + 5; const scroll = seed % 5 === 0 ? 12 : 0;
    const rects = oldVisibleRects(old, view, width, height, scroll);
    const probe = (x: number, y: number) => expect(hitTest(model, view, width, height, scroll, x, y)?.index).toBe(oldHitTest(rects, x, y)?.index);
    for (let i = 0; i < 150; i++) probe(random() * (width + 20) - 10, random() * (height + 30) - 10);
    // Inclusive edges and rect corners (including sub-1.5px widths and the right-edge clamp).
    for (const rect of rects.slice(0, 80)) { probe(rect.x, rect.y); probe(rect.x + rect.width, rect.y + rect.height); probe(rect.x - 1e-9, rect.y); probe(rect.x + rect.width / 2, rect.y + rect.height); probe(width - 0.75, rect.y + 1); }
    for (let row = 0; row <= height / 24 + 1; row++) probe(GUTTER + 50, row * 24 - scroll); // row boundary
  });
  it('does not hit lanes outside the visible rows', () => {
    const model = prepareLanes(randomLanes(3, 6, 50), []);
    expect(hitTest(model, model.domain, 600, 24, 0, 300, 60)).toBeUndefined();
  });
});

describe('window query cost', () => {
  const n = 200_000;
  const cases = [
    ['one early segment spanning the whole domain', (i: number, random: () => number) => (i === 0 ? { start: 0, end: n * 10 } : { start: i * 10, end: i * 10 + 5 + random() * 5 })],
    ['3% long segments', (i: number, random: () => number) => (random() < 0.03 ? { start: i * 10, end: i * 10 + 40_000 } : { start: i * 10, end: i * 10 + 5 + random() * 5 })],
  ] as const;
  it.each(cases)('%s: a narrow query scans a short span of a 200k lane', (_name, make) => {
    const random = rng(42);
    const segments = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ...make(i, random) }));
    const model = prepareLanes([{ id: 'a', label: 'A', segments }], []);
    const stats = { scanned: 0 }; const out: number[] = [];
    const started = performance.now();
    for (let q = 0; q < 200; q++) { out.length = 0; const a = 100_000 + q * 9_000; laneWindow(model.cols[0], a, a + 200, out, stats); }
    const elapsed = performance.now() - started;
    // Linear would scan 200k per query; the index scans the long side list plus a short run.
    expect(stats.scanned / 200).toBeLessThan(model.cols[0].count / 20);
    // Same answer as a linear scan.
    out.length = 0; laneWindow(model.cols[0], 1_000_000, 1_000_200, out);
    const want = segments.flatMap((s, i) => (s.end >= 1_000_000 && s.start <= 1_000_200 ? [i] : []));
    expect(out.sort((x, y) => x - y)).toEqual(want);
    console.info(`LaneTimeline ${_name}: ${(stats.scanned / 200).toFixed(0)} scanned/query, ${(elapsed / 200).toFixed(3)} ms/query`);
  });
});

describe('validation and diagnostics are unchanged', () => {
  const run = (segments: object[], extra: object[] = []) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const model = prepareLanes([{ id: 'a', label: 'A', segments: segments as never }, ...(extra as never[])], []);
    return { model, messages: spy.mock.calls.map(c => c[0]) };
  };
  it.each([
    ['duplicate segment id', [{ id: 'x', start: 0, end: 1 }, { id: 'x', start: 0, end: 1 }], 'LaneTimeline: invalid range or duplicate segment ID dropped', 1],
    ['NaN start', [{ id: 'x', start: NaN, end: 1 }], 'LaneTimeline: invalid range or duplicate segment ID dropped', 0],
    ['reversed range', [{ id: 'x', start: 2, end: 1 }], 'LaneTimeline: invalid range or duplicate segment ID dropped', 0],
    ['out of range', [{ id: 'x', start: 0, end: 9e15 }], 'LaneTimeline: invalid range or duplicate segment ID dropped', 0],
    ['negative depth', [{ id: 'x', start: 0, end: 1, depth: -1 }], 'LaneTimeline: invalid depth; using zero', 1],
    ['fractional depth', [{ id: 'x', start: 0, end: 1, depth: 1.5 }], 'LaneTimeline: invalid depth; using zero', 1],
    ['invalid colour', [{ id: 'x', start: 0, end: 1, colorToken: 'nope' }], 'LaneTimeline: invalid segment color; using palette', 1],
  ])('%s', (_name, segments, message, kept) => {
    const { model, messages } = run(segments);
    expect(messages).toEqual([message]); expect(model.flat).toHaveLength(kept);
    if (kept) { expect(model.cols[0].depth[0]).toBe(0); expect(model.cols[0].color[0]).toBe(0); }
  });
  it('drops a duplicate lane id (and its segments) and ID duplicates across lanes', () => {
    const { model, messages } = run([{ id: 'x', start: 0, end: 1 }], [{ id: 'a', label: 'dup', segments: [{ id: 'y', start: 0, end: 1 }] }, { id: 'b', label: 'B', segments: [{ id: 'x', start: 0, end: 1 }, { id: 'z', start: 0, end: 2 }] }]);
    expect(messages).toEqual(['LaneTimeline: duplicate lane ID dropped', 'LaneTimeline: invalid range or duplicate segment ID dropped']);
    expect(model.flat.map(i => i.segment.id)).toEqual(['x', 'z']); expect(model.lanes.map(l => l.id)).toEqual(['a', 'b']);
  });
  it('keeps the explicit token as an index, never a resolved colour', () => {
    const { model } = run([{ id: 'x', start: 0, end: 1, colorToken: 'chart-series-2' }, { id: 'y', start: 0, end: 1, neutral: true }]);
    expect(model.tokens).toEqual(['chart-series-2']); expect(Array.from(model.cols[0].color)).toEqual([1, 0]);
  });
});

describe('model access', () => {
  it('flat is array-like and byId resolves lazily to the same items', () => {
    const lanes = randomLanes(9, 3, 30); const model = prepareLanes(lanes, []);
    expect(model.flat).toHaveLength(90); expect(model.flat[90]).toBeUndefined();
    expect(model.flat.map(i => i.index)).toEqual(Array.from({ length: 90 }, (_, i) => i));
    const item = model.flat[47]; expect(item.laneIndex).toBe(1); expect(model.byId.get(item.segment.id)).toEqual(item);
    expect(model.byId.get('missing')).toBeUndefined();
    expect(item.segment).toBe(lanes[1].segments[17]); // the caller's own object
  });
  it('tooltip and summary text show the normalised depth for an input depth of -1', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const segment = { id: 'b', start: 0, end: 1, depth: -1 };
    const model = prepareLanes([{ id: 'a', label: 'A', segments: [segment] }], []);
    const text = segmentText(model, model.flat[0], undefined, 'en');
    expect(text).toContain('Depth 0'); expect(text).not.toContain('Depth -1');
    expect(model.flat[0].segment).toBe(segment);
    expect(segmentSummary(segment, 'en')).toContain('Depth -1');
  });
});

// Measurements (skipped by default): LANE_BENCH=1 NODE_OPTIONS=--expose-gc pnpm --filter @ap/components exec vitest run laneTimelineModel
describe.skipIf(!process.env.LANE_BENCH)('bench', () => {
  it('prepareLanes time and heap at 200k', () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    const heap = () => { gc?.(); gc?.(); gc?.(); const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
    const make = (count: number) => Array.from({ length: 100 }, (_, l) => ({ id: `l${l}`, label: `L${l}`, segments: Array.from({ length: count / 100 }, (_, i) => ({ id: `s${l}-${i}`, start: i * 10, end: i * 10 + 9, depth: i % 4 })) }));
    for (const count of [50_000, 200_000]) {
      const before = heap(); const input = make(count); const floor = heap() - before;
      const timeIt = (fn: () => unknown) => { const t = []; for (let i = 0; i < 5; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); } return t.sort((a, b) => a - b)[2]; };
      const oldMs = timeIt(() => oldPrepareLanes(input)); const newMs = timeIt(() => prepareLanes(input, []));
      const h0 = heap(); const kept = prepareLanes(input, []); const newBytes = heap() - h0;
      const h1 = heap(); const keptOld = oldPrepareLanes(input); const oldBytes = heap() - h1;
      console.info(`BENCH ${count}: input floor ${(floor / 1e6).toFixed(1)} MB (${(floor / count).toFixed(0)} B/seg); old prepare ${oldMs.toFixed(1)} ms ${(oldBytes / 1e6).toFixed(1)} MB; new prepare ${newMs.toFixed(1)} ms ${(newBytes / 1e6).toFixed(1)} MB (${(newBytes / count).toFixed(1)} B/seg)`);
      expect(kept.flat.length + keptOld.flat.length).toBe(2 * count);
    }
  });
});
