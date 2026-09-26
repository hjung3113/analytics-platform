import { describe, expect, it } from 'vitest';
import { METRICS } from './pages/data';
import { PUBLISHED_METRICS } from './api';

describe('published metric versions', () => {
  it('equals the catalog published pointers, in catalog order', () => {
    expect(PUBLISHED_METRICS.map(m => [m.metricId, m.publishedVersion])).toEqual(
      METRICS.map(m => [m.metricId, m.publishedPointer]),
    );
  });
});
