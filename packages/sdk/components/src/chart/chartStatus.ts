import type { ThemeColorToken } from '@ap/ui/theme';
import type { ChartPoint, ChartSeries } from './AnalysisChartFrame';
import { chartTheme, token } from './EChart';
import { chartMarkFontSize } from './chartMarks';
import { helperSeriesId } from './helperSeriesId';

/** Consumer-given judgement. The chart never derives a status from a value or a scale. */
export type ChartStatus = {
  /** Colour always accompanies a distinct marker and the label/reason text. */
  tone: 'danger' | 'warning' | 'neutral';
  /** Short name; distinct (tone, label) pairs form the status legend. */
  label: string;
  /** Per-piece text for tooltip, summary, keyboard table and CSV. */
  reason?: string;
  /**
   * Optional one-character symbol that replaces the tone's default glyph, for a menu whose judgement has a direction
   * (for example ▼ for "below the lower limit"). Anything but a single character, or one of `{ } |` (the chart's
   * rich-text syntax), falls back to the tone glyph. Give the same marker to every status with the same (tone, label).
   */
  marker?: string;
};
/** Severity only, no direction: a filled square, a diamond, an open circle (#2363). Danger is a square, not a circle, so it never shares a shape with a plain (circle) point in a legend (#2383). */
export const STATUS_GLYPHS = { danger: '■', warning: '◆', neutral: '○' } as const;
const usableMarker = (marker: string | undefined) => marker !== undefined && [...marker].length === 1 && !/[\s{}|]/.test(marker);
/** The symbol drawn and written for a status: the menu's `marker` when usable, otherwise the tone glyph. */
export const statusGlyph = (status: ChartStatus) => usableMarker(status.marker) ? status.marker! : STATUS_GLYPHS[status.tone];
const STATUS_TOKENS = { danger: 'chart-status-critical', warning: 'chart-status-warn', neutral: 'chart-no-data-pattern' } as const satisfies Record<ChartStatus['tone'], ThemeColorToken>;
export const statusColor = (status: ChartStatus) => token(STATUS_TOKENS[status.tone]);
const contrast = (a: string, b: string) => {
  const luminance = (rgb: string) => {
    const channels = rgb.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) return null;
    const [r, g, b] = channels.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const x = luminance(a); const y = luminance(b);
  return x === null || y === null ? 0 : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Neutral has no severity hue: use the pattern token when it meets 3:1, otherwise an existing neutral foreground that does. */
export function statusBorderColor(status: ChartStatus, fill: string) {
  const color = statusColor(status);
  if (status.tone !== 'neutral') return color;
  if (contrast(color, fill) >= 3) return color;
  // Reuse the theme text foreground and the card surface as neutral high-contrast alternatives.
  const dark = chartTheme().tooltip.textStyle.color; const light = token('surface-card');
  return contrast(dark, fill) >= contrast(light, fill) ? dark : light;
}
/** Match scatter's effective fill without changing the value series or its default opacity. */
export function statusFill(fill: string, opacity: number) {
  const rgb = (color: string) => color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  const foreground = rgb(fill); const surface = rgb(token('surface-card'));
  if (!foreground || !surface) return fill;
  return `rgb(${foreground.map((v, n) => v * opacity + surface[n] * (1 - opacity)).join(',')})`;
}
/** Keep severity hue; a second, neutral stroke separates a low-contrast outline from its fill. */
export function statusBacking(status: ChartStatus, fill: string) {
  const stroke = statusBorderColor(status, fill);
  if (contrast(stroke, fill) >= 3) return undefined;
  const candidates = [token('surface-card'), chartTheme().tooltip.textStyle.color];
  return candidates.sort((a, b) => Math.min(contrast(stroke, b), contrast(fill, b)) - Math.min(contrast(stroke, a), contrast(fill, a)))[0];
}
/**
 * Status ring widths for a cell or bar piece whose shorter side is `size` px (#2351): a 2px border and a 2px backing
 * just inside it, together at most a quarter of the size per side, so a thin cell keeps most of its fill. A backing
 * thinner than half a pixel is dropped.
 */
export function statusRing(size: number) {
  const budget = Math.max(0, size / 4);
  const border = Math.min(2, budget);
  const backing = Math.min(2, budget - border);
  return { border, backing: backing >= 0.5 ? backing : 0 };
}
/**
 * Opaque, silent borders above the scatter fill; only status cells participate. Both rings are drawn inside the cell (#2351)
 * as pixel rectangles of a custom series: a scatter symbol is a unit path scaled to its size, which stretches its stroke
 * unevenly on a non-square cell (thick sides, thin top and bottom) and lets it spill past the cell.
 */
export function heatmapStatusOutlines(cells: readonly { value: (number | null)[]; status: ChartStatus; fill: string; opacity?: number }[], symbolSize: number[], takenSeriesIds: Set<string>) {
  if (!cells.length) return [];
  const [width = 0, height = 0] = symbolSize;
  // A 0px side (unmeasured plot or a very dense grid) draws no cell, so its ring is kept in the option but not drawn.
  const drawn = width > 0 && height > 0;
  const { border, backing: backingWidth } = statusRing(drawn ? Math.min(width, height) : Infinity);
  const data = cells.map(c => ({ ...c, effective: statusFill(c.fill, c.opacity ?? 0.8) }));
  const ring = (baseId: string, z: number, items: readonly { value: (number | null)[]; stroke: string }[], lineWidth: number, inset: number) => ({
    id: helperSeriesId(baseId, takenSeriesIds), type: 'custom', z, silent: true, animation: false, clip: true, tooltip: { show: false }, emphasis: { disabled: true },
    data: items.map((c, index) => [c.value[0], c.value[1], index]),
    renderItem: (_params: unknown, api: { value: (dimension: number) => unknown; coord: (point: unknown[]) => number[] }) => {
      const [cx = 0, cy = 0] = api.coord([api.value(0), api.value(1)]);
      const shape = { x: cx - width / 2 + inset, y: cy - height / 2 + inset, width: Math.max(0, width - 2 * inset), height: Math.max(0, height - 2 * inset) };
      return { type: 'rect', ignore: !drawn, shape, style: { fill: 'none', stroke: items[Number(api.value(2))]!.stroke, lineWidth }, blur: { style: { opacity: 1 } } };
    },
  });
  const backings = backingWidth ? data.flatMap(c => { const stroke = statusBacking(c.status, c.effective); return stroke ? [{ value: c.value, stroke }] : []; }) : [];
  return [
    ...(backings.length ? [ring('__statusBacking', 3, backings, backingWidth, border + backingWidth / 2)] : []),
    ring('__statusOutline', 4, data.map(c => ({ value: c.value, stroke: statusBorderColor(c.status, c.effective) })), border, border / 2),
  ];
}
export const statusKey = (status: ChartStatus) => JSON.stringify([status.tone, status.label]);
export const statusText = (status: ChartStatus | undefined) => status ? `${statusGlyph(status)} ${status.label}${status.reason ? ` · ${status.reason}` : ''}` : '';
export function distinctStatuses(statuses: readonly (ChartStatus | undefined)[]): ChartStatus[] {
  const distinct = new Map<string, ChartStatus>();
  for (const status of statuses) if (status && !distinct.has(statusKey(status))) distinct.set(statusKey(status), status);
  return [...distinct.values()];
}
export const chartPointKey = (point: Pick<ChartPoint, 'seriesId' | 'x'>) => JSON.stringify([point.seriesId, point.x]);
/** One visible projection for all series: no null/non-finite pieces or hidden series. */
export function pointStatuses(series: readonly ChartSeries[], pointStatus?: (point: ChartPoint) => ChartStatus | undefined) {
  const statuses = new Map<string, ChartStatus>();
  if (pointStatus) for (const s of series) {
    for (const [x, value] of s.points) {
      if (value === null || !Number.isFinite(value)) continue;
      const point = { x, seriesId: s.id, value };
      const status = pointStatus(point);
      if (status) statuses.set(chartPointKey(point), status);
    }
  }
  return statuses;
}
/** A surface-backed marker stays legible even when threshold/value fill and status colour are identical. */
export function statusMarker(status: ChartStatus) {
  const fontSize = chartMarkFontSize();
  return {
    show: true, formatter: `{status|${statusGlyph(status)}}`, fontSize,
    rich: { status: { color: statusColor(status), backgroundColor: token('surface-card'), borderColor: statusColor(status), borderWidth: 1, borderRadius: 2, padding: [0, 2], fontSize } },
  };
}
