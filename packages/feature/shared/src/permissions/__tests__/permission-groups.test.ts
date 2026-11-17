import { expect, it } from 'vitest';
import { submitMoreInfoPermissionRequestBatchResultSchema } from '../groups.js';

it('validates the batch supplementation result with pending rows and current revisions', () => {
  const result = { batch_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', items: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'pending', revision: 3 }] };
  expect(submitMoreInfoPermissionRequestBatchResultSchema.parse(result)).toEqual(result);
  expect(submitMoreInfoPermissionRequestBatchResultSchema.safeParse({ ...result, items: [{ ...result.items[0], status: 'approved' }] }).success).toBe(false);
  expect(submitMoreInfoPermissionRequestBatchResultSchema.safeParse({ ...result, items: [{ ...result.items[0], revision: 0 }] }).success).toBe(false);
});
