import { describe, expect, it } from 'vitest';
import { LOG_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS } from '../log-lifecycle.js';
const id = '00000000-0000-4000-8000-000000000001';
describe('diagnostic audit is body-free', () => {
  it.each([
    ['lifecycle.diagnostic.recorded', { attemptNo: 1, producer: 'synthetic', itemCount: 1 }],
    ['lifecycle.diagnostic.read', { attemptId: id, scope: 'list', count: 1 }],
    ['lifecycle.diagnostic.read', { attemptId: id, scope: 'item', itemKey: 'synthetic:item' }],
  ] as const)('%s accepts only its receipt', (event, detail) => {
    const schema = LOG_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS[event];
    expect(schema.safeParse(detail).success).toBe(true);
    for (const field of ['title', 'explanation', 'tables', 'fileRef', 'evidenceRefs']) expect(schema.safeParse({ ...detail, [field]: 'synthetic source body' }).success).toBe(false);
  });
});
