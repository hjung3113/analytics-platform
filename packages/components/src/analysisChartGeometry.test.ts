import { describe, expect, it } from 'vitest';
import { GRID_BOTTOM, GRID_TOP, clampRowPitch, heatmapSymbolSize, revealScrollTop, rowPitchChartHeight } from './analysisChartGeometry';

describe('heatmap grid slot size', () => {
  it.each([
    [600, 240, 24, 10, [23, 22]],
    [300, 120, 24, 10, [10.5, 10]],
    [100, 80, 1, 1, [98, 78]],
    [1, 1, 24, 10, [0, 0]],
    [100, 80, 0, 0, [0, 0]],
  ])('fills %s × %s plot slots for %s × %s labels with a 2px gap', (width, height, xCount, yCount, expected) => {
    expect(heatmapSymbolSize(width, height, xCount, yCount)).toEqual(expected);
  });
});

describe('row pitch geometry (#690b)', () => {
  it.each([[10, 24], [24, 24], [30, 30], [Number.NaN, 24]])('clamps pitch %s to %s', (pitch, expected) => {
    expect(clampRowPitch(pitch)).toBe(expected);
  });
  it('sizes the chart as rows × pitch plus the grid margins', () => {
    expect(rowPitchChartHeight(5, 26)).toBe(5 * 26 + GRID_TOP + GRID_BOTTOM);
    expect(rowPitchChartHeight(5, 10)).toBe(5 * 24 + GRID_TOP + GRID_BOTTOM);
  });
  it('reveals a hidden row at gridTop + index × pitch and leaves a visible row alone', () => {
    expect(revealScrollTop(10, 26, 0, 200)).toBe(GRID_TOP + 10 * 26);
    expect(revealScrollTop(0, 26, 300, 200)).toBe(GRID_TOP);
    expect(revealScrollTop(2, 26, 0, 200)).toBeNull();
    expect(revealScrollTop(7, 26, 0, 200)).toBe(GRID_TOP + 7 * 26);
  });
});
