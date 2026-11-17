import { describe, expect, it } from 'vitest';
import { panelQueryIdentity } from '../panel-inputs';

const prc = { queryInputs: { context: ['prcGroup'] as const } };
const both = { queryInputs: { context: ['condition', 'prcGroup'] as const } };

describe('panel query identity — membershipBasis (#2433)', () => {
  it('counts membershipBasis while an applied PRC group is set', () => {
    const start = { prcGroups: ['P1'], condition: null, membershipBasis: 'startEvent' };
    expect(panelQueryIdentity(prc, start)).not.toBe(panelQueryIdentity(prc, { ...start, membershipBasis: 'endEvent' }));
  });
  it('ignores membershipBasis when neither condition nor PRC group applies', () => {
    const none = { prcGroups: null, condition: null, membershipBasis: 'startEvent' };
    expect(panelQueryIdentity(both, none)).toBe(panelQueryIdentity(both, { ...none, membershipBasis: 'endEvent' }));
  });
});
