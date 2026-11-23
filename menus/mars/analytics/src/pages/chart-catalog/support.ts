import { ANALYTICS_MESSAGES } from '../../messages';
import type { CatalogKind } from '../../endpoints';
import { HISTOGRAM_MESSAGES } from './histogramMessages';

type Label = { ko: string; en: string };
export const kindLabels: Record<CatalogKind, Label> = {
  sequence: ANALYTICS_MESSAGES.supportOrderTrackSynthetic,
  histogram: HISTOGRAM_MESSAGES.kind,
  topNBar: ANALYTICS_MESSAGES.supportTopnBar, lane: ANALYTICS_MESSAGES.supportLaneTimeline,
  line: ANALYTICS_MESSAGES.supportLine, bar: ANALYTICS_MESSAGES.supportBar, heatmap: ANALYTICS_MESSAGES.supportHeatmap,
  donut: ANALYTICS_MESSAGES.supportDonut, scatter: ANALYTICS_MESSAGES.supportScatter,
  boxPlot: ANALYTICS_MESSAGES.supportBoxPlot, pareto: ANALYTICS_MESSAGES.supportPareto,
  breakdown: ANALYTICS_MESSAGES.supportBreakdownBar,
};
export const statusLabels = {
  supported: ANALYTICS_MESSAGES.supportSupported, conditional: ANALYTICS_MESSAGES.supportConditional, unsupported: ANALYTICS_MESSAGES.supportUnsupported,
};
export type SupportCell = { id: string; label: Label; status: keyof typeof statusLabels; reason: Label; reference: string };
type Features = { compare?: boolean; annotate?: boolean; export?: boolean };
const noReason: Label = ANALYTICS_MESSAGES.supportText;
/** The only capability table: tabs and support rows derive from this projection of 06 §16. */
export function supportFor(kind: CatalogKind, features: Features | undefined): SupportCell[] {
  const frame = kind === 'line' || kind === 'bar';
  const sequence = kind === 'sequence';
  const histogram = kind === 'histogram';
  const lane = kind === 'lane' || sequence;
  const breakdown = kind === 'breakdown';
  const cell = (id: string, label: Label, status: SupportCell['status'], reason = noReason): SupportCell => ({ id, label, status, reason, reference: '06 §16' });
  const unavailable = ANALYTICS_MESSAGES.supportNotProvidedByThisChartKind;
  const featureOff = ANALYTICS_MESSAGES.supportDisabledByTheMenuFeatures;
  return [
    cell('zoom', ANALYTICS_MESSAGES.supportZoom, frame || lane || breakdown ? 'supported' : 'unsupported', frame || lane || breakdown ? noReason : unavailable),
    cell('selection', ANALYTICS_MESSAGES.supportBrushSelection, histogram ? 'unsupported' : 'supported', histogram ? unavailable : sequence ? ANALYTICS_MESSAGES.supportDragOrShiftArrowsToBrushClick : lane ? ANALYTICS_MESSAGES.supportTurnOnBrushThenDragOrShift : breakdown
      ? ANALYTICS_MESSAGES.supportDragACategoryRangeWithBrushTime
      : frame
      ? ANALYTICS_MESSAGES.supportDragARangeOrUseTimeInputs
      : kind === 'donut' || kind === 'boxPlot'
        ? ANALYTICS_MESSAGES.supportSelectOneItemByClickOrTable
        : ANALYTICS_MESSAGES.supportSelectMultipleItemsByClickOrTable),
    cell('reset', ANALYTICS_MESSAGES.supportReset, histogram ? 'unsupported' : 'supported', histogram ? unavailable : noReason),
    cell('compare', ANALYTICS_MESSAGES.supportCompare, frame && features?.compare ? 'supported' : 'unsupported', frame ? features?.compare ? ANALYTICS_MESSAGES.supportPreviousEqualPeriodSeriesSupplied : featureOff : unavailable),
    cell('annotate', ANALYTICS_MESSAGES.supportAnnotate, (frame || breakdown) && features?.annotate ? 'conditional' : 'unsupported', frame || breakdown ? features?.annotate ? ANALYTICS_MESSAGES.supportRequiresScopeAndASelectedRange : featureOff : unavailable),
    cell('export', ANALYTICS_MESSAGES.supportExport, !lane && features?.export ? 'supported' : 'unsupported', lane ? unavailable : features?.export ? noReason : featureOff),
    cell('drill', ANALYTICS_MESSAGES.supportDrill, breakdown ? 'supported' : frame || histogram || kind === 'lane' ? 'unsupported' : 'conditional', breakdown
      ? ANALYTICS_MESSAGES.supportEnterInTheLegendTreeMovesTo
      : sequence ? ANALYTICS_MESSAGES.supportDetailsForTheSelectedSyntheticItem : lane || histogram ? unavailable : frame
      ? ANALYTICS_MESSAGES.supportThisSampleDoesNotConnectPointActivation
      : ANALYTICS_MESSAGES.supportDetailsInSummaryTableForOneReal),
    cell('table', ANALYTICS_MESSAGES.supportShowAsTable, sequence ? 'supported' : lane ? 'unsupported' : 'supported', sequence ? ANALYTICS_MESSAGES.supportVisibleRangeItemList20PerPage : lane ? ANALYTICS_MESSAGES.supportArrowNavigationAndTextSummariesProvided : breakdown ? ANALYTICS_MESSAGES.supportTheStackedBarTableHasATotal : noReason),
  ];
}
export function supportCounts(row: SupportCell[]) {
  return { supported: row.filter(cell => cell.status === 'supported').length, conditional: row.filter(cell => cell.status === 'conditional').length, unsupported: row.filter(cell => cell.status === 'unsupported').length };
}
