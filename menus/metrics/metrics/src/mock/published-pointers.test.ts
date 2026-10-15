import { describe, expect, it } from 'vitest';
import { PUBLISHED_METRICS } from '@ap/mock-server';
import { METRICS } from './catalog';

describe('published metric versions', () => {
  it('equals the catalog published pointers, in catalog order', () => {
    expect(PUBLISHED_METRICS.map(m => [m.metricId, m.publishedVersion])).toEqual(
      METRICS.map(m => [m.metricId, m.publishedPointer]),
    );
  });
});
