import { expect, it } from 'vitest';
import { intervalShape, orderTicks, orderX, visibleOrderedItems } from '../orderedIntervalGeometry';
import type { OrderedTrackItem } from '../orderedIntervalTypes';
const items: OrderedTrackItem[] = [
  { id: 'later-clock', laneKey: 'a', orderStart: 1, orderEnd: 4, state: 'ok', label: '12:00' },
  { id: 'earlier-clock', laneKey: 'a', orderStart: 5, orderEnd: 8, state: 'ok', label: '11:00' },
  { id: 'open', laneKey: 'b', orderStart: 7, state: 'ok', label: 'Open' },
  { id: 'point', kind: 'point', laneKey: 'b', orderStart: 9, state: 'ok', label: 'Point' },
];
it('positions by ordinal, preserving inverted display times', () => {
  expect(orderX(5, [0, 10], 100)).toBe(162);
  expect(visibleOrderedItems(items, [0, 10], ['a']).map((item) => item.id)).toEqual([
    'later-clock',
    'earlier-clock',
  ]);
});
it('windows both lanes and ranges including carryover and open intervals', () => {
  expect(visibleOrderedItems(items, [8, 10], ['b']).map((item) => item.id)).toEqual([
    'open',
    'point',
  ]);
  expect(visibleOrderedItems(items, [2, 3], ['a']).map((item) => item.id)).toEqual(['later-clock']);
});
it.each([
  [0, 12000, 1000, [0, 2000, 4000, 6000, 8000, 10000, 12000]],
  [3900, 4450, 700, [3900, 4000, 4100, 4200, 4300, 4400]],
])('uses integer 1/2/5 ticks for %i–%i', (from, to, width, expected) => {
  expect(orderTicks([from as number, to as number], width as number)).toEqual(expected);
});
it('distinguishes open ends and skips ordinary outlines below four pixels', () => {
  expect(intervalShape(items[2], [0, 10], 100)).toMatchObject({
    open: true,
    outline: true,
    width: 30,
  });
  expect(
    intervalShape({ ...items[0], kind: 'interval', orderEnd: 1.2 }, [0, 10], 100),
  ).toMatchObject({ open: false, outline: false });
});
it('flips a stable-width tooltip at the right edge and clamps both viewport edges', async () => {
  const { orderedTooltipPosition } = await import('../orderedIntervalGeometry');
  expect(orderedTooltipPosition(400, 200, 320, 80, 1440, 900)).toEqual({ left: 412, top: 212 });
  expect(orderedTooltipPosition(1400, 890, 320, 80, 1440, 900)).toEqual({
    left: 1068,
    top: 812,
  });
  expect(orderedTooltipPosition(150, -20, 320, 80, 360, 900)).toEqual({ left: 8, top: 8 });
  expect(orderedTooltipPosition(2000, 2000, 320, 80, 1440, 900)).toEqual({
    left: 1112,
    top: 812,
  });
});
it('keeps at least 3:1 contrast on both sides of the neutral selection halo for all state colours', async () => {
  const { readFileSync } = await import('node:fs');
  const css = ['tokens.css', 'platform-tokens.css']
    .map((file) => readFileSync(`${process.cwd()}/../ui/src/styles/${file}`, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = new Map(
    [...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
  const luminance = (name: string) => {
    let value = declarations.get(name) ?? '';
    const seen = new Set<string>();
    while (value.startsWith('var(')) {
      if (seen.has(value)) throw new Error('Circular colour alias');
      seen.add(value);
      value = declarations.get(value.slice(6, -1)) ?? '';
    }
    expect(value, name).toMatch(/^\d+\s+\d+\s+\d+$/);
    return value.split(/\s+/).reduce((sum, channel, index) => {
      const n = Number(channel) / 255;
      return (
        sum +
        (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4) *
          [0.2126, 0.7152, 0.0722][index]
      );
    }, 0);
  };
  const halo = luminance('surface-card');
  for (const token of [
    'chart-selection-outline',
    'chart-series-1',
    'chart-series-2',
    'chart-series-3',
  ]) {
    const other = luminance(token);
    expect(
      (Math.max(halo, other) + 0.05) / (Math.min(halo, other) + 0.05),
      token,
    ).toBeGreaterThanOrEqual(3);
  }
});
