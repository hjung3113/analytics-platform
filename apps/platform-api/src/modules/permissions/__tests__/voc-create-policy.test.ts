// `canCreateVoc` (#1358, ADR-0113). No database: the check service is a stub that answers like `checkCapability`
// would for the facts under test, so the test pins the policy table itself.

import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../db/tx.js';
import type { ActorContext, CheckService, Decision } from '../check-service.js';
import { type VocCreateSystem, canCreateVoc } from '../voc-create-policy.js';

const tx = {} as Tx;
const actorOf = (role_level: string): ActorContext => ({
  actor_id: 'a-1',
  workspace_id: 'ws-1',
  role_level,
});
const system = (over: Partial<VocCreateSystem> = {}): VocCreateSystem => ({
  id: 'ms-1',
  external_key: null,
  voc_create_mode: 'open',
  ...over,
});
const granted: Decision = { allow: true, via: 'managed_system_scope', grant_id: 'g-1' };
const noGrant: Decision = { allow: false, reason: 'no_grant', requestable: [{ workspace_id: 'ws-1' }] };
const denied: Decision = { allow: false, reason: 'explicit_deny', requestable: null };
const foreign: Decision = { allow: false, reason: 'workspace_mismatch', requestable: null };

function stub(decision: Decision) {
  const calls: unknown[][] = [];
  const checkService = {
    checkCapability: async (...args: unknown[]) => {
      calls.push(args);
      return decision;
    },
  } as unknown as CheckService;
  return { checkService, calls };
}

async function run(actorRole: string, sys: VocCreateSystem, decision: Decision) {
  return canCreateVoc(stub(decision).checkService, actorOf(actorRole), sys, { tx });
}

describe('canCreateVoc', () => {
  it.each([
    ['user', noGrant, true],
    ['developer', noGrant, true],
    ['admin', noGrant, true],
    ['user', denied, false],
    ['admin', denied, false],
    ['user', foreign, false],
  ] as const)('open: %s with %j → %s', async (role, decision, expected) => {
    expect(await run(role, system(), decision)).toBe(expected);
  });

  it.each([
    ['user', noGrant, false],
    ['developer', noGrant, false],
    ['user', granted, true],
    ['developer', granted, true],
    ['admin', noGrant, true],
    ['user', denied, false],
    ['admin', denied, false],
    ['user', foreign, false],
  ] as const)('restricted: %s with %j → %s', async (role, decision, expected) => {
    expect(await run(role, system({ voc_create_mode: 'restricted' }), decision)).toBe(expected);
  });

  it('the platform system is open whatever its stored mode, but a deny still applies', async () => {
    const platform = system({ external_key: 'platform', voc_create_mode: 'restricted' });
    expect(await run('user', platform, noGrant)).toBe(true);
    expect(await run('user', platform, denied)).toBe(false);
  });

  it('asks Permission about voc.create scoped to this system, inside the caller transaction', async () => {
    const { checkService, calls } = stub(noGrant);
    await canCreateVoc(checkService, actorOf('user'), system(), { tx });
    expect(calls).toEqual([
      [actorOf('user'), 'voc.create', { workspace_id: 'ws-1', managed_system_id: 'ms-1' }, { tx }],
    ]);
  });
});
