import { describe, expect, it } from 'vitest';

import { refStateOf } from '../domain/ref-state.js';

describe('refStateOf', () => {
  it.each([
    [{ holdsInvestigate: true, setResolved: true }, { code: 'available' }],
    [{ holdsInvestigate: false, setResolved: true }, { code: 'no_access', reason: 'capability_lost' }],
    [{ holdsInvestigate: true, setResolved: false }, { code: 'no_access', reason: 'round_not_visible' }],
    // The capability is the first cause named when both are lost.
    [{ holdsInvestigate: false, setResolved: false }, { code: 'no_access', reason: 'capability_lost' }],
  ])('%j → %j', (input, state) => {
    expect(refStateOf(input)).toEqual(state);
  });
});
