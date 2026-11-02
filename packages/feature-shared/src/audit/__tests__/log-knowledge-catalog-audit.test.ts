import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../enums/audit-events.js';

describe('log knowledge catalog audit detail schemas (ADR-0107)', () => {
  it.each([
    ['knowledge.catalog.created', { code: 'ETCH', name: 'Etch' }],
    ['knowledge.catalog.updated', { code: 'ETCH', name: 'Etch 2', changes: { name: ['Etch', 'Etch 2'] } }],
    ['knowledge.catalog.deactivated', { code: 'ETCH', name: 'Etch' }],
    ['knowledge.catalog.reactivated', { code: 'ETCH', name: 'Etch' }],
  ] as const)('%s accepts code, name and optional changes', (type, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS[type].safeParse(detail).success).toBe(true);
  });

  it.each([
    ['an extra key', { code: 'A', name: 'B', note: 'x' }],
    ['a missing name', { code: 'A' }],
    ['a changes entry that is not a before/after pair', { code: 'A', name: 'B', changes: { name: ['x'] } }],
  ])('rejects %s', (_label, detail) => {
    expect(AUDIT_EVENT_DETAIL_SCHEMAS['knowledge.catalog.updated'].safeParse(detail).success).toBe(false);
  });
});
