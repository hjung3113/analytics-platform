import { APPROVAL_TRANSITIONS } from '@ap/contracts';
import { describe, expect, it } from 'vitest';

import { type ApprovalAction, type ApprovalState, canTransition } from '../acl.js';

// The server keeps its own transition table (it may not import the SDK at runtime); this test pins it to the contract.
const STATES: readonly ApprovalState[] = ['none', 'pending', 'approved', 'rejected'];
const ACTIONS = Object.keys(APPROVAL_TRANSITIONS) as ApprovalAction[];

describe('approval transition table drift against @ap/contracts', () => {
  it('covers the same actions as the contract', () => {
    expect([...ACTIONS].sort()).toEqual(['approve', 'reject', 'request', 'revoke']);
  });

  it.each(ACTIONS.flatMap((action) => STATES.map((state) => [state, action] as const)))(
    'canTransition(%s, %s) matches APPROVAL_TRANSITIONS',
    (state, action) => {
      expect(canTransition(state, action)).toBe(APPROVAL_TRANSITIONS[action].from.includes(state));
    },
  );
});
