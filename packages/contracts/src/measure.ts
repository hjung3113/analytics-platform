/**
 * How a measured value may be recombined (docs/01 §집계 가능성 계약). One vocabulary for the server, export,
 * the metric catalogue and charts. Pure and runtime-free.
 *
 * - `sum`: additive; parts may be added on the client (counts, durations).
 * - `ratioOfSums`: a ratio; recombine by summing numerator and denominator separately, never by averaging ratios.
 * - `recomputeFromDistribution`: a quantile; recompute from the underlying distribution, never average P95s.
 * - `none`: must never be recombined on the client or by averaging; the server supplies every aggregate.
 */
export type Reaggregation = 'sum' | 'ratioOfSums' | 'recomputeFromDistribution' | 'none';

export type MeasureMeta = { reaggregation: Reaggregation; unit: string; metricVersion?: string };

/** True only for `sum`: a chart may add segments itself only then, otherwise the server gives the total. */
export function canClientSum(measure: Pick<MeasureMeta, 'reaggregation'>): boolean {
  return measure.reaggregation === 'sum';
}
