import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

const SOURCE = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';

describe('log knowledge item audit detail schemas (ADR-0109)', () => {
  it.each([
    ['knowledge.item.created', { itemNo: 1, title: 'Chamber drift', revisionNo: 1 }],
    ['knowledge.item.revised', { itemNo: 1, title: 'Chamber drift', revisionNo: 2 }],
    [
      'knowledge.item.assessed',
      { itemNo: 1, title: 'T', dimension: 'verification', priorState: 'not_checked', newState: 'verified' },
    ],
    [
      'knowledge.item.derived',
      { itemNo: 2, title: 'T', revisionNo: 1, sourceItemId: SOURCE, sourceRevisionNo: 3 },
    ],
    ['knowledge.item.archived', { itemNo: 1, title: 'T' }],
    ['knowledge.item.restored', { itemNo: 1, title: 'T' }],
  ] as const)('%s accepts its detail', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['body text', { itemNo: 1, title: 'T', observation: 'x' }],
    ['a missing title', { itemNo: 1 }],
    ['an item number below 1', { itemNo: 0, title: 'T' }],
    ['an unknown dimension', { itemNo: 1, title: 'T', dimension: 'publication' }],
  ])('rejects %s', (_label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS['knowledge.item.created'].safeParse(detail).success).toBe(false);
  });
});
