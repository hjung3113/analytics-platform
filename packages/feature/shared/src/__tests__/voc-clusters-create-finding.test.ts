import { describe, expect, it } from 'vitest';

import { createFindingRequestSchema } from '../findings/index.js';
import { createFindingFromVocClusterRequestSchema } from '../voc-clusters/index.js';

const BASE_REQUEST = {
  title: 'Repeated connection failures',
  summary: 'Several VOCs report connection failures.',
  severity: 'medium',
} as const;

function vocId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

describe('createFindingFromVocClusterRequestSchema evidence_voc_ids', () => {
  it('allows omission and an empty list, and bounds unique member ids to 1000', () => {
    expect(createFindingFromVocClusterRequestSchema.parse(BASE_REQUEST)).toEqual(BASE_REQUEST);
    expect(
      createFindingFromVocClusterRequestSchema.parse({ ...BASE_REQUEST, evidence_voc_ids: [] })
        .evidence_voc_ids,
    ).toEqual([]);
    expect(
      createFindingFromVocClusterRequestSchema.parse({
        ...BASE_REQUEST,
        evidence_voc_ids: Array.from({ length: 1000 }, (_, index) => vocId(index + 1)),
      }).evidence_voc_ids,
    ).toHaveLength(1000);

    expect(
      createFindingRequestSchema.safeParse({ ...BASE_REQUEST, evidence_voc_ids: [vocId(1)] })
        .success,
    ).toBe(false);
  });

  it('rejects duplicate ids and a list above the bound', () => {
    expect(
      createFindingFromVocClusterRequestSchema.safeParse({
        ...BASE_REQUEST,
        evidence_voc_ids: [vocId(1), vocId(1)],
      }).success,
    ).toBe(false);
    expect(
      createFindingFromVocClusterRequestSchema.safeParse({
        ...BASE_REQUEST,
        evidence_voc_ids: Array.from({ length: 1001 }, (_, index) => vocId(index + 1)),
      }).success,
    ).toBe(false);
  });
});
