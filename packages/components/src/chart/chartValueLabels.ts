import type { ThemeColorToken } from '@ap/ui/theme';
import type { ChartSeries } from './AnalysisChartFrame';

/** Which stacked-bar labels the Frame draws (horizontal + stacked only). */
export type ValueLabels = 'segment' | 'total' | 'both';

/** A row's total: the number, whether a shown series had no measurement in it, and who. */
export type RowTotal = { value: number; partial: boolean; missing: string[] };

/**
 * The fills a segment label colour is guaranteed for: every bar fill the chart palette offers (`ChartSeries.color`), each with the text
 * token that reads on it at 4.5:1 or more against the real token values (`chartValueLabels.test.ts` reads the token CSS and pins every pair).
 * A fill outside this set (any other `ThemeColorToken` is accepted by the type) gets `text-primary` on a surface-colour chip, like the 최소/최대 chips.
 */
/* eslint-disable shadcn/no-raw-colors -- CSS variable names for token(), not classes */
const SEGMENT_TEXT = {
  'chart-blue': 'text-primary', 'chart-teal': 'text-primary', 'chart-green': 'text-primary', 'chart-purple': 'text-primary',
  'cat-amber': 'text-primary', 'cat-teal': 'text-primary', 'chart-status-good': 'text-primary', 'chart-remainder': 'text-primary',
  'chart-series-1': 'text-on-accent', 'chart-series-2': 'text-on-accent', 'chart-series-3': 'text-on-accent', 'chart-series-4': 'text-on-accent',
  'cat-purple': 'text-on-accent', 'chart-status-warn': 'text-on-accent', 'chart-status-critical': 'text-on-accent',
} as const satisfies Partial<Record<ThemeColorToken, 'text-primary' | 'text-on-accent'>>;
export const SEGMENT_LABEL_FILLS = Object.keys(SEGMENT_TEXT) as ThemeColorToken[];
/** Text token for a segment label on `fill`, and whether it needs a surface chip because the fill is outside the supported set. */
export function segmentLabelStyle(fill: ThemeColorToken): { text: 'text-primary' | 'text-on-accent'; chip: boolean } {
  const text = (SEGMENT_TEXT as Partial<Record<ThemeColorToken, 'text-primary' | 'text-on-accent'>>)[fill];
  return text ? { text, chip: false } : { text: 'text-primary', chip: true };
}
/* eslint-enable shadcn/no-raw-colors */

/** Segment label: grouped digits, no compact notation (1,234 / 12.3), so it reads like the uncompacted numbers beside it; the exact value stays in the tooltip. */
export function shortNumber(v: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 }).format(v);
}

export const LABEL_FONT = 10;
/** Average glyph advance of a total (bold, 11px) plus its padding; sizes the grid room for the widest total. */
const GLYPH_PX = 6;
const LABEL_PAD = 4;
export function labelWidth(text: string): number { return text.length * GLYPH_PX + LABEL_PAD; }

export type LabelRect = { x: number; y: number; width: number; height: number };
/** A segment label stays when ECharts' own resolved label box fits the resolved bar box in both directions (the padding keeps it off the edges). */
export function labelFitsSegment(label: LabelRect, segment: LabelRect): boolean {
  return label.width + LABEL_PAD <= segment.width && label.height <= segment.height;
}

/**
 * Per category total of the shown series. `mayClientSum`: the client adds the shown segments. Otherwise only `serverTotals` count, and only while every
 * active series is shown (a server total includes hidden ones). Either way a row with a `null` among its shown segments is partial and names them,
 * and a row with only `null`s has no total (06 §16); a measured 0 is a value.
 */
export function resolveRowTotals(i: {
  displayed: readonly ChartSeries[]; categories: readonly string[]; mayClientSum: boolean; allShown: boolean; serverTotals?: ReadonlyMap<string, number | null>;
}): Map<string, RowTotal> {
  const out = new Map<string, RowTotal>();
  for (const x of i.categories) {
    let sum = 0; let measured = 0; const missing: string[] = [];
    for (const s of i.displayed) {
      const y = s.points.find(([label]) => label === x)?.[1] ?? null;
      if (y === null) missing.push(s.name); else { sum += y; measured++; }
    }
    if (measured === 0) continue;
    if (i.mayClientSum) { out.set(x, { value: sum, partial: missing.length > 0, missing }); continue; }
    const server = i.allShown ? i.serverTotals?.get(x) : undefined;
    if (server !== undefined && server !== null) out.set(x, { value: server, partial: missing.length > 0, missing });
  }
  return out;
}

/** Row sum of the shown, measured segments: where the total label sits in a plain stacked bar. */
export function stackEnd(displayed: readonly ChartSeries[], x: string): number {
  let end = 0;
  for (const s of displayed) { const y = s.points.find(([label]) => label === x)?.[1]; if (typeof y === 'number' && y > 0) end += y; }
  return end;
}
