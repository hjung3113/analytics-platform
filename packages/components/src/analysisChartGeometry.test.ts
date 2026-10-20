import { describe, expect, it } from 'vitest';
import { heatmapSymbolSize } from './analysisChartGeometry';

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
