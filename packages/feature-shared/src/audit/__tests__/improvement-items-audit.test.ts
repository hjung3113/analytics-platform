import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';

describe('improvement item audit detail schemas (#1328 b)', () => {
  it.each([
    ['improvement.item.created', { itemNo: 1, hasOrigin: true, targetCount: 2, assigned: false, questLinked: false }],
    ['improvement.item.updated', { itemNo: 3, changed: ['problem', 'targets'], targetCount: 1 }],
    ['improvement.item.status_changed', { itemNo: 3, from: 'open', to: 'in_progress' }],
    ['improvement.item.reopened', { itemNo: 3, from: 'done', to: 'in_progress' }],
    ['improvement.item.assigned', { itemNo: 3, assigneeId: ID, previousAssigneeId: null }],
    ['improvement.item.quest_linked', { itemNo: 3, questId: 'q-1', previousQuestId: null }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['improvement.item.created', 'the problem text', { itemNo: 1, hasOrigin: true, targetCount: 0, assigned: false, questLinked: false, problem: 'x' }],
    ['improvement.item.updated', 'the action text', { itemNo: 1, changed: ['action'], targetCount: 0, action: 'x' }],
    ['improvement.item.status_changed', 'the reason text', { itemNo: 1, from: 'open', to: 'dropped', reason: 'x' }],
    ['improvement.item.status_changed', 'an unknown status', { itemNo: 1, from: 'open', to: 'sealed' }],
    ['improvement.item.updated', 'no changed field', { itemNo: 1, changed: [], targetCount: 0 }],
  ] as const)('%s rejects %s', (type, _label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(false);
  });
});
