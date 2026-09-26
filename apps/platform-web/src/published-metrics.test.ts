import { describe, expect, it } from 'vitest';
import { resolveMetric } from './pages/analytics/cycleData';
import { METRICS } from './pages/metrics/data';
import { classifyMetricInit as classify } from '@ap/kernel';
import { PUBLISHED_METRICS } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';

const classifyMetricInit = (initializesMetric: boolean, metricId: string | null, metricVersion: string | null) =>
  classify(PUBLISHED_METRICS, initializesMetric, metricId, metricVersion);

describe('published metric versions', () => {
  it('equals the catalog published pointers, in catalog order', () => {
    expect(PUBLISHED_METRICS.map(m => [m.metricId, m.publishedVersion])).toEqual(
      METRICS.map(m => [m.metricId, m.publishedPointer]),
    );
  });

  it('confirms a published id and blocks unknown or unpublished', () => {
    expect(classifyMetricInit(true, 'cycle_time', null)).toEqual({ phase: 'confirm', metricVersion: '4' });
    expect(classifyMetricInit(true, 'occupancy_physical', null)).toEqual({ phase: 'confirm', metricVersion: '3' });
    expect(classifyMetricInit(true, 'queue_time', null)).toEqual({ phase: 'blocked', reason: 'unpublished' });
    expect(classifyMetricInit(true, 'setup_time', null)).toEqual({ phase: 'blocked', reason: 'unpublished' });
    expect(classifyMetricInit(true, 'no_such_metric', null)).toEqual({ phase: 'blocked', reason: 'unknown_metric' });
    expect(classifyMetricInit(true, 'cycle_time', '3')).toEqual({ phase: 'skip' });
    expect(classifyMetricInit(true, null, null)).toEqual({ phase: 'skip' });
    expect(classifyMetricInit(false, 'cycle_time', null)).toEqual({ phase: 'skip' });
  });

  it('does not fill a missing cycle_time version with the page default', () => {
    expect(resolveMetric({ ...emptyGlobal, metricId: 'cycle_time', metricVersion: null })).toEqual({ kind: 'unconfirmed', metricId: 'cycle_time' });
    expect(resolveMetric({ ...emptyGlobal, metricId: 'occupancy_physical', metricVersion: null })).toEqual({ kind: 'unconfirmed', metricId: 'occupancy_physical' });
    expect(resolveMetric({ ...emptyGlobal, metricId: 'cycle_time', metricVersion: '4' })).toEqual({
      kind: 'applied', metricId: 'cycle_time', metricVersion: '4', versionIsPageDefault: false,
    });
    expect(resolveMetric(emptyGlobal)).toMatchObject({ kind: 'page-default', metricId: 'cycle_time', metricVersion: '3' });
  });
});
