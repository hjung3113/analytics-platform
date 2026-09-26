import type { PublishedMetric } from '@ap/contracts';

export type MetricInit =
  | { phase: 'skip' }
  | { phase: 'confirm'; metricVersion: string }
  | { phase: 'blocked'; reason: 'unknown_metric' | 'unpublished' };

/**
 * Id-only on an initialization route is completed from the server's published pointers (docs/06 §6.1).
 * A finished pair, or a route that does not initialize, is `skip`.
 */
export function classifyMetricInit(published: readonly PublishedMetric[], initializesMetric: boolean, metricId: string | null, metricVersion: string | null): MetricInit {
  if (!initializesMetric || metricId === null || metricVersion !== null) return { phase: 'skip' };
  const row = published.find(m => m.metricId === metricId);
  if (!row) return { phase: 'blocked', reason: 'unknown_metric' };
  if (row.publishedVersion === null) return { phase: 'blocked', reason: 'unpublished' };
  return { phase: 'confirm', metricVersion: row.publishedVersion };
}
