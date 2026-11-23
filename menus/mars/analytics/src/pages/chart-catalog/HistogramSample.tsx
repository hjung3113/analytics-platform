import { useMemo } from 'react';
import { useMessages } from '@ap/kernel';
import { AnalysisChart, type HistogramSpec } from '@ap/components';
import { HISTOGRAM_MESSAGES } from './histogramMessages';

const SAMPLE_SIZE = 1240;
const TAIL_SIZE = 100;
const UPPER_BOUND = 6;
/** Deterministic bell-shaped observations plus a separate tail; not equipment data. */
export const histogramSampleValues = Array.from({ length: SAMPLE_SIZE }, (_, i) => {
  if (i >= SAMPLE_SIZE - TAIL_SIZE) return 6.5 + (i % TAIL_SIZE) / (TAIL_SIZE - 1) * 1.1;
  const quantile = ((i * 137 % (SAMPLE_SIZE - TAIL_SIZE)) + 0.5) / (SAMPLE_SIZE - TAIL_SIZE);
  return Math.max(2.8, Math.min(5.5, 4.05 + 0.25 * Math.log(quantile / (1 - quantile))));
});

export function HistogramSample({ height }: { height: number }) {
  const m = useMessages(HISTOGRAM_MESSAGES);
  const spec = useMemo<HistogramSpec>(() => ({
    kind: 'histogram', values: histogramSampleValues, xLabel: m('xLabel'), xUnit: m('seconds'),
    binning: { width: 0.25, domain: [2.75, 8] },
    referenceLines: [{ id: 'htm-upper', value: UPPER_BOUND, label: m('upper'), tone: 'danger' }],
    binStatus: bin => bin.count > 0 && bin.start >= UPPER_BOUND ? { tone: 'danger', label: m('exceeded'), reason: m('reason') } : undefined,
  }), [m]);
  return <AnalysisChart chartId="chart-catalog-histogram" title={m('title')} description={m('sample')}
    legendCaption={m('caption')} legendPlacement="top" chrome="standard" unit={m('count')}
    spec={spec} height={height} imageCopy imagePrint />;
}
