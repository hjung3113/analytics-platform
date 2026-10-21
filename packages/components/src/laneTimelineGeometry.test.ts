import { expect, it, vi } from 'vitest';
import { prepareLanes, niceTicks, densityBins, visibleRects, hitTest, segmentSummary, outlineStyle, laneTickLabel } from './laneTimelineGeometry';
const lanes = [{ id: 'a', label: 'A', segments: [{ id: 'a', start: 0, end: 100 }, { id: 'b', start: 20, end: 80, depth: 2, startBoundary: 'orphan' as const, endBoundary: 'open' as const }, { id: 'c', start: 50, end: 50 }] }];
it('uses UTC ticks and viewport bins without mutating unsorted input', () => {
  const ticks = niceTicks([0, 10000], 500);
  expect(ticks.every(Number.isFinite)).toBe(true);
  expect(new Set(ticks.map(t => new Date(t).toISOString())).size).toBe(ticks.length);
  expect(densityBins([0, 1, 10, 11, 20], [0, 20], 2)).toEqual([2, 3]);
});
it('picks calendar-unit UTC ticks for a 1-day span (12h) and a 6-hour span (2h)', () => {
  expect(niceTicks([Date.UTC(2026, 9, 21), Date.UTC(2026, 9, 22)], 600))
    .toEqual([Date.UTC(2026, 9, 21), Date.UTC(2026, 9, 21, 12), Date.UTC(2026, 9, 22)]);
  expect(niceTicks([Date.UTC(2026, 9, 21, 6), Date.UTC(2026, 9, 21, 12)], 600))
    .toEqual([Date.UTC(2026, 9, 21, 6), Date.UTC(2026, 9, 21, 8), Date.UTC(2026, 9, 21, 10), Date.UTC(2026, 9, 21, 12)]);
});
it('labels ticks with time only and adds the date once at the first tick and each day boundary', () => {
  expect(laneTickLabel(Date.UTC(2026, 9, 21), true)).toBe('10-21 00:00');
  expect(laneTickLabel(Date.UTC(2026, 9, 21, 12), false)).toBe('12:00');
  expect(laneTickLabel(Date.UTC(2026, 9, 22), false)).toBe('10-22 00:00');
  expect(laneTickLabel(Date.UTC(2026, 9, 21, 12, 30), false)).toBe('12:30');
});
it('clips geometry, preserves semantic flags, selects deepest then last input on overlap', () => {
  const model = prepareLanes(lanes, []);
  const rects = visibleRects(model, [30, 70], 400, 24, 0);
  expect(rects.find(rect => rect.segment.id === 'b')).toMatchObject({ x: 112, y: 4, height: 16, width: 288 });
  // Paints depth 0 with the last-input tie ('c') after 'a', and the deepest mark ('b') last.
  expect(rects.map(rect => rect.segment.id)).toEqual(['a', 'c', 'b']);
  expect(hitTest(rects, 250, 10)?.segment.id).toBe('b');
  // x=256.5 hits all three marks; the later shallow 'c' must lose to the deeper 'b'.
  expect(hitTest(rects, 256.5, 10)?.segment.id).toBe('b');
  expect(rects.find(rect => rect.segment.id === 'c')!.width).toBe(1.5);
  expect(segmentSummary(rects.find(rect => rect.segment.id === 'b')!.segment)).toContain('orphan');
  expect(segmentSummary(rects.find(rect => rect.segment.id === 'b')!.segment)).toContain('open');
  expect(segmentSummary(rects[0].segment)).not.toContain('orphan');
});
it('drops invalid ranges and duplicate IDs, normalizes invalid depth and sorts density copies', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const instants = [4, 1, NaN, 3];
  const model = prepareLanes([{ id: 'a', label: 'A', segments: [{ id: 'a', start: 4, end: 2 }, { id: 'b', start: 1, end: 2, depth: -1 }, { id: 'b', start: 1, end: 2 }, { id: 'c', start: NaN, end: 2 }] }], instants);
  expect(model.flat.map(item => item.segment.id)).toEqual(['b']);
  expect(model.flat[0].segment.depth).toBe(0);
  expect(model.density).toEqual([1, 3, 4]); expect(instants[0]).toBe(4);
  vi.restoreAllMocks();
});
it('bounds canvas geometry to visible rows for 100 lanes and 2000 segments', () => {
  const model = prepareLanes(Array.from({ length: 100 }, (_, lane) => ({ id: String(lane), label: String(lane), segments: Array.from({ length: 20 }, (_, i) => ({ id: `${lane}-${i}`, start: i * 10, end: i * 10 + 9 })) })), []);
  const rects = visibleRects(model, model.domain, 600, 240, 1200);
  expect(rects.length).toBeLessThanOrEqual(220);
  const start = performance.now();
  for (let i = 0; i < 2000; i++) hitTest(rects, 200, i % 240);
  console.info(`LaneTimeline 2000 hit tests: ${(performance.now() - start).toFixed(3)} ms; visible rects: ${rects.length}`);
});
it('orders equal-depth overlaps by last input and keeps arbitrary depth inside the row', () => {
  const model = prepareLanes([{ id: 'lane', label: 'Lane', segments: [{ id: 'first', start: 0, end: 10, depth: 80 }, { id: 'last', start: 0, end: 10, depth: 80 }] }], []);
  const rects = visibleRects(model, model.domain, 400, 24, 0);
  expect(rects[0].height).toBe(2);
  expect(hitTest(rects, 200, 12)?.segment.id).toBe('last');
});
it('measures visible-row hit testing with 100 lanes × 2000 segments', () => {
  const model = prepareLanes(Array.from({ length: 100 }, (_, lane) => ({ id: String(lane), label: String(lane), segments: Array.from({ length: 2000 }, (_, i) => ({ id: `${lane}-${i}`, start: i * 10, end: i * 10 + 9 })) })), []);
  const rects = visibleRects(model, model.domain, 600, 240, 1200);
  expect(model.flat).toHaveLength(200000); expect(rects).toHaveLength(20000);
  const start = performance.now();
  for (let i = 0; i < 2000; i++) hitTest(rects, 200, i % 240);
  console.info(`LaneTimeline 100×2000 fixture: 2000 hit tests ${(performance.now() - start).toFixed(3)} ms; backing 600×240 CSS pixels; ${rects.length} visible rects`);
});
it.each(['strong', 'weak', 'off'] as const)('defines %s rank outlines independently of selection', mode => {
  const style = outlineStyle('high', { high: 3, mid: 2, low: 1.5 }, mode);
  expect(style.width).toBe(mode === 'off' ? 0 : mode === 'weak' ? 1.5 : 3);
  expect(style.alpha).toBe(mode === 'weak' ? 0.5 : 1);
  expect(outlineStyle('invalid', { invalid: NaN }, mode).width).toBe(0);
});
it('keeps a zero-width point at the UTC Date limit inside the representable domain', () => {
  const model = prepareLanes([{ id: 'a', label: 'A', segments: [{ id: 'a', start: 8.64e15, end: 8.64e15 }] }], []);
  expect(model.domain[1]).toBe(8.64e15);
  expect(() => model.domain.map(time => new Date(time).toISOString())).not.toThrow();
});
