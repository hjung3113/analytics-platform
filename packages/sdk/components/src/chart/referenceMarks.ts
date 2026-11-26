import type { ScatterSeriesOption } from 'echarts/charts';
import { chartReferenceLineTheme, type chartTheme } from './EChart';
import type { ScatterSpec } from './AnalysisChart';
import { statusColor, type ChartStatus } from './chartStatus';

export type ChartReferenceAxis = 'x' | 'y';

export type ChartReferenceLine = {
  type: 'line';
  axis: ChartReferenceAxis;
  value: number;
  label: string;
  kind?: 'spec' | 'target' | 'previous' | 'statistic';
  /** Histogram may use an ID to reject duplicates. */
  id?: string;
  tone?: ChartStatus['tone'];
  /** Frame only: suppress the line when its unit or definition version differs. */
  unit?: string;
  metricVersion?: string;
};

export type ChartReferenceBand = {
  type: 'band';
  axis: ChartReferenceAxis;
  from: number;
  to: number;
  label: string;
};

export type ChartReferenceMark = ChartReferenceLine | ChartReferenceBand;

export type ChartReferenceOptions = {
  /** Opt-in Cartesian reference marks. When given, takes the place of the legacy line prop. */
  referenceMarks?: readonly ChartReferenceMark[];
};

type Theme = ReturnType<typeof chartTheme>;
type MarkLine = NonNullable<ScatterSeriesOption['markLine']>;
type MarkArea = NonNullable<ScatterSeriesOption['markArea']>;
// ECharts MarkLineModel defaults to two decimals before MarkLineView checks the axis extent.
const MARK_LINE_PRECISION = 2;

export function isFiniteReferenceMark(mark: ChartReferenceMark) {
  return mark.type === 'line' ? Number.isFinite(mark.value) : Number.isFinite(mark.from) && Number.isFinite(mark.to);
}

export function referenceValues(marks: readonly ChartReferenceMark[] | undefined, axis: ChartReferenceAxis, { bandExtent }: { bandExtent?: 'required' | 'optional' } = {}): number[] {
  const valid = (marks ?? []).filter(mark => mark.axis === axis && isFiniteReferenceMark(mark));
  const hasBandExtent = bandExtent !== undefined && valid.some(mark => mark.type === 'band');
  if (bandExtent === 'required' && !hasBandExtent) return [];
  return valid.flatMap(mark => {
    if (mark.type === 'band') return [mark.from, mark.to];
    return hasBandExtent ? [mark.value, Number(mark.value.toFixed(MARK_LINE_PRECISION))] : [mark.value];
  });
}

type FrameMarkLine = { y: number; label: string; unit?: string; metricVersion?: string };

export function frameReferenceLines(lines: readonly FrameMarkLine[], axis: ChartReferenceAxis): ChartReferenceLine[] {
  return lines.map(({ y, ...line }) => ({ ...line, type: 'line', axis, value: y }));
}

export function scatterReferenceMarks(spec: ScatterSpec) {
  return (spec.referenceMarks ?? spec.referenceLines?.map<ChartReferenceMark>(line => ({ ...line, type: 'line' })))?.filter(isFiniteReferenceMark);
}

type LinePlacement = { scatterX?: boolean; histogramMidpoint?: number };

export function referenceLineOption(theme: Theme, marks: readonly ChartReferenceMark[] | undefined, placement: LinePlacement = {}): MarkLine {
  const style = theme.referenceLine;
  const histogram = placement.histogramMidpoint !== undefined;
  return {
    ...style,
    ...(histogram ? { symbol: ['none', 'none'] } : {}),
    data: marks?.flatMap<NonNullable<MarkLine['data']>[number]>(mark => {
      if (mark.type !== 'line') return [];
      const color = mark.tone ? statusColor({ tone: mark.tone, label: mark.label }) : style.lineStyle.color;
      if (mark.axis === 'x' && placement.histogramMidpoint !== undefined) {
        return [{ name: mark.label, xAxis: mark.value, lineStyle: { type: style.lineStyle.type, color },
          label: chartReferenceLineTheme.histogramXLabel(style.label.position, color, mark.label, mark.value < placement.histogramMidpoint) }];
      }
      return [{
        name: mark.label,
        [mark.axis === 'x' ? 'xAxis' : 'yAxis']: mark.value,
        ...(mark.tone ? { lineStyle: { color } } : {}),
        ...(mark.axis === 'x' && placement.scatterX
          ? { label: { ...chartReferenceLineTheme.scatterXLabel, ...(mark.tone ? { color } : {}) } }
          : mark.tone ? { label: { color } } : {}),
      }];
    }),
  };
}

export function referenceBandData(theme: Theme, marks?: readonly ChartReferenceMark[]): NonNullable<MarkArea['data']> {
  return (marks ?? []).flatMap(mark => {
    if (mark.type !== 'band') return [];
    const axis = mark.axis === 'x' ? 'xAxis' : 'yAxis';
    return [[{ name: mark.label, [axis]: Math.min(mark.from, mark.to),
      itemStyle: theme.referenceBand, label: chartReferenceLineTheme.bandLabel(theme.referenceBand.color, mark.axis) },
    { [axis]: Math.max(mark.from, mark.to) }]];
  });
}

export function referenceMarkOptions(theme: Theme, marks?: readonly ChartReferenceMark[]): { markLine?: MarkLine; markArea?: MarkArea } {
  const valid = marks?.filter(isFiniteReferenceMark);
  const bands = referenceBandData(theme, valid);
  return {
    ...(valid?.some(mark => mark.type === 'line') ? { markLine: referenceLineOption(theme, valid) } : {}),
    ...(bands.length ? { markArea: { silent: true, data: bands } } : {}),
  };
}
