import type { ThemeColorToken } from '@ap/ui/theme';
import type { ChartPoint, ChartSeries } from './AnalysisChartFrame';
import { chartTheme, token } from './EChart';

/** Consumer-given judgement. The chart never derives a status from a value or a scale. */
export type ChartStatus = {
  /** Colour always accompanies a distinct marker and the label/reason text. */
  tone: 'danger' | 'warning' | 'neutral';
  /** Short name; distinct (tone, label) pairs form the status legend. */
  label: string;
  /** Per-piece text for tooltip, summary, keyboard table and CSV. */
  reason?: string;
};
export const STATUS_GLYPHS = { danger: '▲', warning: '▼', neutral: '◆' } as const;
const STATUS_TOKENS = { danger: 'chart-status-critical', warning: 'chart-status-warn', neutral: 'chart-no-data-pattern' } as const satisfies Record<ChartStatus['tone'], ThemeColorToken>;
export const statusColor = (status: ChartStatus) => token(STATUS_TOKENS[status.tone]);
/** Neutral has no severity hue: use the pattern token when it meets 3:1, otherwise an existing neutral foreground that does. */
export function statusBorderColor(status: ChartStatus, fill: string) {
  const color = statusColor(status);
  if (status.tone !== 'neutral') return color;
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
  if (contrast(color, fill) >= 3) return color;
  // Reuse the theme text foreground and the card surface as neutral high-contrast alternatives.
  const dark = chartTheme().tooltip.textStyle.color; const light = token('surface-card');
  return contrast(dark, fill) >= contrast(light, fill) ? dark : light;
}
export const statusKey = (status: ChartStatus) => JSON.stringify([status.tone, status.label]);
export const statusText = (status: ChartStatus | undefined) => status ? `${STATUS_GLYPHS[status.tone]} ${status.label}${status.reason ? ` · ${status.reason}` : ''}` : '';
export function distinctStatuses(statuses: readonly (ChartStatus | undefined)[]): ChartStatus[] {
  const distinct = new Map<string, ChartStatus>();
  for (const status of statuses) if (status && !distinct.has(statusKey(status))) distinct.set(statusKey(status), status);
  return [...distinct.values()];
}
export const chartPointKey = (point: Pick<ChartPoint, 'seriesId' | 'x'>) => JSON.stringify([point.seriesId, point.x]);
/** The visible projection only: no null/non-finite pieces, hidden series or line statuses. */
export function barStatuses(series: readonly ChartSeries[], horizontal: boolean, pointStatus?: (point: ChartPoint) => ChartStatus | undefined) {
  const statuses = new Map<string, ChartStatus>();
  if (pointStatus) for (const s of series) {
    if (!horizontal && s.kind !== 'bar') continue;
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
  return {
    show: true, formatter: `{status|${STATUS_GLYPHS[status.tone]}}`, fontSize: 10,
    rich: { status: { color: statusColor(status), backgroundColor: token('surface-card'), borderColor: statusColor(status), borderWidth: 1, borderRadius: 2, padding: [0, 2], fontSize: 10 } },
  };
}
