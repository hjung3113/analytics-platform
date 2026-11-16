import { describe, expect, it } from 'vitest';
import type { PageConditionCategory, PageConditionGroupedOptionsResponse } from '@ap/contracts';
import { checkPageConditionOptions } from '../pageConditionOptions';
const label = { ko: '선택', en: 'Choices' };
const category: PageConditionCategory = { id: 'checks', label, kind: { type: 'groupedChecks', source: 'options', lists: [{ id: 'one', key: 'one', label }, { id: 'two', key: 'two', label }] } };
const option = { value: 'a', label };
describe('page condition option boundary', () => {
  it('accepts absent lists as empty, as in the S1 record schema', () => {
    const response = { groups: [{ id: 'g', label, lists: { one: [option] } }] };
    expect(checkPageConditionOptions(category, response)).toBe(response);
  });
  const invalidResponses: PageConditionGroupedOptionsResponse[] = [
    { groups: [{ id: 'g', label, lists: { one: [option], two: [option] } }] },
    { groups: [{ id: 'g', label, lists: { one: [option] } }, { id: 'h', label, lists: { two: [option] } }] },
    { groups: [{ id: 'g', label, lists: {} }, { id: 'g', label, lists: {} }] },
    { groups: [{ id: 'g', label, lists: { undeclared: [option] } }] },
  ];
  it.each(invalidResponses)('rejects duplicate values/groups or undeclared lists atomically: %j', response => {
    expect(() => checkPageConditionOptions(category, response)).toThrow();
  });
});
