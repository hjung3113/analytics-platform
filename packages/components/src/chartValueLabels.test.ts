import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ThemeColorToken } from '@ap/ui/theme';
import { SEGMENT_LABEL_FILLS, labelFitsSegment, resolveRowTotals, segmentLabelStyle, shortNumber } from './chartValueLabels';
import type { ChartSeries } from './AnalysisChartFrame';

const css = ['tokens.css', 'platform-tokens.css'].map(f => readFileSync(resolve(process.cwd(), '../ui/src/styles', f), 'utf8')).join('\n');
/** `--name: R G B;` or `--name: var(--other);` from the single :root palette. */
function rgbOf(name: string): [number, number, number] {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`token ${name} not found`);
  const value = m[1].trim();
  const ref = /^var\(--([\w-]+)\)$/.exec(value);
  if (ref) return rgbOf(ref[1]);
  const [r, g, b] = value.split(/\s+/).slice(0, 3).map(Number);
  return [r, g, b];
}
const luminance = ([r, g, b]: number[]) => { const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: number[], b: number[]) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const tokens = (css.match(/--(?:chart|cat)-[\w-]+(?=:)/g) ?? []).map(t => t.slice(2));

describe('segment label colour (#580d, UX-6, F5)', () => {
  it.each(SEGMENT_LABEL_FILLS)('%s: the chosen text token reads at 4.5:1', fill => {
    const { text, chip } = segmentLabelStyle(fill);
    expect(chip).toBe(false);
    expect(contrast(rgbOf(text), rgbOf(fill))).toBeGreaterThanOrEqual(4.5);
  });
  it('covers every bar fill the chart palette offers', () => {
    const bars = tokens.filter(t => /^(chart-(blue|teal|green|purple|series-[1-4]|status-(good|warn|critical)|remainder)|cat-(amber|teal|purple))$/.test(t));
    expect(bars.sort()).toEqual([...SEGMENT_LABEL_FILLS].sort());
  });
  it('takes text-primary on the light fills and text-on-accent on the dark ones', () => {
    expect(['chart-blue', 'chart-teal', 'chart-green', 'chart-purple', 'cat-amber', 'cat-teal', 'chart-status-good', 'chart-remainder'].map(f => segmentLabelStyle(f as ThemeColorToken).text)).toEqual(Array(8).fill('text-primary'));
    expect(['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4', 'cat-purple', 'chart-status-warn', 'chart-status-critical'].map(f => segmentLabelStyle(f as ThemeColorToken).text)).toEqual(Array(7).fill('text-on-accent'));
  });
  it.each(['chart-heat-div-0', 'chart-heat-div-4', 'text-primary', 'accent-primary', 'surface-card'] as ThemeColorToken[])('%s is outside the set: text-primary on a surface-card chip that reads at 4.5:1', fill => {
    expect(segmentLabelStyle(fill)).toEqual({ text: 'text-primary', chip: true });
    expect(contrast(rgbOf('text-primary'), rgbOf('surface-card'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('segment label fit and totals (#580d)', () => {
  const s = (id: string, ys: (number | null)[]): ChartSeries => ({ id, name: id.toUpperCase(), color: 'chart-blue', kind: 'bar', points: ys.map((y, n) => [`R${n}`, y]) });
  it('fits only when ECharts\' resolved label box is inside the segment box in both directions', () => {
    const seg = { x: 0, y: 0, width: 60, height: 18 };
    expect(labelFitsSegment({ x: 0, y: 0, width: 30, height: 10 }, seg)).toBe(true);
    expect(labelFitsSegment({ x: 0, y: 0, width: 58, height: 10 }, seg)).toBe(false);
    expect(labelFitsSegment({ x: 0, y: 0, width: 30, height: 19 }, seg)).toBe(false);
    expect(labelFitsSegment({ x: 0, y: 0, width: 5, height: 10 }, { ...seg, width: 0 })).toBe(false);
  });
  it('shortens a number', () => { expect(shortNumber(12345, 'en')).toBe('12.3K'); });
  it('adds only when the client may, marks a row with a null as partial, leaves an all-null row without a total', () => {
    const displayed = [s('a', [1, null, null]), s('b', [2, 3, null])];
    const sums = resolveRowTotals({ displayed, categories: ['R0', 'R1', 'R2'], mayClientSum: true, allShown: true });
    expect([...sums]).toEqual([['R0', { value: 3, partial: false, missing: [] }], ['R1', { value: 3, partial: true, missing: ['A'] }]]);
  });
  it('uses a server total only while every series is shown, and never when it is null', () => {
    const displayed = [s('a', [1, 2])];
    const serverTotals = new Map<string, number | null>([['R0', 10], ['R1', null]]);
    expect([...resolveRowTotals({ displayed, categories: ['R0', 'R1'], mayClientSum: false, allShown: true, serverTotals })]).toEqual([['R0', { value: 10, partial: false, missing: [] }]]);
    expect(resolveRowTotals({ displayed, categories: ['R0', 'R1'], mayClientSum: false, allShown: false, serverTotals }).size).toBe(0);
  });
  it('applies the missing-segment policy to a server total: a null segment makes it partial, a measured 0 does not, an all-null row has none (F2)', () => {
    const displayed = [s('a', [null, 0, null]), s('b', [3, 0, null])];
    const serverTotals = new Map<string, number | null>([['R0', 5], ['R1', 0], ['R2', 9]]);
    expect([...resolveRowTotals({ displayed, categories: ['R0', 'R1', 'R2'], mayClientSum: false, allShown: true, serverTotals })]).toEqual([
      ['R0', { value: 5, partial: true, missing: ['A'] }],
      ['R1', { value: 0, partial: false, missing: [] }],
    ]);
  });
});
