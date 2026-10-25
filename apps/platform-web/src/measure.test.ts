import { describe, expect, it } from 'vitest';
import { canClientSum, type Reaggregation } from '@ap/contracts';

describe('canClientSum (reaggregation contract, docs/01 §집계 가능성 계약)', () => {
  it.each<[Reaggregation, boolean]>([
    ['sum', true],
    ['ratioOfSums', false],
    ['recomputeFromDistribution', false],
    ['none', false],
  ])('%s -> %s', (reaggregation, expected) => {
    expect(canClientSum({ reaggregation })).toBe(expected);
  });
});
