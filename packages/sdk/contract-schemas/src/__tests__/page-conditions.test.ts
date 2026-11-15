import { describe, expect, expectTypeOf, it } from 'vitest';
import type { PageConditionOptionsResponse, PageConditionGroupedOptionsResponse } from '@ap/contracts';
import { z } from 'zod/v4';
import { SCHEMA_FILES } from '../index.ts';
import { pageConditionOptionsResponseSchema, pageConditionGroupedOptionsResponseSchema } from '../page-conditions.ts';

const option = { value: 'a', label: { ko: '가', en: 'A' }, disabledReason: { ko: '사용 불가', en: 'Unavailable' } };
describe('page condition option response parity', () => {
  it('matches the public types', () => {
    expectTypeOf<z.infer<typeof pageConditionOptionsResponseSchema>>().toEqualTypeOf<PageConditionOptionsResponse>();
    expectTypeOf<z.infer<typeof pageConditionGroupedOptionsResponseSchema>>().toEqualTypeOf<PageConditionGroupedOptionsResponse>();
  });
  it('accepts flat metadata and exposes truncation', () => {
    expect(pageConditionOptionsResponseSchema.parse({ options: [option], truncated: true })).toEqual({ options: [option], truncated: true });
  });
  it('rejects duplicate flat values and blank labels', () => {
    expect(pageConditionOptionsResponseSchema.safeParse({ options: [option, option] }).success).toBe(false);
    expect(pageConditionOptionsResponseSchema.safeParse({ options: [{ ...option, label: { ko: ' ', en: 'A' } }] }).success).toBe(false);
  });
  it('enforces uniqueness across every group and list in the category', () => {
    const group = { id: 'g', label: option.label, lists: { one: [option] } };
    expect(pageConditionGroupedOptionsResponseSchema.safeParse({ groups: [group] }).success).toBe(true);
    expect(pageConditionGroupedOptionsResponseSchema.safeParse({ groups: [group, { ...group, id: 'other' }] }).success).toBe(false);
    expect(pageConditionGroupedOptionsResponseSchema.safeParse({ groups: [{ ...group, lists: { one: [option], two: [option] } }] }).success).toBe(false);
  });
});

it('publishes both option response schemas in the release artifact catalog', () => {
  expect(SCHEMA_FILES.pageConditionOptionsResponse).toBe(pageConditionOptionsResponseSchema);
  expect(SCHEMA_FILES.pageConditionGroupedOptionsResponse).toBe(pageConditionGroupedOptionsResponseSchema);
});
