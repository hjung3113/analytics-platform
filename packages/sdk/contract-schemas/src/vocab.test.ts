import { OUTCOMES } from '@ap/contracts';
import vocab from '@ap/contracts/vocab.json';
import { describe, expect, it } from 'vitest';
import { APPLIED_CAPABILITIES, ASSESSMENT_KINDS, ASSESSMENT_REASONS, ASSESSMENT_STATES, CONTEXT_KEYS, OUTCOME_VALUES } from './vocab.ts';
import { outcomeSchema } from './index.ts';

describe('vocabulary lists match @ap/contracts', () => {
  it('outcomes equal OUTCOMES and vocab.json', () => {
    expect([...OUTCOME_VALUES]).toEqual([...OUTCOMES]);
    expect([...OUTCOME_VALUES]).toEqual(vocab.outcomes);
    expect(outcomeSchema.options).toEqual(vocab.outcomes);
  });

  // The remaining lists have no runtime twin in contracts; the type-level equivalence (equivalence.test.ts) pins their
  // members, and this test pins that no list is empty or duplicated.
  it.each([
    ['assessment kinds', ASSESSMENT_KINDS],
    ['assessment states', ASSESSMENT_STATES],
    ['assessment reasons', ASSESSMENT_REASONS],
    ['context keys', CONTEXT_KEYS],
    ['applied capabilities', APPLIED_CAPABILITIES],
  ])('%s are non-empty and distinct', (_name, values) => {
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
  });
});
