// #1808 H3 at declaration level: `waived` needs an internal_member human on top of triage and Gate rights.
// DB-free: the transaction answers the target lookup and the actor kind, the check service answers the held grants,
// so a removed human-only check (in `transitionPolicy` or the action) fails here. HTTP session exclusion of a `system`
// actor is covered by the auth tests; it cannot reach this judgment through the route.

import { describe, expect, it } from 'vitest';

import type { LogLifecycleDeps } from '../deps.js';
import { validationIssueActions } from '../validation-issue-actions.js';

const ID = '00000000-0000-4000-8000-000000000001';
const actor = { actor_id: '00000000-0000-4000-8000-000000000002', workspace_id: '00000000-0000-4000-8000-000000000003', role_level: 'developer' };
const trap = (what: string) => new Proxy({}, { get(_t, key) { throw new Error(`${what}.${String(key)} touched`); } }) as never;
const BOTH = ['lifecycle.issue.triage', 'lifecycle.gate.decide'];

function setup(actorType: string, held: readonly string[] = BOTH) {
  const asked: string[] = [];
  const checkService = {
    checkCapability: async (_actor: unknown, capability: string) => {
      asked.push(capability);
      return held.includes(capability) ? { allow: true, via: 'direct_grant' } : { allow: false, reason: 'no_grant', requestable: null };
    },
  };
  const deps: LogLifecycleDeps = { db: trap('db'), checkService: checkService as never, knowledgeLookup: trap('knowledgeLookup'), entityLinks: trap('entityLinks'), ruleCoverage: trap('ruleCoverage') };
  const tx = {
    // The visible issue target (`issueOwner`).
    execute: async () => ({ rows: [{ id: ID, project_id: ID, first_round_id: ID }] }),
    // The actor kind (`actorIsHuman`).
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ type: actorType }] }) }) }),
  } as never;
  const action = validationIssueActions(deps).find(a => a.spec.id === 'logLifecycle.validationIssueChangeState');
  if (!action) throw new Error('change-state action not declared');
  return { action, tx, asked };
}
const input = (toState: string) => ({ issueId: ID, toState, reason: 'Synthetic reason', assigneeActorId: ID, basisCommentId: ID });

describe('validationIssueChangeState human-only waived', () => {
  it('refuses waived for a non-internal_member actor holding both triage and Gate rights', async () => {
    const { action, tx, asked } = setup('system');
    expect(await action.authorize(actor, tx, input('waived'))).toBe(false);
    // Both rights were held and judged; only the human guard can refuse.
    expect(asked).toEqual(BOTH);
  });

  it('accepts waived for an internal_member holding both rights', async () => {
    const { action, tx } = setup('internal_member');
    expect(await action.authorize(actor, tx, input('waived'))).toBe(true);
  });

  it('refuses waived for an internal_member without the Gate right', async () => {
    const { action, tx } = setup('internal_member', ['lifecycle.issue.triage']);
    expect(await action.authorize(actor, tx, input('waived'))).toBe(false);
  });

  it('accepts on_hold for a non-internal_member with triage only (the human rule is waived-only)', async () => {
    const { action, tx } = setup('system', ['lifecycle.issue.triage']);
    expect(await action.authorize(actor, tx, input('on_hold'))).toBe(true);
  });
});
