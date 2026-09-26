import { describe, expect, it } from 'vitest';
import { resolveMetric } from './pages/cycleData';
import { emptyGlobal } from '@ap/contracts';

describe('published metric versions', () => {
  it('does not fill a missing cycle_time version with the page default', () => {
    expect(resolveMetric({ ...emptyGlobal, metricId: 'cycle_time', metricVersion: null })).toEqual({ kind: 'unconfirmed', metricId: 'cycle_time' });
    expect(resolveMetric({ ...emptyGlobal, metricId: 'occupancy_physical', metricVersion: null })).toEqual({ kind: 'unconfirmed', metricId: 'occupancy_physical' });
    expect(resolveMetric({ ...emptyGlobal, metricId: 'cycle_time', metricVersion: '4' })).toEqual({
      kind: 'applied', metricId: 'cycle_time', metricVersion: '4', versionIsPageDefault: false,
    });
    expect(resolveMetric(emptyGlobal)).toMatchObject({ kind: 'page-default', metricId: 'cycle_time', metricVersion: '3' });
  });
});
