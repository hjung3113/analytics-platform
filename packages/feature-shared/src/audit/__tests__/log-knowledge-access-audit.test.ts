import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';

describe('log knowledge access audit detail schemas (#1504 S-a)', () => {
  it.each([
    ['knowledge.access.mode_changed', { targetKind: 'model', targetId: ID, from: 'internal', to: 'restricted' }],
    ['knowledge.access.rule_added', { ruleId: ID, targetKind: 'item', targetId: ID, granteeId: ID, effect: 'allow', expires: true }],
    ['knowledge.access.rule_revoked', { ruleId: ID, targetKind: 'software', targetId: ID, granteeId: ID, effect: 'deny' }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['knowledge.access.mode_changed', 'an unknown mode', { targetKind: 'model', targetId: ID, from: 'internal', to: 'secret' }],
    ['knowledge.access.mode_changed', 'a name', { targetKind: 'model', targetId: ID, from: 'internal', to: 'restricted', name: 'M1' }],
    ['knowledge.access.rule_added', 'a team grantee kind', { ruleId: ID, targetKind: 'item', targetId: ID, granteeId: ID, effect: 'allow', expires: false, granteeKind: 'team' }],
    ['knowledge.access.rule_added', 'an unknown target kind', { ruleId: ID, targetKind: 'vendor', targetId: ID, granteeId: ID, effect: 'allow', expires: false }],
    ['knowledge.access.rule_revoked', 'a reason text', { ruleId: ID, targetKind: 'item', targetId: ID, granteeId: ID, effect: 'allow', reason: 'x' }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
