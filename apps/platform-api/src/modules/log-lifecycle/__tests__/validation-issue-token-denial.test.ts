// ADR-0116 at declaration level (#1808 N2): every token is refused before any statement or capability lookup.
// DB-free: the database, the transaction and the check service throw on first use, so a removed early refusal fails here.

import { describe, expect, it } from 'vitest';

import { runAsToken } from '../../../lib/auth-context.js';
import type { EndpointHandlerArgs } from '../../menu-dispatch/types.js';
import type { LogLifecycleDeps } from '../deps.js';
import { validationIssueActions } from '../validation-issue-actions.js';
import { validationIssueEndpoints } from '../validation-issue-endpoints.js';

const ID = '00000000-0000-4000-8000-000000000001';
const actor = { actor_id: '00000000-0000-4000-8000-000000000002', workspace_id: '00000000-0000-4000-8000-000000000003', role_level: 'admin' };
const trap = (what: string) => new Proxy({}, { get(_t, key) { throw new Error(`${what}.${String(key)} touched before the token refusal`); } }) as never;
const deps: LogLifecycleDeps = { db: trap('db'), checkService: trap('checkService'), knowledgeLookup: trap('knowledgeLookup'), entityLinks: trap('entityLinks'), ruleCoverage: trap('ruleCoverage') };
const tx = trap('tx');
const SCOPE_SETS = [['validation.worker'], ['workspace.read'], []] as const;

const actionInput: Record<string, Record<string, unknown>> = {
  'logLifecycle.validationIssueRegister': { projectId: ID, firstRoundId: ID, title: 'Synthetic observation', body: 'Synthetic body' },
  'logLifecycle.validationIssueComment': { issueId: ID, body: 'Synthetic comment' },
  'logLifecycle.validationIssueCorrect': { issueId: ID, field: 'title', body: 'Synthetic correction' },
  'logLifecycle.validationIssueLinkOccurrence': { issueId: ID, roundId: ID },
  'logLifecycle.validationIssueLinkEvidence': { occurrenceId: ID, refs: [{ fileRef: 'synthetic.log', line: 1, fileSha256: 'b'.repeat(64) }] },
  'logLifecycle.roundDiscussionComment': { roundId: ID, body: 'Synthetic discussion' },
};
const readParams: Record<string, Record<string, unknown>> = {
  'logLifecycle.validationIssues': { projectId: ID },
  'logLifecycle.validationIssueDetail': { issueId: ID },
  'logLifecycle.validationIssueThread': { issueId: ID },
  'logLifecycle.validationIssueHistory': { issueId: ID },
  'logLifecycle.roundDiscussion': { roundId: ID },
};

const actions = validationIssueActions(deps);
const endpoints = validationIssueEndpoints(deps);
const cases = SCOPE_SETS.map((scopes) => [scopes.join(',') || 'no scope', scopes] as const);

describe('validation issue declarations refuse every token before any statement', () => {
  it('covers every declared action and read with valid input', () => {
    expect(actions.map((a) => a.spec.id).sort()).toEqual(Object.keys(actionInput).sort());
    expect(endpoints.map((e) => e.spec.id).sort()).toEqual(Object.keys(readParams).sort());
    for (const a of actions) expect(a.validate(actionInput[a.spec.id] ?? {})).toEqual([]);
    for (const e of endpoints) expect(e.validate(readParams[e.spec.id] ?? {})).toEqual({ ok: true });
  });

  describe.each(cases)('token scopes: %s', (_label, scopes) => {
    it.each(actions.map((a) => [a.spec.id, a] as const))('%s authorize answers false', async (_id, action) => {
      await runAsToken('t', scopes, async () => {
        expect(await action.authorize(actor, tx, actionInput[action.spec.id])).toBe(false);
      });
    });

    it.each(endpoints.map((e) => [e.spec.id, e] as const))('%s authorize answers false and handle forbidden', async (_id, endpoint) => {
      await runAsToken('t', scopes, async () => {
        expect(await endpoint.authorize(actor, tx)).toBe(false);
        const args = { actor, scopes: [], params: readParams[endpoint.spec.id] ?? {}, context: {}, correlationId: 'c', sessionVersion: () => Promise.resolve('v') } satisfies EndpointHandlerArgs;
        expect(await endpoint.handle(args)).toEqual({ outcome: 'forbidden', data: null });
      });
    });
  });
});
