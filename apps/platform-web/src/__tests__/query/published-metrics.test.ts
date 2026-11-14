import { describe, expect, it } from 'vitest';
import { classifyMetricInit as classify } from '@ap/kernel';
import { PUBLISHED_METRICS } from '@ap/mock-server';

const classifyMetricInit = (initializesMetric: boolean, metricId: string | null, metricVersion: string | null) =>
  classify(PUBLISHED_METRICS, initializesMetric, metricId, metricVersion);

describe('published metric versions', () => {
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
});
